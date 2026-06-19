import express from 'express';
import jwt from 'jsonwebtoken';

const router = express.Router();

const TOEGESTANE_EVALUATIE_STATUSSEN = [
  'geen',
  'tussentijds',
  'tussentijdse_afgelopen',
  'eindevaluatie',
  'stage_afgelopen',
];

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
  if (req.user.rol !== 'docent') {
    return res.status(403).json({ error: 'Geen toegang' });
  }
  next();
}

// GET /api/docent/competenties/:studentId
router.get('/competenties/:studentId', requireAuth, requireDocent, async (req, res) => {
  const supabase = req.app.get('supabase');
  const { studentId } = req.params;

  // Stap 1: haal opleiding op via gebruiker_opleidingen, fallback naar gebruikers
  const { data: koppeling } = await supabase
    .from('gebruiker_opleidingen')
    .select('opleiding_id')
    .eq('gebruiker_id', studentId)
    .maybeSingle();

  let opleidingId = koppeling?.opleiding_id;

  if (!opleidingId) {
    const { data: gebruiker } = await supabase
      .from('gebruikers')
      .select('opleiding_id')
      .eq('id', studentId)
      .maybeSingle();
    opleidingId = gebruiker?.opleiding_id;
  }

  if (!opleidingId) {
    return res.status(404).json({ error: 'Geen opleiding gevonden voor deze student' });
  }

  // Stap 2: competenties gefilterd op opleiding
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

// GET /api/docent/evaluaties/:studentId
router.get('/evaluaties/:studentId', requireAuth, requireDocent, async (req, res) => {
  const supabase = req.app.get('supabase');
  const { studentId } = req.params;

  const { data: stage, error: stageError } = await supabase
    .from('stages')
    .select('id, student_id, stagementor_id, evaluatie_status')
    .eq('student_id', studentId)
    .eq('docent_id', req.user.id)
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

  const evaluaties = (data || []).map(e => ({
    ...e,
    rol: e.beoordelaar_id === stage.student_id
      ? 'student'
      : e.beoordelaar_id === stage.stagementor_id
        ? 'stagementor'
        : e.beoordelaar_id === req.user.id
          ? 'docent'
          : 'onbekend',
  }));

  res.json({
    evaluatie_status: stage.evaluatie_status ?? 'geen',
    evaluaties,
  });
});


// POST /api/docent/evaluaties/:studentId
router.post('/evaluaties/:studentId', requireAuth, requireDocent, async (req, res) => {
  const supabase = req.app.get('supabase');
  const docentId = req.user.id;
  const { studentId } = req.params;
  const { competentie_id, type, score, feedback } = req.body;

  if (!competentie_id || !type || !feedback) {
    return res.status(400).json({ error: 'competentie_id, type en feedback zijn verplicht' });
  }

  const { data: stage, error: stageError } = await supabase
    .from('stages')
    .select('id')
    .eq('student_id', studentId)
    .eq('docent_id', docentId)
    .maybeSingle();

  if (stageError || !stage) {
    return res.status(404).json({ error: 'Geen stage gevonden voor deze student' });
  }

  const { data: bestaande } = await supabase
    .from('evaluaties')
    .select('id')
    .eq('stage_id', stage.id)
    .eq('competentie_id', competentie_id)
    .eq('beoordelaar_id', docentId)
    .eq('type', type)
    .single();

  let result, error;

  if (bestaande) {
    ({ data: result, error } = await supabase
      .from('evaluaties')
      .update({ score, feedback, bijgewerkt_op: new Date() })
      .eq('id', bestaande.id)
      .select()
      .single());
  } else {
    ({ data: result, error } = await supabase
      .from('evaluaties')
      .insert({
        stage_id: stage.id,
        competentie_id,
        beoordelaar_id: docentId,
        type,
        score,
        feedback,
        zichtbaar_voor_student: false,
      })
      .select()
      .single());
  }

  if (error) {
    console.error('Fout bij opslaan evaluatie:', error);
    return res.status(500).json({ error: 'Kon evaluatie niet opslaan' });
  }

  res.json(result);
});

// PATCH /api/docent/evaluatie-status/:studentId
router.patch('/evaluatie-status/:studentId', requireAuth, requireDocent, async (req, res) => {
  const supabase = req.app.get('supabase');
  const { studentId } = req.params;
  const { evaluatie_status } = req.body;

  if (!TOEGESTANE_EVALUATIE_STATUSSEN.includes(evaluatie_status)) {
    return res.status(400).json({ error: 'Ongeldige evaluatiestatus' });
  }

  const { data: stage, error: stageError } = await supabase
    .from('stages')
    .select('id')
    .eq('student_id', studentId)
    .eq('docent_id', req.user.id)
    .single();

  if (stageError || !stage) {
    return res.status(404).json({ error: 'Geen stage gevonden voor deze student' });
  }

  const { data, error } = await supabase
    .from('stages')
    .update({ evaluatie_status })
    .eq('id', stage.id)
    .select('id, evaluatie_status')
    .single();

  if (error) {
    console.error('Fout bij bijwerken evaluatiestatus:', error);
    return res.status(500).json({ error: 'Kon evaluatiestatus niet bijwerken' });
  }

  res.json(data);
});

export default router;