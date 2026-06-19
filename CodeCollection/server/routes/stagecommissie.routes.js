import express from 'express';
import jwt from 'jsonwebtoken';

const router = express.Router();
console.log('Stagecommissie routes geladen');

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
  if (!rollen.includes('stagecommissie')) {
    return res.status(403).json({ error: 'Geen toegang' });
  }
  next();
}

// ── GET /api/stagecommissie/studenten ─────────────────────────────────────────
router.get('/studenten', requireAuth, requireDocent, async (req, res) => {
  const supabase = req.app.get('supabase');

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
        bedrijfsnaam
      )
    `);

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
      id:                   stage.id,
      voornaam:             stage.student?.voornaam   ?? '',
      achternaam:           stage.student?.achternaam ?? '',
      email:                stage.student?.email      ?? '',
      opleiding: opleidingPerStudent[stage.student?.id] ?? '',
      bedrijf:              stage.stagevoorstel?.bedrijfsnaam ?? '',
      start_datum:          stage.start_datum,
      eind_datum:           stage.eind_datum,
      mentor_naam:          stage.stagementor
        ? `${stage.stagementor.voornaam} ${stage.stagementor.achternaam}`.trim()
        : null,
      stagevoorstel_status: stage.status ?? 'Niet ingediend',
      logboek_status:       logboekStatus
    };
  });

  res.json(result);
});

// ── GET /api/stagecommissie/studenten/:stageId/voorstel ───────────────────────
// :stageId = stage.id zoals teruggegeven door de /studenten route.
// De studentenlijst geeft stage.id terug als `id` op elke kaart,
// dus we zoeken hier op stage.id (niet op student_id).
router.get('/studenten/:stageId/voorstel', requireAuth, requireDocent, async (req, res) => {
  const supabase = req.app.get('supabase');
  const stageId = parseInt(req.params.stageId, 10);

  if (isNaN(stageId)) {
    return res.status(400).json({ error: 'Ongeldig stage-ID' });
  }

  // 1. Haal de stage op via stage.id, inclusief alle relaties
  const { data: stage, error: stageError } = await supabase
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
        id,
        voornaam,
        achternaam,
        email
      ),
      stagevoorstel:stagevoorstellen!stagevoorstel_id (
        id,
        bedrijfsnaam,
        beschrijving,
        technische_skills,
        tools,
        straat,
        huisnummer,
        gemeente,
        land
      )
    `)
    .eq('id', stageId)
    .maybeSingle();

  if (stageError) {
    console.error('Fout bij ophalen stage detail:', stageError);
    return res.status(500).json({ error: 'Kon stagegegevens niet ophalen' });
  }

  if (!stage) {
    return res.status(404).json({ error: 'Geen stage gevonden' });
  }

  // 2. Haal opleiding op via de student-id uit de join
const { data: opleidingKoppeling } = await supabase
  .from('gebruiker_opleidingen')
  .select('opleidingen(naam)')
  .eq('gebruiker_id', stage.student?.id)
  .maybeSingle();

const opleiding = opleidingKoppeling?.opleidingen ?? null;
  // 3. Stel response samen
  res.json({
    student: {
      id:                   stage.student?.id,
      voornaam:             stage.student?.voornaam   ?? '',
      achternaam:           stage.student?.achternaam ?? '',
      email:                stage.student?.email      ?? '',
      opleiding:            opleiding?.naam           ?? '',
      stagevoorstel_status: stage.status              ?? ''
    },
    stage: {
      id:          stage.id,
      status:      stage.status,
      start_datum: stage.start_datum,
      eind_datum:  stage.eind_datum
    },
    stagevoorstel: stage.stagevoorstel
      ? {
          id:                stage.stagevoorstel.id,
          bedrijfsnaam:      stage.stagevoorstel.bedrijfsnaam      ?? '',
          beschrijving:      stage.stagevoorstel.beschrijving      ?? '',
          technische_skills: stage.stagevoorstel.technische_skills ?? '',
          tools:             stage.stagevoorstel.tools             ?? '',
          straat:            stage.stagevoorstel.straat            ?? '',
          huisnummer:        stage.stagevoorstel.huisnummer        ?? '',
          gemeente:          stage.stagevoorstel.gemeente          ?? '',
          land:              stage.stagevoorstel.land              ?? ''
        }
      : null,
    mentor: stage.stagementor
      ? {
          id:         stage.stagementor.id,
          voornaam:   stage.stagementor.voornaam   ?? '',
          achternaam: stage.stagementor.achternaam ?? '',
          email:      stage.stagementor.email      ?? ''
        }
      : {}
  });
});


