import express from 'express';
import jwt from 'jsonwebtoken';

const router = express.Router();
console.log('Stagementor routes geladen');

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

function requireStagementor(req, res, next) {
  const rollen = req.user.rollen || (req.user.rol ? [req.user.rol] : []);
  if (!rollen.includes('stagementor')) {
    return res.status(403).json({ error: 'Geen toegang' });
  }
  next();
}


// Helper: haalt de stage op die bij deze mentor + student hoort
async function getStageVoorMentor(supabase, studentId, mentorId) {
  const { data, error } = await supabase
    .from('stages')
    .select('id, student_id, stagementor_id, start_datum, eind_datum, status, stagevoorstel_id')
    .eq('student_id', studentId)
    .eq('stagementor_id', mentorId)
    .single();

  if (error || !data) return null;
  return data;
}

// ── GET /api/stagementor/studenten ────────────────────────────────────────────
router.get('/studenten', requireAuth, requireStagementor, async (req, res) => {
  const supabase = req.app.get('supabase');
  const mentorId = req.user.id;

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
      stagevoorstel:stagevoorstellen!stagevoorstel_id (
        id,
        bedrijfsnaam,
        mentor_ondertekend
      )
    `)
    .eq('stagementor_id', mentorId);

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
  id:                   stage.student?.id,
  stage_id:             stage.id,
  voornaam:             stage.student?.voornaam   ?? '',
  achternaam:           stage.student?.achternaam ?? '',
  email:                stage.student?.email      ?? '',
  opleiding:            opleidingPerStudent[stage.student?.id] ?? '',
  bedrijf:              stage.stagevoorstel?.bedrijfsnaam ?? '',
  start_datum:          stage.start_datum,
  eind_datum:           stage.eind_datum,
  stagevoorstel_status: stage.status ?? 'Niet ingediend',
  logboek_status:       logboekStatus,
  mentor_ondertekend:   stage.stagevoorstel?.mentor_ondertekend ?? false
};
  });

  res.json(result);
});

// ── GET /api/stagementor/student/:studentId/info ─────────────────────────────
router.get('/student/:studentId/info', requireAuth, requireStagementor, async (req, res) => {
  const supabase = req.app.get('supabase');
  const studentId = req.params.studentId;
  const mentorId = req.user.id;

  const stage = await getStageVoorMentor(supabase, studentId, mentorId);
  if (!stage) return res.status(404).json({ error: 'Stage niet gevonden' });

  const { data: student } = await supabase
    .from('gebruikers')
    .select('id, voornaam, achternaam, email')
    .eq('id', studentId)
    .single();

  const { data: opleiding } = await supabase
    .from('opleidingen')
    .select('naam')
    .eq('gebruiker_id', studentId)
    .maybeSingle();

  const { data: mentor } = await supabase
    .from('gebruikers')
    .select('voornaam, achternaam')
    .eq('id', mentorId)
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
    mentor: {
      naam: `${mentor?.voornaam ?? ''} ${mentor?.achternaam ?? ''}`.trim(),
    }
  });
});

// ── GET /api/stagementor/student/:studentId/logboek ──────────────────────────
router.get('/student/:studentId/logboek', requireAuth, requireStagementor, async (req, res) => {
  const supabase = req.app.get('supabase');
  const studentId = req.params.studentId;
  const mentorId = req.user.id;

  const stage = await getStageVoorMentor(supabase, studentId, mentorId);
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
    .not('status', 'is', null)   // alleen regels die al een status hebben (= ingediend) tonen aan de mentor
    .neq('status', 'aangemaakt')
    .order('week_nummer', { ascending: true })
    .order('datum_van', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });

  const weken = {};
  for (const r of regels || []) {
    // dubbele check: nooit een regel tonen die niet ingediend is
    if (!r.status === 'aangemaakt') continue;

    if (!weken[r.week_nummer]) {
      let weekStatus = r.status;
      if (weekStatus === 'goedgekeurd') weekStatus = 'Goedgekeurd';
      else if (weekStatus === 'afgekeurd') weekStatus = 'Afgekeurd';
      else weekStatus = 'Ingediend';

      weken[r.week_nummer] = {
        nummer: r.week_nummer,
        status: weekStatus,
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

// ── GET /api/stagementor/student/:studentId/documenten ───────────────────────
router.get('/student/:studentId/documenten', requireAuth, requireStagementor, async (req, res) => {
  const supabase = req.app.get('supabase');
  const studentId = req.params.studentId;
  const mentorId = req.user.id;

  const stage = await getStageVoorMentor(supabase, studentId, mentorId);
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
    .eq('type', 'eind')
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

// ── POST .../logboek/week/:weekNummer/goedkeuren
router.post('/student/:studentId/logboek/week/:weekNummer/goedkeuren', requireAuth, requireStagementor, async (req, res) => {
  const supabase = req.app.get('supabase');
  const { studentId, weekNummer } = req.params;
  const mentorId = req.user.id;

  const stage = await getStageVoorMentor(supabase, studentId, mentorId);
  if (!stage) return res.status(404).json({ error: 'Stage niet gevonden' });

  const { error } = await supabase
    .from('logboeken')
    .update({ status: 'goedgekeurd', afgetekend: true, afgetekend_op: new Date().toISOString() })
    .eq('stage_id', stage.id)
    .eq('week_nummer', parseInt(weekNummer));

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ── POST .../logboek/week/:weekNummer/afkeuren
router.post('/student/:studentId/logboek/week/:weekNummer/afkeuren', requireAuth, requireStagementor, async (req, res) => {
  const supabase = req.app.get('supabase');
  const { studentId, weekNummer } = req.params;
  const mentorId = req.user.id;

  const stage = await getStageVoorMentor(supabase, studentId, mentorId);
  if (!stage) return res.status(404).json({ error: 'Stage niet gevonden' });

  const { error } = await supabase
    .from('logboeken')
    .update({ status: 'afgekeurd', afgetekend: false })
    .eq('stage_id', stage.id)
    .eq('week_nummer', parseInt(weekNummer));

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ── GET /api/stagementor/student/:studentId/eindevaluatie/download ─────────────
router.get('/student/:studentId/eindevaluatie/download', requireAuth, requireStagementor, async (req, res) => {
  const supabase = req.app.get('supabase');
  const studentId = req.params.studentId;
  const mentorId = req.user.id;

  const stage = await getStageVoorMentor(supabase, studentId, mentorId);
  if (!stage) return res.status(404).json({ error: 'Stage niet gevonden' });

  const path = `Eindevaluatie/eindevaluatie_stage_${stage.id}.pdf`;
  const { data, error } = await supabase.storage
    .from('stagebestanden')
    .createSignedUrl(path, 3600);

  if (error || !data?.signedUrl) {
    return res.status(404).json({ error: 'PDF nog niet beschikbaar.' });
  }

  res.json({ url: data.signedUrl });
});

// ── GET /api/stagementor/student/:studentId/tussentijdsevaluatie/download ────
router.get('/student/:studentId/tussentijdsevaluatie/download', requireAuth, requireStagementor, async (req, res) => {
  const supabase = req.app.get('supabase');
  const studentId = req.params.studentId;
  const mentorId = req.user.id;

  const stage = await getStageVoorMentor(supabase, studentId, mentorId);
  if (!stage) return res.status(404).json({ error: 'Stage niet gevonden' });

  const path = `Tussentijdsevaluatie/tussentijdsevaluatie_stage_${stage.id}.pdf`;
  const { data, error } = await supabase.storage
    .from('stagebestanden')
    .createSignedUrl(path, 3600);

  if (error || !data?.signedUrl) {
    return res.status(404).json({ error: 'PDF nog niet beschikbaar.' });
  }

  res.json({ url: data.signedUrl });
});
router.get('/student/:studentId/stagevoorstel/download-pdf', requireAuth, requireStagementor, async (req, res) => {
  const supabase = req.app.get('supabase')
  const { studentId } = req.params
  const docentId = req.user.id

  const stage = await getStageVoorMentor(supabase, studentId, docentId)
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

export default router;