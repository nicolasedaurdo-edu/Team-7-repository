import express from 'express';
import jwt from 'jsonwebtoken';

import multer from 'multer';
const upload = multer({ storage: multer.memoryStorage() });
import PDFDocument from 'pdfkit';

const router = express.Router();
console.log('Studentstagevoorstellen routes geladen');

router.get('/test', (req, res) => {
  res.json({ ok: true });
});


function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Geen token aanwezig' });
  }

  const token = authHeader.replace('Bearer ', '');
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Ongeldig token' });
  }
}

function generatePassword() {
  return Math.random().toString(36).slice(-10);
}
// ⬆️ Dit moet de EERSTE route zijn in het bestand, vóór router.get('/:stageId/...')
router.get('/student/documenten', verifyToken, async (req, res) => {
  const supabase = req.app.get('supabase')

  const { data: stages, error } = await supabase
    .from('stages')
    .select(`id, status, stagevoorstellen (bedrijfsnaam, indieningsdatum)`)
    .eq('student_id', req.user.id)
    .order('aangemaakt_op', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })

  const docs = []
  const stage = stages?.[0]

  if (stage) {
    const voorstel = stage.stagevoorstellen
    const geaccepteerd = ['stagevoorstel geaccepteerd', 'lopend', 'afgerond'].includes(stage.status)
    docs.push({
      type: 'stagevoorstel',
      naam: 'Stagevoorstel',
      meta: voorstel?.bedrijfsnaam || '—',
      datum: voorstel?.indieningsdatum || null,
      beschikbaar: geaccepteerd,
      stageId: stage.id,
      status: stage.status
    })
  }

  res.json({ docs, stage_id: stage?.id || null })
})

