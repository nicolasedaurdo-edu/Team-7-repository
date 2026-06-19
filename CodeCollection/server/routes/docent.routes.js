import express from 'express';
import jwt from 'jsonwebtoken';
import PDFDocument from 'pdfkit';

const router = express.Router();
console.log('Docent routes geladen');

router.get('/test', (req, res) => {
  res.json({ ok: true });
});

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Niet ingelogd' });
  }
  try {
    const token = authHeader.split(' ')[1];
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Ongeldige of verlopen sessie' });
  }
}

function requireDocent(req, res, next) {
  const rollen = req.user.rollen || (req.user.rol ? [req.user.rol] : []);
  if (!rollen.includes('docent')) {
    return res.status(403).json({ error: 'Geen toegang' });
  }
  next();
}

router.get('/studenten', requireAuth, requireDocent, async (req, res) => {
  const supabase = req.app.get('supabase');
  const docentId = req.user.id;

  const { data: stages, error: stagesError } = await supabase
    .from('stages')
    .select(`
      id,
      status,
      start_datum,
      eind_datum,
      student:gebruikers!student_id (
        id,
        voornaam,
        achternaam,
        email
      ),
      stagementor:gebruikers!stagementor_id (
        voornaam,
        achternaam
      ),
      stagevoorstel:stagevoorstellen!stagevoorstel_id (
        id,
        bedrijfsnaam,
        docent_ondertekend
      )
    `)
    .eq('docent_id', docentId);

  if (stagesError) {
    console.error('Fout bij ophalen stages:', stagesError);
    return res.status(500).json({ error: 'Kon studenten niet ophalen' });
  }

  if (!stages || stages.length === 0) {
    return res.json([]);
  }

  const stageIds = stages.map(s => s.id);
  const studentIds = stages.map(s => s.student?.id).filter(Boolean);

const { data: gebruikerOpleidingen } = await supabase
  .from('gebruiker_opleidingen')
  .select('gebruiker_id, opleidingen(naam)')
  .in('gebruiker_id', studentIds.length > 0 ? studentIds : [0]);

const opleidingPerStudent = {};
for (const go of gebruikerOpleidingen || []) {
  opleidingPerStudent[go.gebruiker_id] = go.opleidingen?.naam ?? '';
}

  const { data: logboeken } = await supabase
    .from('logboeken')
    .select('stage_id, week_nummer, afgetekend')
    .in('stage_id', stageIds)
    .order('week_nummer', { ascending: false });

  const logboekPerStage = {};
  for (const l of logboeken || []) {
    if (!logboekPerStage[l.stage_id]) {
      logboekPerStage[l.stage_id] = l;
    }
  }

  const result = stages.map(stage => {
    const logboek = logboekPerStage[stage.id];

    let logboekStatus = 'Niet ingediend';
    if (logboek) {
      logboekStatus = logboek.afgetekend
        ? `Week ${logboek.week_nummer} afgetekend`
        : `Week ${logboek.week_nummer} in afwachting`;
    }

    return {
      id: stage.student?.id,
      stage_id: stage.id,
      voornaam: stage.student?.voornaam ?? '',
      achternaam: stage.student?.achternaam ?? '',
      email: stage.student?.email ?? '',
      opleiding: opleidingPerStudent[stage.student?.id] ?? '',
      bedrijf: stage.stagevoorstel?.bedrijfsnaam ?? '',
      start_datum: stage.start_datum,
      eind_datum: stage.eind_datum,
      mentor_naam: stage.stagementor
        ? `${stage.stagementor.voornaam} ${stage.stagementor.achternaam}`.trim()
        : null,
      stagevoorstel_status: stage.status ?? 'Niet ingediend',
      logboek_status: logboekStatus,
      docent_ondertekend:   stage.stagevoorstel?.docent_ondertekend ?? false
    };
  });

  res.json(result);
});