router.put(
  '/studenten/:stageId/voorstel-status',
  requireAuth,
  requireDocent,
  async (req, res) => {
    const supabase = req.app.get('supabase')

    const stageId = parseInt(req.params.stageId, 10)

    const { status, feedback } = req.body

    const geldigeStatussen = [
      'stagevoorstel ingediend',
      'stagevoorstel geaccepteerd',
      'stagevoorstel geweigerd',
      'stagevoorstel aanpassingen vereist'
    ]

    if (!geldigeStatussen.includes(status)) {
      return res.status(400).json({
        error: 'Ongeldige status'
      })
    }

  const { data: stage, error: stageError } = await supabase
  .from('stages')
  .select('id, stagevoorstel_id, stagementor_id')
  .eq('id', stageId)
  .maybeSingle()


    if (stageError || !stage) {
      return res.status(404).json({
        error: 'Stage niet gevonden'
      })
    }

    const { error: statusError } = await supabase
      .from('stages')
      .update({
        status
      })
      .eq('id', stageId)

    if (statusError) {
      console.error(statusError)

      return res.status(500).json({
        error: 'Kon status niet opslaan'
      })
    }

    if (stage.stagevoorstel_id) {
      const { error: feedbackError } = await supabase
        .from('stagevoorstellen')
        .update({
          feedback:
            status === 'stagevoorstel aanpassingen vereist'
              ? feedback
              : null
        })
        .eq('id', stage.stagevoorstel_id)

      if (feedbackError) {
        console.error(feedbackError)

        return res.status(500).json({
          error: 'Kon feedback niet opslaan'
        })
      }
    }

    res.json({
      success: true
    })



    // Activeer stagementor bij goedkeuring stagevoorstel
if (
  status === 'stagevoorstel geaccepteerd' &&
  stage.stagementor_id
) {
  const { error: mentorError } = await supabase
    .from('gebruikers')
    .update({
    })
    .eq('id', stage.stagementor_id)

  if (mentorError) {
    console.error(mentorError)

    return res.status(500).json({
      error: 'Stagevoorstel goedgekeurd, maar mentor kon niet geactiveerd worden'
    })
  }
}
  }
);

router.put(
  '/studenten/:stageId/docent',
  requireAuth,
  requireDocent,
  async (req, res) => {
    const supabase = req.app.get('supabase')

    const stageId = parseInt(req.params.stageId, 10)

    const { voornaam, achternaam } = req.body

    if (!voornaam || !achternaam) {
      return res.status(400).json({
        error: 'Voornaam en achternaam zijn verplicht'
      })
    }

    const { data: docent, error: docentError } = await supabase
      .from('gebruikers')
      .select('id, gebruiker_rollen!inner(rol)')
      .eq('voornaam', voornaam.trim())
      .eq('achternaam', achternaam.trim())
      .eq('gebruiker_rollen.rol', 'docent')
      .maybeSingle()

    if (docentError) {
      console.error(docentError)

      return res.status(500).json({
        error: 'Fout bij zoeken docent'
      })
    }

    if (!docent) {
      return res.status(404).json({
        error: 'Docent niet gevonden'
      })
    }

    const { error: updateError } = await supabase
      .from('stages')
      .update({
        docent_id: docent.id
      })
      .eq('id', stageId)

    if (updateError) {
      console.error(updateError)

      return res.status(500).json({
        error: 'Kon docent niet koppelen'
      })
    }

    res.json({
      success: true,
      docentId: docent.id
    })
  }
);

export default router;