// GET /api/stagevoorstellen/mijn
router.get('/mijn', verifyToken, async (req, res) => {
  const supabase = req.app.get('supabase');

  const { data, error } = await supabase
    .from('stages')
    .select(`
      id, status, start_datum, eind_datum,
      docent_id, stagementor_id,
      stagevoorstellen (*),
      stagementor:gebruikers!stages_bedrijfsbegeleider_id_fkey (voornaam, achternaam, email)
    `)
    .eq('student_id', req.user.id)
    .order('aangemaakt_op', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

// ─── GET /:stageId/detail ────────────────────────────────────────────────────
router.get('/:stageId/detail', verifyToken, async (req, res) => {
  const supabase = req.app.get('supabase');
  const { stageId } = req.params;

  const { data: stage, error: stageError } = await supabase
    .from('stages')
    .select(`
      id, status, start_datum, eind_datum,
      student_id, docent_id, stagementor_id, stagevoorstel_id,
      stagevoorstellen (*)
    `)
    .eq('id', stageId)
    .single();

  if (stageError || !stage) {
    return res.status(404).json({ error: 'Stage niet gevonden' });
  }

const { data: student } = await supabase
  .from('gebruikers')
  .select('voornaam, achternaam, email')
  .eq('id', stage.student_id)
  .single();

  const { data: mentor } = await supabase
    .from('gebruikers')
    .select('voornaam, achternaam, email')
    .eq('id', stage.stagementor_id)
    .single();

  const { data: docent } = await supabase
    .from('gebruikers')
    .select('voornaam, achternaam, email')
    .eq('id', stage.docent_id)
    .single();

  const voorstel = stage.stagevoorstellen;
  const ondertekeningen = {
    student:     voorstel?.student_ondertekend ? voorstel.student_ondertekend_op : null,
    docent:      voorstel?.docent_ondertekend  ? voorstel.docent_ondertekend_op  : null,
    stagementor: voorstel?.mentor_ondertekend  ? voorstel.mentor_ondertekend_op  : null,
  };

  res.json({
    stage,
    stagevoorstel: voorstel,
    student:  student  || {},
    mentor:   mentor   || {},
    docent:   docent   || {},
    ondertekeningen,
  });
});

// ─── GET /:stageId/overeenkomst ───────────────────────────────────────────────
router.get('/:stageId/overeenkomst', verifyToken, async (req, res) => {
  const supabase = req.app.get('supabase');
  const { stageId } = req.params;

  const { data, error } = await supabase
    .from('stageovereenkomsten')
    .select('*')
    .eq('stage_id', stageId)
    .single();

  if (error || !data) return res.json({ overeenkomst: null });
  res.json({ overeenkomst: data });
});

// ─── GET /:stageId/overeenkomst/download ─────────────────────────────────────
router.get('/:stageId/overeenkomst/download', verifyToken, async (req, res) => {
  const supabase = req.app.get('supabase');
  const { stageId } = req.params;

  const { data: meta } = await supabase
    .from('stageovereenkomsten')
    .select('bestandspad, bestandsnaam')
    .eq('stage_id', stageId)
    .single();

  if (!meta) return res.status(404).json({ error: 'Geen overeenkomst gevonden.' });

  const { data, error } = await supabase.storage
    .from('stagebestanden')
    .download(meta.bestandspad);

  if (error) return res.status(500).json({ error: error.message });

  const buffer = Buffer.from(await data.arrayBuffer());
  res.setHeader('Content-Disposition', `attachment; filename="${meta.bestandsnaam}"`);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.send(buffer);
});

// ─── POST /:stageId/overeenkomst (upload) ────────────────────────────────────
router.post('/:stageId/overeenkomst', verifyToken, upload.single('overeenkomst'), async (req, res) => {
  const supabase = req.app.get('supabase');
  const { stageId } = req.params;

  try {
    // Debug logging
    console.log('Upload request received for stage:', stageId);
    console.log('Content-Type:', req.headers['content-type']);
    console.log('File present:', !!req.file);
    
    // Check of bestand bestaat
    if (!req.file) {
      console.error('No file in request. Body keys:', Object.keys(req.body));
      return res.status(400).json({ error: 'Geen bestand ontvangen. Zorg dat het veld "overeenkomst" heet.' });
    }

    const file = req.file;
    
    // Valideer bestandsgrootte (max 10MB)
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_SIZE) {
      return res.status(400).json({ error: 'Bestand is te groot. Maximaal 10MB toegestaan.' });
    }

    // Valideer bestandstype
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({ error: 'Alleen PDF, DOC en DOCX bestanden zijn toegestaan.' });
    }

    console.log(`Bestand ontvangen: ${file.originalname} (${file.size} bytes, ${file.mimetype})`);

    // 🔧 CHECK OF BUCKET BESTAAT
    try {
      const { data: buckets, error: listError } = await supabase.storage.listBuckets();
      
      if (listError) {
        console.error('Error listing buckets:', listError);
      }
      
      const bucketExists = buckets?.some(b => b.name === 'stagebestanden');
      
      if (!bucketExists) {
        console.log('📦 Bucket "stagebestanden" bestaat niet, wordt aangemaakt...');
        const { error: createError } = await supabase.storage.createBucket('stagebestanden', {
          public: true,
          file_size_limit: 10485760,
          allowed_mime_types: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
        });
        
        if (createError) {
          console.error('Error creating bucket:', createError);
          return res.status(500).json({ error: 'Kon storage bucket niet aanmaken: ' + createError.message });
        }
        console.log('✅ Bucket "stagebestanden" succesvol aangemaakt!');
      } else {
        console.log('✅ Bucket "stagebestanden" bestaat al.');
      }
    } catch (bucketError) {
      console.error('Bucket check error:', bucketError);
    }

    // Genereer uniek bestandspad
    const timestamp = Date.now();
    const safeFilename = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const bestandspad = `overeenkomsten/${stageId}/${timestamp}_${safeFilename}`;

    console.log('📤 Uploaden naar:', bestandspad);

    // Upload naar Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('stagebestanden')
      .upload(bestandspad, file.buffer, { 
        contentType: file.mimetype,
        cacheControl: '3600'
      });

    if (uploadError) {
      console.error('Supabase upload error:', uploadError);
      return res.status(500).json({ error: 'Fout bij uploaden naar storage: ' + uploadError.message });
    }

    console.log('✅ Upload naar storage gelukt!');

    // Opslaan in database
    const { error: dbError } = await supabase.from('stageovereenkomsten').upsert({
      stage_id: stageId,
      bestandspad,
      bestandsnaam: file.originalname,
      upload_datum: new Date().toISOString(),
      geupload_door: req.user.id,
    }, { onConflict: 'stage_id' });

    if (dbError) {
      console.error('Database error:', dbError);
      // Probeer het geüploade bestand te verwijderen als de database insert faalt
      await supabase.storage.from('stagebestanden').remove([bestandspad]);
      return res.status(500).json({ error: 'Fout bij opslaan in database: ' + dbError.message });
    }

    console.log('✅ Database update succesvol!');
    res.json({ 
      success: true, 
      message: 'Bestand succesvol geüpload',
      bestand: {
        naam: file.originalname,
        grootte: file.size,
        type: file.mimetype
      }
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Interne server fout: ' + error.message });
  }
});


// ─── GET /:stageId/download-pdf ──────────────────────────────────────────────
router.get('/:stageId/download-pdf', verifyToken, async (req, res) => {
  const supabase = req.app.get('supabase');
  const { stageId } = req.params;

  try {
    // Eerst de stage ophalen met alle data
    const { data: stage, error: stageError } = await supabase
      .from('stages')
      .select(`
        id, 
        status, 
        start_datum, 
        eind_datum, 
        student_id, 
        docent_id, 
        stagementor_id, 
        stagevoorstel_id
      `)
      .eq('id', stageId)
      .single();

    if (stageError || !stage) {
      console.error('Stage niet gevonden:', stageError);
      return res.status(404).json({ error: 'Stage niet gevonden' });
    }

    console.log('Stage gevonden:', stage);
    console.log('Stagevoorstel ID:', stage.stagevoorstel_id);

    // Haal het stagevoorstel apart op
    const { data: voorstel, error: voorstelError } = await supabase
      .from('stagevoorstellen')
      .select('*')
      .eq('id', stage.stagevoorstel_id)
      .single();

    if (voorstelError) {
      console.error('Voorstel fetch error:', voorstelError);
    } else {
      console.log('Voorstel gevonden:', voorstel);
    }

const { data: student, error: studentError } = await supabase
  .from('gebruikers')
  .select('voornaam, achternaam, email')
  .eq('id', stage.student_id)
  .single();

if (studentError) {
  console.error('Student fetch error:', studentError);
} else {
  console.log('Student gevonden:', student);
}

const { data: studentOpleiding } = await supabase
  .from('gebruiker_opleidingen')
  .select('opleidingen(naam)')
  .eq('gebruiker_id', stage.student_id)
  .maybeSingle();

const opleidingNaam = studentOpleiding?.opleidingen?.naam || '—';

    if (studentError) {
      console.error('Student fetch error:', studentError);
    } else {
      console.log('Student gevonden:', student);
    }

    // Haal mentorgegevens op
    const { data: mentor, error: mentorError } = await supabase
      .from('gebruikers')
      .select('voornaam, achternaam, email')
      .eq('id', stage.stagementor_id)
      .single();

    if (mentorError) {
      console.error('Mentor fetch error:', mentorError);
    } else {
      console.log('Mentor gevonden:', mentor);
    }

    // Haal docentgegevens op (kan null zijn)
    let docent = null;
    if (stage.docent_id) {
      const { data: docentData, error: docentError } = await supabase
        .from('gebruikers')
        .select('voornaam, achternaam, email')
        .eq('id', stage.docent_id)
        .single();

      if (!docentError) {
        docent = docentData;
        console.log('Docent gevonden:', docent);
      }
    }
    
    // Ondertekeningen check
    const ondertekeningen = {
      student:     voorstel?.student_ondertekend  ? voorstel.student_ondertekend_op  : null,
      docent:      voorstel?.docent_ondertekend   ? voorstel.docent_ondertekend_op   : null,
      stagementor: voorstel?.mentor_ondertekend   ? voorstel.mentor_ondertekend_op   : null,
    };

    // Als er geen voorstel is, gebruik lege waarden
    const voorstelData = voorstel || {};

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="stagevoorstel_${stageId}.pdf"`);
    res.setHeader('Cache-Control', 'no-cache');
    
    doc.pipe(res);

    const blauw = '#29a8e0';
    const donker = '#111111';
    const grijs = '#555555';
    const lichtgrijs = '#e4e4e4';

    const formatDatum = (d) => d ? new Date(d).toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
    const formatHandtekening = (ts) => ts ? new Date(ts).toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Nog niet ondertekend';
    const berekenWeken = (start, eind) => (!start || !eind) ? '?' : Math.round((new Date(eind) - new Date(start)) / (1000 * 60 * 60 * 24 * 7));
    const parseTags = (raw) => raw ? raw.split(/[,\n]+/).map(s => s.trim()).filter(Boolean) : [];

    // Resolved opleiding naam (via join) with fallback


    // Header
    doc.rect(0, 0, doc.page.width, 70).fill(blauw);
    doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold').text('STAGE.BE', 50, 22);
    doc.fontSize(10).font('Helvetica').text('Stagevoorstel', 50, 48);
    doc.fillColor(donker);

    // Student info
    let y = 90;
    const studentNaam = `Stageovereenkomst ${student?.voornaam || ''} ${student?.achternaam || ''}`.trim() || 'Onbekende student';
    const studentEmail = student?.email || 'Geen e-mail opgegeven';
    
    doc.fontSize(18).font('Helvetica-Bold').fillColor(donker).text(studentNaam, 50, y);
    y += 22;
    doc.fontSize(10).font('Helvetica').fillColor(grijs).text(opleidingNaam, 50, y);
    y += 14;
    doc.fontSize(10).fillColor(grijs).text(studentEmail, 50, y);


    y += 24;
    doc.moveTo(50, y).lineTo(doc.page.width - 50, y).strokeColor(lichtgrijs).lineWidth(1).stroke();
    y += 16;

    // Sectie helper
    const sectie = (titel, inhoudFn) => {
      if (y > doc.page.height - 120) { doc.addPage(); y = 50; }
      doc.rect(50, y, doc.page.width - 100, 26).fill(lichtgrijs);
      doc.fillColor(donker).fontSize(11).font('Helvetica-Bold').text(titel, 58, y + 7);
      y += 34;
      doc.font('Helvetica').fontSize(10).fillColor(donker);
      inhoudFn();
      y += 12;
      doc.moveTo(50, y).lineTo(doc.page.width - 50, y).strokeColor(lichtgrijs).lineWidth(0.5).stroke();
      y += 12;
    };

    const veld = (label, waarde) => {
      if (y > doc.page.height - 80) { doc.addPage(); y = 50; }
      doc.fillColor(grijs).fontSize(8).font('Helvetica-Bold').text(label.toUpperCase(), 58, y);
      y += 12;
      const displayValue = waarde || '—';
      doc.fillColor(donker).fontSize(10).font('Helvetica').text(displayValue, 58, y, { width: doc.page.width - 116 });
      y += doc.heightOfString(displayValue, { width: doc.page.width - 116 }) + 8;
    };

    sectie('Gegevens bedrijf', () => {
      veld('Bedrijfsnaam', voorstelData.bedrijfsnaam);
      veld('Stagementor', `${mentor?.voornaam || ''} ${mentor?.achternaam || ''}`.trim() || '—');
      veld('E-mail stagementor', mentor?.email);
    });

    sectie('Gegevens student', () => {
      veld('Naam', `${student?.voornaam || ''} ${student?.achternaam || ''}`.trim() || '—');
      veld('E-mail', student?.email || '—');
      veld('Opleiding', opleidingNaam);
    });

    sectie('Gegevens docent', () => {
      veld('Naam', docent ? `${docent.voornaam} ${docent.achternaam}` : '—');
      veld('E-mail', docent?.email || '—');
    });

    sectie('Stageperiode', () => {
      veld('Begindatum', formatDatum(stage.start_datum));
      veld('Einddatum', formatDatum(stage.eind_datum));
      veld('Duur', `${berekenWeken(stage.start_datum, stage.eind_datum)} weken`);
    });

    sectie('Adres', () => {
      veld('Straat', `${voorstelData.straat || '—'} ${voorstelData.huisnummer || ''}`.trim());
      veld('Gemeente', voorstelData.gemeente || '—');
      veld('Land', voorstelData.land || '—');
    });

    sectie('Beschrijving stageopdracht', () => {
      if (y > doc.page.height - 80) { doc.addPage(); y = 50; }
      const tekst = voorstelData.beschrijving || 'Geen beschrijving opgegeven.';
      doc.fillColor(donker).fontSize(10).font('Helvetica').text(tekst, 58, y, { width: doc.page.width - 116, align: 'justify' });
      y += doc.heightOfString(tekst, { width: doc.page.width - 116 }) + 4;
    });

    sectie('Competenties', () => {
      veld('Technische skills', parseTags(voorstelData.technische_skills).join(', ') || '—');
      veld('Tools', parseTags(voorstelData.tools).join(', ') || '—');
    });

     
    // ─── ONDERTEKENINGEN ────────────────────────────────────────────────────
    {
      const labels = ['Ondertekening docent', 'Ondertekening student', 'Ondertekening stagementor'];
      const gap = 15;
      const boxWidth = (doc.page.width - 100 - gap * (labels.length - 1)) / labels.length;
      const boxHeight = 70;
      const benodigdeRuimte = 26 + boxHeight + 20; // titelbalk + box + labelruimte
 
      if (y + benodigdeRuimte > doc.page.height - 50) { doc.addPage(); y = 50; }
 
      doc.rect(50, y, doc.page.width - 100, 26).fill(lichtgrijs);
      doc.fillColor(donker).fontSize(11).font('Helvetica-Bold').text('Ondertekeningen', 58, y + 7);
      y += 34;
 
      const boxY = y;
      labels.forEach((label, i) => {
        const x = 50 + i * (boxWidth + gap);
        doc.rect(x, boxY, boxWidth, boxHeight).strokeColor(lichtgrijs).lineWidth(1).stroke();
        doc.fillColor(grijs).fontSize(8).font('Helvetica-Bold')
          .text(label.toUpperCase(), x, boxY + boxHeight + 4, { width: boxWidth, align: 'center' });
      });
 
      y = boxY + boxHeight + 18;
    }
 


    // ─── FOOTER ──────────────────────────────────────────────────────────────
    // Check of er genoeg ruimte is voor de footer op de huidige pagina
    const footerHeight = 50;
    const heeftRuimteVoorFooter = y < doc.page.height - footerHeight;

    if (!heeftRuimteVoorFooter) {
      doc.addPage();
    }

    // Teken de footer op de huidige pagina (of de nieuwe pagina)
    const footerYPos = doc.page.height - 40;
    doc.moveTo(50, footerYPos - 8).lineTo(doc.page.width - 50, footerYPos - 8).strokeColor(lichtgrijs).lineWidth(0.5).stroke();
    doc.fillColor(grijs).fontSize(8).font('Helvetica')
       .text(`Gegenereerd op ${formatDatum(new Date().toISOString())} via STAGE.BE`, 50, footerYPos, { align: 'center', width: doc.page.width - 100 });

       doc.end();

  } catch (err) {
    console.error('PDF generatie fout:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'PDF kon niet worden gegenereerd: ' + err.message });
    }
  }
});

// POST /api/stagevoorstellen
router.post('/', verifyToken, async (req, res) => {
  const supabase = req.app.get('supabase');

  const {
    bedrijfsnaam, voornaam_stagementor, achternaam_stagementor, email_stagementor,
    stage_begin, stage_einde, beschrijving,
    technische_skills, tools, straat, huisnummer, gemeente, land
  } = req.body;

  if (!bedrijfsnaam || !stage_begin || !stage_einde || !beschrijving ||
      !voornaam_stagementor || !achternaam_stagementor || !email_stagementor || !straat || !gemeente) {
    return res.status(400).json({ error: 'Verplichte velden ontbreken' });
  }

  // Stagementor zoeken of aanmaken
  let stagementorId;
  const { data: bestaandeMentor } = await supabase
    .from('gebruikers')
    .select('id')
    .eq('email', email_stagementor)
    .single();

  if (bestaandeMentor) {
    stagementorId = bestaandeMentor.id;
  } else {
    const { data: nieuweMentor, error: mentorError } = await supabase
      .from('gebruikers')
      .insert([{
        voornaam: voornaam_stagementor,
        achternaam: achternaam_stagementor,
        email: email_stagementor,
        wachtwoord_hash: "not yet activated",
        rol: 'stagementor',
        actief: false
      }])
      .select()
      .single();

    if (mentorError) {
      return res.status(500).json({ error: 'Fout stagementor: ' + mentorError.message });
    }
    stagementorId = nieuweMentor.id;
  }

  // Stagevoorstel aanmaken
  const { data: voorstel, error: voorstelError } = await supabase
    .from('stagevoorstellen')
    .insert([{
      bedrijfsnaam, beschrijving, technische_skills, tools,
      straat, huisnummer, gemeente, land,
      indieningsdatum: new Date().toISOString()
    }])
    .select()
    .single();

  if (voorstelError) {
    return res.status(500).json({ error: 'Fout voorstel: ' + voorstelError.message });
  }

  // Stage aanmaken
  const { data: stage, error: stageError } = await supabase
    .from('stages')
    .insert([{
      student_id: req.user.id,
      stagevoorstel_id: voorstel.id,
      stagementor_id: stagementorId,
      docent_id: null,
      status: 'stagevoorstel ingediend',
      start_datum: stage_begin,
      eind_datum: stage_einde
    }])
    .select()
    .single();

  if (stageError) {
    return res.status(500).json({ error: 'Fout stage: ' + stageError.message });
  }

  res.json({ stage, voorstel });
});

// PUT /api/stagevoorstellen/:id - update voorstel (na aanpassingen vereist)
router.put('/:id', verifyToken, async (req, res) => {
  const supabase = req.app.get('supabase');
  const stageId = req.params.id;

  const {
    bedrijfsnaam, stage_begin, stage_einde, beschrijving,
    technische_skills, tools, straat, huisnummer, gemeente, land
  } = req.body;

  const { data: stage, error: findError } = await supabase
    .from('stages')
    .select('id, student_id, stagevoorstel_id, status')
    .eq('id', stageId)
    .single();

  if (findError || !stage) {
    return res.status(404).json({ error: 'Stage niet gevonden' });
  }

  if (stage.student_id !== req.user.id) {
    return res.status(403).json({ error: 'Geen toegang' });
  }

  if (stage.status !== 'stagevoorstel aanpassingen vereist') {
    return res.status(400).json({ error: 'Niet aanpasbaar in deze status' });
  }

  const { error: voorstelError } = await supabase
    .from('stagevoorstellen')
    .update({
      bedrijfsnaam, beschrijving, technische_skills, tools,
      straat, huisnummer, gemeente, land,
      indieningsdatum: new Date().toISOString()
    })
    .eq('id', stage.stagevoorstel_id);

  if (voorstelError) {
    return res.status(500).json({ error: voorstelError.message });
  }

  const { data: updatedStage, error: stageError } = await supabase
    .from('stages')
    .update({
      start_datum: stage_begin,
      eind_datum: stage_einde,
      status: 'stagevoorstel ingediend'
    })
    .eq('id', stageId)
    .select()
    .single();

  if (stageError) {
    return res.status(500).json({ error: stageError.message });
  }

  res.json(updatedStage);
});

// DELETE /api/stagevoorstellen/:id - apaga voorstel recusado
router.delete('/:id', verifyToken, async (req, res) => {
  const supabase = req.app.get('supabase');
  const stageId = req.params.id;

  // Verifica que o stage pertence ao utilizador e está geweigerd
  const { data: stage, error: findError } = await supabase
    .from('stages')
    .select('id, student_id, stagevoorstel_id, status')
    .eq('id', stageId)
    .single();

  if (findError || !stage) {
    return res.status(404).json({ error: 'Stage niet gevonden' });
  }

  if (stage.student_id !== req.user.id) {
    return res.status(403).json({ error: 'Geen toegang' });
  }

  if (stage.status !== 'stagevoorstel geweigerd') {
    return res.status(400).json({ error: 'Alleen geweigerde voorstellen kunnen verwijderd worden' });
  }

  // 1. Apagar a stage primeiro (filho)
  const { error: stageDelError } = await supabase
    .from('stages')
    .delete()
    .eq('id', stageId);

  if (stageDelError) {
    return res.status(500).json({ error: stageDelError.message });
  }

  // 2. Apagar o stagevoorstel (pai)
  const { error: voorstelDelError } = await supabase
    .from('stagevoorstellen')
    .delete()
    .eq('id', stage.stagevoorstel_id);

  if (voorstelDelError) {
    return res.status(500).json({ error: voorstelDelError.message });
  }

  res.json({ success: true });
});
router.get('/mijn', verifyToken, async (req, res) => {
  const supabase = req.app.get('supabase');

  const { data, error } = await supabase
    .from('stages')
    .select(`
      id, status, start_datum, eind_datum,
      docent_id, stagementor_id,
      stagevoorstellen (*),
      stagementor:gebruikers!stages_bedrijfsbegeleider_id_fkey (voornaam, achternaam, email)
    `)
    .eq('student_id', req.user.id)
    .order('aangemaakt_op', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

// ─── 2. POST / (nieuw voorstel) ──────────────────────────────────────────────
router.post('/', verifyToken, async (req, res) => {
  const supabase = req.app.get('supabase');

  const {
    bedrijfsnaam, voornaam_stagementor, achternaam_stagementor, email_stagementor,
    stage_begin, stage_einde, beschrijving,
    technische_skills, tools, straat, huisnummer, gemeente, land
  } = req.body;

  if (!bedrijfsnaam || !stage_begin || !stage_einde || !beschrijving ||
      !voornaam_stagementor || !achternaam_stagementor || !email_stagementor || !straat || !gemeente) {
    return res.status(400).json({ error: 'Verplichte velden ontbreken' });
  }

  let stagementorId;
  const { data: bestaandeMentor } = await supabase
    .from('gebruikers')
    .select('id')
    .eq('email', email_stagementor)
    .single();

  if (bestaandeMentor) {
    stagementorId = bestaandeMentor.id;
  } else {
    const { data: nieuweMentor, error: mentorError } = await supabase
      .from('gebruikers')
      .insert([{
        voornaam: voornaam_stagementor,
        achternaam: achternaam_stagementor,
        email: email_stagementor,
        wachtwoord_hash: generatePassword(),
        rol: 'stagementor',
        actief: false
      }])
      .select()
      .single();

    if (mentorError) {
      return res.status(500).json({ error: 'Fout stagementor: ' + mentorError.message });
    }
    stagementorId = nieuweMentor.id;
  }

  const { data: voorstel, error: voorstelError } = await supabase
    .from('stagevoorstellen')
    .insert([{
      bedrijfsnaam, beschrijving, technische_skills, tools,
      straat, huisnummer, gemeente, land,
      indieningsdatum: new Date().toISOString()
    }])
    .select()
    .single();

  if (voorstelError) {
    return res.status(500).json({ error: 'Fout voorstel: ' + voorstelError.message });
  }

  const { data: stage, error: stageError } = await supabase
    .from('stages')
    .insert([{
      student_id: req.user.id,
      stagevoorstel_id: voorstel.id,
      stagementor_id: stagementorId,
      docent_id: null,
      status: 'stagevoorstel ingediend',
      start_datum: stage_begin,
      eind_datum: stage_einde
    }])
    .select()
    .single();

  if (stageError) {
    return res.status(500).json({ error: 'Fout stage: ' + stageError.message });
  }

  res.json({ stage, voorstel });
});

// ─── 3. SIGNING ROUTES (specific, before /:id) ───────────────────────────────
router.post('/:stageId/ondertekenen/student', verifyToken, async (req, res) => {
  const supabase = req.app.get('supabase');
  const { stageId } = req.params;
  try {
    const { data: stage, error: stageError } = await supabase
      .from('stages')
      .select('stagevoorstel_id')
      .eq('id', stageId)
      .single();

    if (stageError || !stage) throw new Error('Stage niet gevonden.');

    const { error } = await supabase
      .from('stagevoorstellen')
      .update({ student_ondertekend: true, student_ondertekend_op: new Date().toISOString() })
      .eq('id', stage.stagevoorstel_id);
    if (error) throw error;
    res.json({ message: 'Student ondertekening gelukt.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:stageId/ondertekenen/docent', verifyToken, async (req, res) => {
  const supabase = req.app.get('supabase');
  const { stageId } = req.params;
  try {
    const { data: stage, error: stageError } = await supabase
      .from('stages')
      .select('stagevoorstel_id')
      .eq('id', stageId)
      .single();

    if (stageError || !stage) throw new Error('Stage niet gevonden.');

    const { error } = await supabase
      .from('stagevoorstellen')
      .update({ docent_ondertekend: true, docent_ondertekend_op: new Date().toISOString() })
      .eq('id', stage.stagevoorstel_id);
    if (error) throw error;
    res.json({ message: 'Docent ondertekening gelukt.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:stageId/ondertekenen/stagementor', verifyToken, async (req, res) => {
  const supabase = req.app.get('supabase');
  const { stageId } = req.params;
  try {
    const { data: stage, error: stageError } = await supabase
      .from('stages')
      .select('stagevoorstel_id')
      .eq('id', stageId)
      .single();

    if (stageError || !stage) throw new Error('Stage niet gevonden.');

    const { error } = await supabase
      .from('stagevoorstellen')
      .update({ mentor_ondertekend: true, mentor_ondertekend_op: new Date().toISOString() })
      .eq('id', stage.stagevoorstel_id);
    if (error) throw error;
    res.json({ message: 'Mentor ondertekening gelukt.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 4. PUT /:id ─────────────────────────────────────────────────────────────
router.put('/:id', verifyToken, async (req, res) => {
  const supabase = req.app.get('supabase');
  const stageId = req.params.id;

  const {
    bedrijfsnaam, stage_begin, stage_einde, beschrijving,
    technische_skills, tools, straat, huisnummer, gemeente, land
  } = req.body;

  const { data: stage, error: findError } = await supabase
    .from('stages')
    .select('id, student_id, stagevoorstel_id, status')
    .eq('id', stageId)
    .single();

  if (findError || !stage) {
    return res.status(404).json({ error: 'Stage niet gevonden' });
  }

  if (stage.student_id !== req.user.id) {
    return res.status(403).json({ error: 'Geen toegang' });
  }

  if (stage.status !== 'stagevoorstel aanpassingen vereist') {
    return res.status(400).json({ error: 'Niet aanpasbaar in deze status' });
  }

  const { error: voorstelError } = await supabase
    .from('stagevoorstellen')
    .update({
      bedrijfsnaam, beschrijving, technische_skills, tools,
      straat, huisnummer, gemeente, land,
      indieningsdatum: new Date().toISOString()
    })
    .eq('id', stage.stagevoorstel_id);

  if (voorstelError) {
    return res.status(500).json({ error: voorstelError.message });
  }

  const { data: updatedStage, error: stageError } = await supabase
    .from('stages')
    .update({
      start_datum: stage_begin,
      eind_datum: stage_einde,
      status: 'stagevoorstel ingediend'
    })
    .eq('id', stageId)
    .select()
    .single();

  if (stageError) {
    return res.status(500).json({ error: stageError.message });
  }

  res.json(updatedStage);
});

// ─── 5. DELETE /:id ──────────────────────────────────────────────────────────
router.delete('/:id', verifyToken, async (req, res) => {
  const supabase = req.app.get('supabase');
  const stageId = req.params.id;

  const { data: stage, error: findError } = await supabase
    .from('stages')
    .select('id, student_id, stagevoorstel_id, status')
    .eq('id', stageId)
    .single();

  if (findError || !stage) {
    return res.status(404).json({ error: 'Stage niet gevonden' });
  }

  if (stage.student_id !== req.user.id) {
    return res.status(403).json({ error: 'Geen toegang' });
  }

  if (stage.status !== 'stagevoorstel geweigerd') {
    return res.status(400).json({ error: 'Alleen geweigerde voorstellen kunnen verwijderd worden' });
  }

  const { error: stageDelError } = await supabase
    .from('stages')
    .delete()
    .eq('id', stageId);

  if (stageDelError) {
    return res.status(500).json({ error: stageDelError.message });
  }

  const { error: voorstelDelError } = await supabase
    .from('stagevoorstellen')
    .delete()
    .eq('id', stage.stagevoorstel_id);

  if (voorstelDelError) {
    return res.status(500).json({ error: voorstelDelError.message });
  }

  res.json({ success: true });
});

// ─── GET /api/stagevoorstellen/:stageId/eindevaluatie/download ───────────────
router.get('/:stageId/eindevaluatie/download', verifyToken, async (req, res) => {
  const supabase = req.app.get('supabase');
  const { stageId } = req.params;

  // Verifica que esta stage pertence ao student logado
  const { data: stage, error } = await supabase
    .from('stages')
    .select('id, student_id')
    .eq('id', stageId)
    .single();

  if (error || !stage) {
    return res.status(404).json({ error: 'Stage niet gevonden' });
  }

  if (stage.student_id !== req.user.id) {
    return res.status(403).json({ error: 'Geen toegang' });
  }

  const path = `Eindevaluatie/eindevaluatie_stage_${stage.id}.pdf`;
  const { data, error: storageError } = await supabase.storage
    .from('stagebestanden')
    .createSignedUrl(path, 3600);

  if (storageError || !data?.signedUrl) {
    return res.status(404).json({ error: 'PDF nog niet beschikbaar. De docent moet eerst de eindevaluatie genereren.' });
  }

  res.json({ url: data.signedUrl });
});

// ─── GET /api/stagevoorstellen/:stageId/tussentijdsevaluatie/download ────────
router.get('/:stageId/tussentijdsevaluatie/download', verifyToken, async (req, res) => {
  const supabase = req.app.get('supabase');
  const { stageId } = req.params;

  const { data: stage, error } = await supabase
    .from('stages')
    .select('id, student_id')
    .eq('id', stageId)
    .single();

  if (error || !stage) {
    return res.status(404).json({ error: 'Stage niet gevonden' });
  }

  if (stage.student_id !== req.user.id) {
    return res.status(403).json({ error: 'Geen toegang' });
  }

  const path = `Tussentijdsevaluatie/tussentijdsevaluatie_stage_${stage.id}.pdf`;
  const { data, error: storageError } = await supabase.storage
    .from('stagebestanden')
    .createSignedUrl(path, 3600);

  if (storageError || !data?.signedUrl) {
    return res.status(404).json({ error: 'PDF nog niet beschikbaar. De docent moet eerst de tussentijdsevaluatie genereren.' });
  }

  res.json({ url: data.signedUrl });
});

export default router;