async function getStageVoorDocent(supabase, studentId, docentId) {
  const { data, error } = await supabase
    .from('stages')
    .select('id, student_id, docent_id, stagementor_id, start_datum, eind_datum, status, stagevoorstel_id')
    .eq('student_id', studentId)
    .eq('docent_id', docentId)
    .single();

  if (error || !data) return null;
  return data;
}

router.get('/student/:studentId/info', requireAuth, requireDocent, async (req, res) => {
  const supabase = req.app.get('supabase');
  const studentId = req.params.studentId;
  const docentId = req.user.id;

  const stage = await getStageVoorDocent(supabase, studentId, docentId);
  if (!stage) return res.status(404).json({ error: 'Stage niet gevonden' });

  const { data: student } = await supabase
    .from('gebruikers')
    .select('id, voornaam, achternaam, email')
    .eq('id', studentId)
    .single();

const { data: opleidingKoppeling } = await supabase
  .from('gebruiker_opleidingen')
  .select('opleidingen(naam)')
  .eq('gebruiker_id', studentId)
  .maybeSingle();

const opleiding = opleidingKoppeling?.opleidingen ?? null;

  const { data: docent } = await supabase
    .from('gebruikers')
    .select('voornaam, achternaam')
    .eq('id', docentId)
    .single();

  const { data: voorstel } = await supabase
    .from('stagevoorstellen')
    .select('bedrijfsnaam')
    .eq('id', stage.stagevoorstel_id)
    .maybeSingle();

  res.json({
    stage_id: stage.id,
    student: {
      id: student?.id,
      voornaam: student?.voornaam ?? '',
      achternaam: student?.achternaam ?? '',
      email: student?.email ?? '',
      opleiding: opleiding?.naam ?? '',
    },
    stage: {
      start_datum: stage.start_datum,
      eind_datum: stage.eind_datum,
      status: stage.status,
      bedrijf: voorstel?.bedrijfsnaam ?? '',
    },
    docent: {
      naam: `${docent?.voornaam ?? ''} ${docent?.achternaam ?? ''}`.trim(),
    }
  });
});

router.get('/student/:studentId/logboek', requireAuth, requireDocent, async (req, res) => {
  const supabase = req.app.get('supabase');
  const studentId = req.params.studentId;
  const docentId = req.user.id;

  const stage = await getStageVoorDocent(supabase, studentId, docentId);
  if (!stage) return res.status(404).json({ error: 'Stage niet gevonden' });

  const { data: regels, error } = await supabase
    .from('logboeken')
    .select(`
      id, week_nummer, datum_van, taken, reflectie, leerpunten, uren_gemaakt, status, afgetekend, afgetekend_op,
      competenties_logboeken (
        competenties ( id, naam )
      )
    `)
    .eq('stage_id', stage.id)
    .neq('status', 'aangemaakt')
    .order('week_nummer', { ascending: true })
    .order('datum_van', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  const weken = {};
  for (const r of regels || []) {
    if (!weken[r.week_nummer]) {
      weken[r.week_nummer] = {
        nummer: r.week_nummer,
        status: r.afgetekend ? 'Afgetekend' : (r.status || 'Ingediend'),
        afgetekend: r.afgetekend,
        dagen: []
      };
    }

    const competenties = (r.competenties_logboeken || [])
      .map(cl => cl.competenties)
      .filter(Boolean);

    weken[r.week_nummer].dagen.push({
      id: r.id,
      datum: r.datum_van,
      taak: r.taken,
      reflectie: r.reflectie,
      leerpunten: r.leerpunten,
      uren: Number(r.uren_gemaakt) || 0,
      competenties
    });
  }

  res.json(Object.values(weken));
});

router.get('/student/:studentId/stagevoorstel', requireAuth, requireDocent, async (req, res) => {
  const supabase = req.app.get('supabase');
  const studentId = req.params.studentId;
  const docentId = req.user.id;

  const stage = await getStageVoorDocent(supabase, studentId, docentId);
  if (!stage) return res.status(404).json({ error: 'Stage niet gevonden' });

  const { data, error } = await supabase
    .from('stagevoorstellen')
    .select('*')
    .eq('id', stage.stagevoorstel_id)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });

  let mentor_voornaam = null;
  let mentor_achternaam = null;
  let mentor_email = null;

  if (stage.stagementor_id) {
    const { data: stagementor } = await supabase
      .from('gebruikers')
      .select('voornaam, achternaam, email')
      .eq('id', stage.stagementor_id)
      .maybeSingle();

    if (stagementor) {
      mentor_voornaam = stagementor.voornaam ?? null;
      mentor_achternaam = stagementor.achternaam ?? null;
      mentor_email = stagementor.email ?? null;
    }
  }

  res.json(data ? { ...data, mentor_voornaam, mentor_achternaam, mentor_email } : null);
});

