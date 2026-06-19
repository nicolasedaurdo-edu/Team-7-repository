import express from 'express';
import jwt from 'jsonwebtoken';

const router = express.Router();

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

// GET /api/stagementor/competenties
// GET /api/stagementor/competenties?student_id=...
router.get('/competenties', requireAuth, requireStagementor, async (req, res) => {
  const supabase = req.app.get('supabase');
  const studentId = req.query.student_id;

  if (!studentId) {
    return res.status(400).json({ error: 'student_id is verplicht' });
  }

  // Stap 1: haal de opleiding_id van de student op
  // Eerst via gebruiker_opleidingen (koppeltabel), anders fallback naar gebruikers.opleiding_id
  const { data: koppeling } = await supabase
    .from('gebruiker_opleidingen')
    .select('opleiding_id')
    .eq('gebruiker_id', studentId)
    .maybeSingle();

  let opleidingId = koppeling?.opleiding_id;

  if (!opleidingId) {
    // Fallback: rechtstreeks op gebruikers tabel
const { data: koppeling } = await supabase
  .from('gebruiker_opleidingen')
  .select('opleiding_id')
  .eq('gebruiker_id', studentId)
  .maybeSingle();

const opleidingId = koppeling?.opleiding_id;

if (!opleidingId) {
  return res.status(404).json({ error: 'Geen opleiding gevonden voor deze student' });
}
  }

  if (!opleidingId) {
    return res.status(404).json({ error: 'Geen opleiding gevonden voor deze student' });
  }

  // Stap 2: haal competenties op gefilterd op opleiding
  const { data, error } = await supabase
    .from('competenties')
    .select('*')
    .eq('actief', true)
    .eq('opleiding_id', opleidingId)
    .order('volgorde', { ascending: true });

  if (error) {
    console.error('Fout bij ophalen competenties:', error);
    return res.status(500).json({ error: 'Kon competenties niet ophalen' });
  }

  const competenties = (data || []).map(c => {
    const vind = (n) => {
      const key = Object.keys(c).find(
        k => k.includes('beschrijving') && k.includes(String(n))
      );
      return key ? c[key] : null;
    };
    return {
      ...c,
      beschrijving_5: vind(5),
      beschrijving_3: vind(3),
      beschrijving_0: vind(0),
    };
  });

  res.json(competenties);
});

// GET /api/stagementor/evaluaties?student_id=...
router.get('/evaluaties', requireAuth, requireStagementor, async (req, res) => {
  const supabase = req.app.get('supabase'); // ✅ toegevoegd
  const studentId = req.query.student_id;

  if (!studentId) {
    return res.status(400).json({ error: 'student_id is verplicht' });
  }

  const { data: stage, error: stageError } = await supabase
    .from('stages')
    .select('id, evaluatie_status')
    .eq('student_id', studentId)
    .eq('stagementor_id', req.user.id) // ✅ beveiligingscheck
    .single();

  if (stageError || !stage) {
    return res.status(404).json({ error: 'Geen stage gevonden voor deze student' });
  }

  const { data, error } = await supabase
    .from('evaluaties')
    .select('id, competentie_id, beoordelaar_id, type, score, feedback, zichtbaar_voor_student')
    .eq('stage_id', stage.id);

  if (error) {
    console.error('Fout bij ophalen evaluaties:', error);
    return res.status(500).json({ error: 'Kon evaluaties niet ophalen' });
  }

  res.json({ evaluatie_status: stage.evaluatie_status, evaluaties: data });
});

// POST /api/stagementor/evaluaties
router.post('/evaluaties', requireAuth, requireStagementor, async (req, res) => {
  const supabase = req.app.get('supabase'); // ✅ toegevoegd
  const stagementorId = req.user.id;        // ✅ gedeclareerd vanuit token
  const { student_id, competentie_id, type, score, feedback } = req.body;

  if (!student_id || !competentie_id || !type || !feedback) {
    return res.status(400).json({ error: 'student_id, competentie_id, type en feedback zijn verplicht' });
  }

  const { data: stage, error: stageError } = await supabase
    .from('stages')
    .select('id, evaluatie_status')
    .eq('student_id', student_id)
    .eq('stagementor_id', stagementorId) // ✅ beveiligingscheck
    .single();

  if (stageError || !stage) {
    return res.status(404).json({ error: 'Geen stage gevonden voor deze student' });
  }

  const status = stage.evaluatie_status;
  const schrijfToegestaan =
    (type === 'tussentijds' && status === 'tussentijds') ||
    (type === 'eindevaluatie' && status === 'eindevaluatie');

  if (!schrijfToegestaan) {
    return res.status(403).json({ error: 'Opslaan is niet toegestaan in de huidige fase.' });
  }

  const { data: bestaande } = await supabase
    .from('evaluaties')
    .select('id')
    .eq('stage_id', stage.id)
    .eq('competentie_id', competentie_id)
    .eq('beoordelaar_id', stagementorId) // ✅ nu correct gedeclareerd
    .eq('type', type)
    .maybeSingle(); // ✅ maybeSingle i.p.v. single, zodat null geen error gooit

  let result, dbError;

  if (bestaande) {
    ({ data: result, error: dbError } = await supabase
      .from('evaluaties')
      .update({ score, feedback, bijgewerkt_op: new Date() })
      .eq('id', bestaande.id)
      .select()
      .single());
  } else {
    ({ data: result, error: dbError } = await supabase
      .from('evaluaties')
      .insert({
        stage_id: stage.id,
        competentie_id,
        beoordelaar_id: stagementorId,
        type,
        score,
        feedback,
        zichtbaar_voor_student: false,
      })
      .select()
      .single());
  }

  if (dbError) {
    console.error('Fout bij opslaan evaluatie:', dbError);
    return res.status(500).json({ error: 'Kon evaluatie niet opslaan' });
  }

  res.json(result);
});

export default router;