router.get('/student/:studentId/evaluaties', requireAuth, requireDocent, async (req, res) => {
  const supabase = req.app.get('supabase');
  const studentId = req.params.studentId;
  const docentId = req.user.id;

  const stage = await getStageVoorDocent(supabase, studentId, docentId);
  if (!stage) return res.status(404).json({ error: 'Stage niet gevonden' });

  const { data, error } = await supabase
    .from('evaluaties')
    .select(`
      id, type, score, feedback, zichtbaar_voor_student, aangemaakt_op,
      competenties ( id, naam )
    `)
    .eq('stage_id', stage.id)
    .order('aangemaakt_op', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

router.get('/student/:studentId/documenten', requireAuth, requireDocent, async (req, res) => {
  const supabase = req.app.get('supabase');
  const studentId = req.params.studentId;
  const docentId = req.user.id;

  const stage = await getStageVoorDocent(supabase, studentId, docentId);
  if (!stage) return res.status(404).json({ error: 'Stage niet gevonden' });

  const docs = [];

  const { data: voorstel } = await supabase
    .from('stagevoorstellen')
    .select('id, bedrijfsnaam, indieningsdatum, ondertekend')
    .eq('id', stage.stagevoorstel_id)
    .maybeSingle();

  if (voorstel) {
    docs.push({
      type: 'stagevoorstel',
      naam: `Stagevoorstel - ${voorstel.bedrijfsnaam || 'onbekend bedrijf'}`,
      datum: voorstel.indieningsdatum,
      beschikbaar: true,
      meta: voorstel.ondertekend ? 'Ondertekend' : 'Niet ondertekend'
    });
  }

  const { data: eindEval } = await supabase
    .from('evaluaties')
    .select('id, score, aangemaakt_op')
    .eq('stage_id', stage.id)
    .eq('type', 'eindevaluatie')
    .maybeSingle();

  docs.push({
    type: 'eindevaluatie',
    naam: 'Eindevaluatie',
    datum: eindEval?.aangemaakt_op ?? null,
    beschikbaar: !!eindEval,
    meta: eindEval ? `Score: ${eindEval.score ?? '—'}` : 'Nog niet beschikbaar'
  });

  res.json(docs);
});

router.post('/student/:studentId/eindevaluatie/genereer', requireAuth, requireDocent, async (req, res) => {
  const supabase = req.app.get('supabase');
  const studentId = req.params.studentId;
  const docentId = req.user.id;

  const stage = await getStageVoorDocent(supabase, studentId, docentId);
  if (!stage) return res.status(404).json({ error: 'Stage niet gevonden' });

  try {
    const { data: student } = await supabase
      .from('gebruikers')
      .select('voornaam, achternaam, email')
      .eq('id', studentId)
      .single();

const { data: opleidingKoppeling } = await supabase
  .from('gebruiker_opleidingen')
  .select('opleidingen(naam)')
  .eq('gebruiker_id', studentId)
  .maybeSingle();

const opleiding = opleidingKoppeling?.opleidingen ?? null;

    const { data: voorstel } = await supabase
      .from('stagevoorstellen')
      .select('bedrijfsnaam')
      .eq('id', stage.stagevoorstel_id)
      .maybeSingle();

    const { data: docent } = await supabase
      .from('gebruikers')
      .select('voornaam, achternaam')
      .eq('id', docentId)
      .single();

    const { data: stagementor } = await supabase
      .from('gebruikers')
      .select('voornaam, achternaam')
      .eq('id', stage.stagementor_id)
      .maybeSingle();

    const { data: evaluaties } = await supabase
      .from('evaluaties')
      .select(`
        id, type, score, feedback, aangemaakt_op,
        competenties ( naam, percentage ),
        beoordelaar:gebruikers!beoordelaar_id ( voornaam, achternaam )
      `)
      .eq('stage_id', stage.id)
      .eq('beoordelaar_id', docentId)
      .order('type', { ascending: true })
      .order('aangemaakt_op', { ascending: true });

    const pdfBuffer = await genereerEindevaluatiePdf({
      student, opleiding, voorstel, docent, stagementor, stage, evaluaties: evaluaties || []
    });

    const path = `Eindevaluatie/eindevaluatie_stage_${stage.id}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from('stagebestanden')
      .upload(path, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadError) {
      console.error('Upload fout:', uploadError);
      return res.status(500).json({ error: 'Fout bij opslaan PDF: ' + uploadError.message });
    }

    res.json({ success: true, path });
  } catch (err) {
    console.error('Fout bij genereren PDF:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/student/:studentId/eindevaluatie/download', requireAuth, requireDocent, async (req, res) => {
  const supabase = req.app.get('supabase');
  const studentId = req.params.studentId;
  const docentId = req.user.id;

  const stage = await getStageVoorDocent(supabase, studentId, docentId);
  if (!stage) return res.status(404).json({ error: 'Stage niet gevonden' });

  const path = `Eindevaluatie/eindevaluatie_stage_${stage.id}.pdf`;
  const { data, error } = await supabase.storage
    .from('stagebestanden')
    .createSignedUrl(path, 3600);

  if (error || !data?.signedUrl) {
    return res.status(404).json({ error: 'PDF nog niet beschikbaar. Genereer eerst de eindevaluatie.' });
  }

  res.json({ url: data.signedUrl });
});

router.post('/student/:studentId/tussentijdsevaluatie/genereer', requireAuth, requireDocent, async (req, res) => {
  const supabase = req.app.get('supabase');
  const studentId = req.params.studentId;
  const docentId = req.user.id;

  const stage = await getStageVoorDocent(supabase, studentId, docentId);
  if (!stage) return res.status(404).json({ error: 'Stage niet gevonden' });

  try {
    const { data: student } = await supabase
      .from('gebruikers')
      .select('voornaam, achternaam, email')
      .eq('id', studentId)
      .single();

 const { data: opleidingKoppeling } = await supabase
  .from('gebruiker_opleidingen')
  .select('opleidingen(naam)')
  .eq('gebruiker_id', studentId)
  .maybeSingle();

const opleiding = opleidingKoppeling?.opleidingen ?? null;

    const { data: voorstel } = await supabase
      .from('stagevoorstellen')
      .select('bedrijfsnaam')
      .eq('id', stage.stagevoorstel_id)
      .maybeSingle();

    const { data: docent } = await supabase
      .from('gebruikers')
      .select('voornaam, achternaam')
      .eq('id', docentId)
      .single();

    const { data: stagementor } = await supabase
      .from('gebruikers')
      .select('voornaam, achternaam')
      .eq('id', stage.stagementor_id)
      .maybeSingle();

    const { data: evaluaties } = await supabase
      .from('evaluaties')
      .select(`
        id, type, score, feedback, aangemaakt_op,
        competenties ( naam, percentage ),
        beoordelaar:gebruikers!beoordelaar_id ( voornaam, achternaam )
      `)
      .eq('stage_id', stage.id)
      .eq('beoordelaar_id', docentId)
      .order('aangemaakt_op', { ascending: true });

    const pdfBuffer = await genereerTussentijdsevaluatiePdf({
      student, opleiding, voorstel, docent, stagementor, stage, evaluaties: evaluaties || []
    });

    const path = `Tussentijdsevaluatie/tussentijdsevaluatie_stage_${stage.id}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from('stagebestanden')
      .upload(path, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadError) {
      console.error('Upload fout:', uploadError);
      return res.status(500).json({ error: 'Fout bij opslaan PDF: ' + uploadError.message });
    }

    res.json({ success: true, path });
  } catch (err) {
    console.error('Fout bij genereren PDF:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/student/:studentId/tussentijdsevaluatie/download', requireAuth, requireDocent, async (req, res) => {
  const supabase = req.app.get('supabase');
  const studentId = req.params.studentId;
  const docentId = req.user.id;

  const stage = await getStageVoorDocent(supabase, studentId, docentId);
  if (!stage) return res.status(404).json({ error: 'Stage niet gevonden' });

  const path = `Tussentijdsevaluatie/tussentijdsevaluatie_stage_${stage.id}.pdf`;
  const { data, error } = await supabase.storage
    .from('stagebestanden')
    .createSignedUrl(path, 3600);

  if (error || !data?.signedUrl) {
    return res.status(404).json({ error: 'PDF nog niet beschikbaar. Genereer eerst de tussentijdsevaluatie.' });
  }

  res.json({ url: data.signedUrl });
});
router.get('/student/:studentId/stagevoorstel/download-pdf', requireAuth, requireDocent, async (req, res) => {
  const supabase = req.app.get('supabase')
  const { studentId } = req.params
  const docentId = req.user.id

  const stage = await getStageVoorDocent(supabase, studentId, docentId)
  if (!stage) return res.status(404).json({ error: 'Stage niet gevonden' })

  try {
    const token = req.headers.authorization.split(' ')[1]
    const internalRes = await fetch(
      `http://localhost:${process.env.PORT || 3000}/api/stagevoorstellen/${stage.id}/download-pdf`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!internalRes.ok) {
      const err = await internalRes.json()
      return res.status(internalRes.status).json(err)
    }
    const buffer = Buffer.from(await internalRes.arrayBuffer())
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="stagevoorstel_${stage.id}.pdf"`)
    res.send(buffer)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
});
async function genereerEindevaluatiePdf({ student, opleiding, voorstel, docent, stagementor, stage, evaluaties }) {
  const eindEvals = evaluaties.filter(e => (e.type || '').toLowerCase() === 'eindevaluatie');

  return genereerPdf({
    titel: 'Eindevaluatie',
    student, opleiding, voorstel, docent, stagementor, stage,
    evaluaties: eindEvals,
    toonGemiddelde: true,
    leegMelding: 'Geen eindevaluaties beschikbaar.'
  });
}

async function genereerTussentijdsevaluatiePdf({ student, opleiding, voorstel, docent, stagementor, stage, evaluaties }) {
  const tussenEvals = evaluaties.filter(e => (e.type || '').toLowerCase() === 'tussentijds');

  return genereerPdf({
    titel: 'Tussentijdsevaluatie',
    student, opleiding, voorstel, docent, stagementor, stage,
    evaluaties: tussenEvals,
    toonGemiddelde: true,
    leegMelding: 'Geen tussentijdse evaluaties beschikbaar.'
  });
}

async function genereerPdf({ titel, student, opleiding, voorstel, docent, stagementor, stage, evaluaties, toonGemiddelde, leegMelding }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(20).fillColor('#29a8e0').text(`STAGE.BE — ${titel}`, { align: 'center' });
      doc.fontSize(10).fillColor('#666').text('Erasmushogeschool Brussel', { align: 'center' });
      doc.moveDown(2);

      doc.fontSize(13).fillColor('#111').text('Studentgegevens', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor('#222');
      doc.text(`Naam: ${student?.voornaam ?? ''} ${student?.achternaam ?? ''}`);
      doc.text(`E-mail: ${student?.email ?? '—'}`);
      doc.text(`Opleiding: ${opleiding?.naam ?? '—'}`);
      doc.moveDown();

      doc.fontSize(13).fillColor('#111').text('Stagegegevens', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor('#222');
      doc.text(`Bedrijf: ${voorstel?.bedrijfsnaam ?? '—'}`);
      doc.text(`Periode: ${formatDate(stage.start_datum)} — ${formatDate(stage.eind_datum)}`);
      doc.text(`Docent: ${docent?.voornaam ?? ''} ${docent?.achternaam ?? ''}`);
      doc.text(`Stagementor: ${stagementor?.voornaam ?? '—'} ${stagementor?.achternaam ?? ''}`);
      doc.moveDown();

      if (evaluaties.length > 0) {
        doc.fontSize(13).fillColor('#111').text(titel, { underline: true });
        doc.moveDown(0.5);
        renderEvaluatieTabel(doc, evaluaties);
        doc.moveDown();

        if (toonGemiddelde) {
          const totaalGewogen = evaluaties.reduce((s, e) => {
            const score = Number(e.score || 0);
            const percent = Number(e.competenties?.percentage || 0);
            return s + (score / 5) * percent;
          }, 0);
          const totaalPercent = evaluaties.reduce((s, e) => s + Number(e.competenties?.percentage || 0), 0);

          const eindscore = totaalPercent > 0 ? ((totaalGewogen / totaalPercent) * 5).toFixed(2) : '0.00';
          const eindpercentage = totaalGewogen.toFixed(1);

          doc.moveDown(0.5);

          const boxY = doc.y;
          const boxX = 50;
          const boxBreedte = doc.page.width - 100;
          const boxHoogte = 100;

          doc.rect(boxX, boxY, boxBreedte, boxHoogte)
            .fillAndStroke('#f0f7fc', '#29a8e0');

          doc.fillColor('#111').fontSize(13).font('Helvetica-Bold')
            .text('Eindresultaat (gewogen)', boxX + 15, boxY + 10);

          doc.fillColor('#555').fontSize(10).font('Helvetica')
            .text(`Aantal beoordeelde competenties: ${evaluaties.length}`, boxX + 15, boxY + 32);

          doc.fillColor('#555').fontSize(10)
            .text(`Totaal gewicht: ${totaalPercent}%`, boxX + 15, boxY + 48);

          doc.fillColor('#555').fontSize(10)
            .text(`Behaalde score: ${eindpercentage}% van max ${totaalPercent}%`, boxX + 15, boxY + 64);

          doc.fillColor('#29a8e0').fontSize(22).font('Helvetica-Bold')
            .text(`${eindscore} / 5`, boxX + boxBreedte - 130, boxY + 25, { width: 115, align: 'right' });

          doc.fillColor('#555').fontSize(10).font('Helvetica')
            .text(`(${eindpercentage}%)`, boxX + boxBreedte - 130, boxY + 60, { width: 115, align: 'right' });

          doc.y = boxY + boxHoogte + 10;
          doc.moveDown();
        }
      } else {
        doc.fontSize(11).fillColor('#888').text(leegMelding);
        doc.moveDown();
      }

      doc.moveDown(2);
      doc.fontSize(9).fillColor('#888').text(
        `Gegenereerd op ${new Date().toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`,
        { align: 'center' }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function renderEvaluatieTabel(doc, evaluaties) {
  doc.fontSize(10).fillColor('#222');
  evaluaties.forEach(ev => {
    const comp = ev.competenties?.naam ?? '—';
    const percent = ev.competenties?.percentage ?? 0;
    const score = ev.score != null ? ev.score : '—';
    const beoord = ev.beoordelaar
      ? `${ev.beoordelaar.voornaam} ${ev.beoordelaar.achternaam}`.trim()
      : '—';
    const feedback = ev.feedback || '—';

    doc.font('Helvetica-Bold').text(`${comp}  —  Score: ${score}/5  (${percent}%)`);
    doc.fontSize(10).fillColor('#222').text(feedback, { width: 500 });
    doc.moveDown(0.6);
  });
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}


export default router;