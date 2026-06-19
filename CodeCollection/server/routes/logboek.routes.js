import express from 'express';
import jwt from 'jsonwebtoken';

const router = express.Router();
console.log('Logboek routes geladen');

// ─── Auth middleware ───────────────────────────────────────────────────────────

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

function requireStudent(req, res, next) {
  const rollen = req.user.rollen || (req.user.rol ? [req.user.rol] : []);
  if (!rollen.includes('student')) {
    return res.status(403).json({ error: 'Geen toegang' });
  }
  next();
}

function requireDocent(req, res, next) {
  const rollen = req.user.rollen || (req.user.rol ? [req.user.rol] : []);
  if (!rollen.includes('docent')) {
    return res.status(403).json({ error: 'Geen toegang' });
  }
  next();
}

// ─── Helper: verify stage belongs to student ──────────────────────────────────
// ─── Datumhelpers (gedeeld) ────────────────────────────────────────────────

/** Geeft de maandag (als Date, UTC) van de week waarin datum d valt. */
function maandagVanDatum(d) {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = dt.getUTCDay() || 7; // maandag=1 ... zondag=7
  dt.setUTCDate(dt.getUTCDate() - (dayNum - 1));
  return dt;
}

/** Geeft de maandag van een specifiek weeknummer, relatief aan de startdatum van de stage. */
function maandagVanWeek(weekNummer, startDatum) {
  const startMaandag = maandagVanDatum(new Date(startDatum));
  const maandag = new Date(startMaandag);
  maandag.setUTCDate(maandag.getUTCDate() + (weekNummer - 1) * 7);
  return maandag;
}

/** Geeft de zaterdag van een specifiek weeknummer (= maandag + 5 dagen). */
function zaterdagVanWeek(weekNummer, startDatum) {
  const maandag = maandagVanWeek(weekNummer, startDatum);
  const zaterdag = new Date(maandag);
  zaterdag.setUTCDate(zaterdag.getUTCDate() + 5);
  return zaterdag;
}

/** Vandaag, genormaliseerd naar middernacht UTC, voor datumvergelijkingen. */
function vandaagUTC() {
  const nu = new Date();
  return new Date(Date.UTC(nu.getFullYear(), nu.getMonth(), nu.getDate()));
}
/** Normaliseert een datum naar middernacht UTC, zonder naar de maandag te springen. */
function naarUTCDatum(d) {
  const dt = new Date(d);
  return new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
}



async function getStageForStudent(supabase, stageId, studentId) {
  const { data, error } = await supabase
    .from('stages')
    .select('id, student_id, start_datum, eind_datum, stagevoorstel:stagevoorstellen!stagevoorstel_id(bedrijfsnaam)')
    .eq('id', stageId)
    .eq('student_id', studentId)
    .single();

  if (error || !data) return null;
  return data;
}

// ─── GET /api/logboek/mijn-stage ──────────────────────────────────────────────
// Haal de actieve stage op voor de ingelogde student

router.get('/mijn-stage', requireAuth, requireStudent, async (req, res) => {
  const supabase = req.app.get('supabase');

  const { data: gebruiker, error: gebruikerError } = await supabase
    .from('gebruikers')
    .select('id, voornaam, achternaam')
    .eq('id', req.user.id)
    .single();

  if (gebruikerError || !gebruiker) {
    return res.status(404).json({ error: 'Gebruiker niet gevonden' });
  }

  const { data: stage, error: stageError } = await supabase
    .from('stages')
    .select(`
      id,
      start_datum,
      eind_datum,
      stagevoorstel:stagevoorstellen!stagevoorstel_id (
        bedrijfsnaam
      )
    `)
    .eq('student_id', req.user.id)
    .order('aangemaakt_op', { ascending: false })
    .limit(1)
    .single();

  if (stageError || !stage) {
    return res.status(404).json({ error: 'Geen actieve stage gevonden' });
  }

  res.json({
    naam: `${gebruiker.voornaam} ${gebruiker.achternaam}`.trim(),
    stageId: stage.id,
    startDatum: stage.start_datum,
    eindDatum: stage.eind_datum,
    bedrijf: stage.stagevoorstel?.bedrijfsnaam ?? '',
  });
});

// ─── GET /api/logboek/competenties ────────────────────────────────────────────
// Haal alle (actieve) competenties (LO's) op, voor gebruik in het "Nieuwe dag" formulier

router.get('/competenties', requireAuth, async (req, res) => {
  const supabase = req.app.get('supabase');

  // Haal opleiding_id op via gebruiker_opleidingen
  const { data: koppeling } = await supabase
    .from('gebruiker_opleidingen')
    .select('opleiding_id')
    .eq('gebruiker_id', req.user.id)
    .maybeSingle();

  const opleidingId = koppeling?.opleiding_id;

  let query = supabase
    .from('competenties')
    .select('id, naam, beschrijving, volgorde, opleiding_id, actief')
    .eq('actief', true)
    .order('volgorde', { ascending: true });

  if (opleidingId) {
    query = query.eq('opleiding_id', opleidingId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Fout bij ophalen competenties:', error);
    return res.status(500).json({ error: 'Kon competenties niet ophalen' });
  }

  res.json(data || []);
});

// ─── GET /api/logboek/:stageId/weken ──────────────────────────────────────────
// Haal alle logboekweken (gegroepeerd) op voor een stage

router.get('/:stageId/weken', requireAuth, async (req, res) => {
  const supabase = req.app.get('supabase');
  const { stageId } = req.params;

  // Studenten mogen enkel hun eigen stage zien; docenten mogen alles zien
  if (req.user.rol === 'student') {
    const stage = await getStageForStudent(supabase, stageId, req.user.id);
    if (!stage) return res.status(403).json({ error: 'Geen toegang tot deze stage' });
  }

  const { data: logboeken, error } = await supabase
    .from('logboeken')
    .select(`
      *,
      competenties_logboeken (
        competentie_id,
        competenties:competentie_id ( id, naam )
      )
    `)
    .eq('stage_id', stageId)
    .order('week_nummer', { ascending: true })
    .order('datum_van', { ascending: true });

  if (error) {
    console.error('Fout bij ophalen logboeken:', error);
    return res.status(500).json({ error: 'Kon logboeken niet ophalen' });
  }

  // Stage opvragen voor start_datum
  const { data: stageRow, error: stageRowError } = await supabase
    .from('stages')
    .select('start_datum')
    .eq('id', stageId)
    .single();

  if (stageRowError || !stageRow) {
    return res.status(500).json({ error: 'Kon stage niet ophalen' });
  }


  // Groepeer entries per weeknummer
  const wekenMap = {};
  for (const entry of logboeken || []) {
    const wn = entry.week_nummer;
    if (!wekenMap[wn]) {
      wekenMap[wn] = {
        nummer: wn,
        status: entry.status ?? 'aangemaakt',
        afgetekend: entry.afgetekend ?? false,
        entries: [],
      };
    }
    wekenMap[wn].entries.push(entry);
    wekenMap[wn].status = entry.status ?? wekenMap[wn].status;
    wekenMap[wn].afgetekend = entry.afgetekend ?? wekenMap[wn].afgetekend;
  }

const vandaag = vandaagUTC();

const weken = Object.values(wekenMap).map(week => {
  if (week.nummer === 0) {
    const startDatum = naarUTCDatum(stageRow.start_datum);

    return {
      nummer: 0,
      voorStageperiode: true,
      van: null,
      tot: null,
      maxUren: null,
      status: week.status,
      open: false,
      magIndienen: vandaag >= startDatum,
      vroegsteIndienDatum: formatDatumVolledig(startDatum),
      entries: week.entries.map(mapEntry),
    };
  }

  const maandag = maandagVanWeek(week.nummer, stageRow.start_datum);
  const zondag = new Date(maandag);
  zondag.setUTCDate(zondag.getUTCDate() + 6);
  const zaterdag = zaterdagVanWeek(week.nummer, stageRow.start_datum);

  return {
    nummer: week.nummer,
    voorStageperiode: false,
    van: formatDatum(maandag),
    tot: formatDatumVolledig(zondag),
    maxUren: 40,
    status: week.status,
    open: false,
    magIndienen: vandaag >= zaterdag,
    vroegsteIndienDatum: formatDatumVolledig(zaterdag),
    entries: week.entries.map(mapEntry),
  };
});

weken.sort((a, b) => a.nummer - b.nummer); // "Voor stageperiode" (0) altijd eerst

res.json(weken);
});

// ─── POST /api/logboek/:stageId/dag ───────────────────────────────────────────
// Voeg een nieuwe dag toe aan het logboek, met gekoppelde competenties (LO's)

router.post('/:stageId/dag', requireAuth, requireStudent, async (req, res) => {
  const supabase = req.app.get('supabase');
  const { stageId } = req.params;

  const stage = await getStageForStudent(supabase, stageId, req.user.id);
  if (!stage) return res.status(403).json({ error: 'Geen toegang tot deze stage' });

  const { datum, taak, uren, competentieIds, reflectie, leerpunten } = req.body;

  if (!datum || !taak) {
    return res.status(400).json({ error: 'Datum en taak zijn verplicht' });
  }

const gekozenDatum = new Date(datum);
if (isNaN(gekozenDatum.getTime())) {
  return res.status(400).json({ error: 'Ongeldige datum' });
}

// Geen toekomstige datum toelaten: een logboekdag mag pas aangemaakt worden
// op (of na) de dag zelf.
if (naarUTCDatum(gekozenDatum) > vandaagUTC()) {
  return res.status(400).json({ error: 'Je kan geen datum in de toekomst selecteren.' });
}

  // Valideer en normaliseer de meegegeven competentie-ids
  const ids = Array.isArray(competentieIds)
    ? competentieIds
        .map(id => parseInt(id, 10))
        .filter(id => Number.isInteger(id))
    : [];

  if (ids.length === 0) {
    return res.status(400).json({ error: 'Selecteer minstens één leerdoel (LO).' });
  }


const weekNummer = berekenWeeknummer(gekozenDatum, new Date(stage.start_datum));

  // Controleer of de week waarin deze dag valt nog open staat.
  // Eens een week ingediend (of verder verwerkt) is, mogen er geen nieuwe dagen meer bij.
  const { data: bestaandeWeekEntries, error: weekCheckError } = await supabase
    .from('logboeken')
    .select('status')
    .eq('stage_id', stageId)
    .eq('week_nummer', weekNummer)
    .limit(1);

  if (weekCheckError) {
    console.error('Fout bij controleren weekstatus:', weekCheckError);
    return res.status(500).json({ error: 'Kon weekstatus niet controleren' });
  }

  const weekStatus = bestaandeWeekEntries?.[0]?.status ?? 'aangemaakt';
  if (weekStatus !== 'aangemaakt') {
    return res.status(409).json({ error: 'Deze week is al ingediend; je kan hier geen dagen meer aan toevoegen.' });
  }

  const { data: inserted, error } = await supabase
    .from('logboeken')
    .insert({
      stage_id: parseInt(stageId, 10),
      week_nummer: weekNummer,
      datum_van: datum,
      taken: taak,
      reflectie: reflectie || null,
      leerpunten: leerpunten || null,
      uren_gemaakt: uren || 0,
      status: 'aangemaakt',
      afgetekend: false,
    })
    .select()
    .single();

  if (error) {
    console.error('Fout bij opslaan dag:', error);
    return res.status(500).json({ error: 'Kon dag niet opslaan' });
  }

  // Koppelingen naar competenties_logboeken opslaan
  const koppelingen = ids.map(competentieId => ({
    logboek_id: inserted.id,
    competentie_id: competentieId,
  }));

  const { error: koppelError } = await supabase
    .from('competenties_logboeken')
    .insert(koppelingen);

  if (koppelError) {
    console.error('Fout bij koppelen competenties:', koppelError);
    // Logboekregel terugdraaien zodat er geen entry zonder LO's blijft hangen
    await supabase.from('logboeken').delete().eq('id', inserted.id);
    return res.status(500).json({ error: 'Kon leerdoelen niet koppelen' });
  }

  // Competentienamen ophalen voor de respons
  const { data: competenties, error: compError } = await supabase
    .from('competenties')
    .select('id, naam')
    .in('id', ids);

  if (compError) {
    console.error('Fout bij ophalen competenties:', compError);
  }

  res.status(201).json(mapEntry({
    ...inserted,
    competenties_logboeken: (competenties || []).map(c => ({
      competentie_id: c.id,
      competenties: c,
    })),
  }));
});

// ─── PATCH /api/logboek/:stageId/week/:weekNummer/indienen ────────────────────
// Dien een volledige week in (status → ingediend)

router.patch('/:stageId/week/:weekNummer/indienen', requireAuth, requireStudent, async (req, res) => {
  const supabase = req.app.get('supabase');
  const { stageId, weekNummer } = req.params;
  const weekNummerInt = parseInt(weekNummer, 10);

  const stage = await getStageForStudent(supabase, stageId, req.user.id);
  if (!stage) return res.status(403).json({ error: 'Geen toegang tot deze stage' });

  // Huidige status opvragen, zodat een reeds (deels) ingediende/verwerkte week
  // niet opnieuw ingediend kan worden
  const { data: entries, error: entriesError } = await supabase
    .from('logboeken')
    .select('id, status')
    .eq('stage_id', stageId)
    .eq('week_nummer', weekNummerInt);

  if (entriesError) {
    console.error('Fout bij ophalen week voor indienen:', entriesError);
    return res.status(500).json({ error: 'Kon week niet ophalen' });
  }

  if (!entries || entries.length === 0) {
    return res.status(404).json({ error: 'Geen dagen gevonden voor deze week' });
  }

  const reedsVerwerkt = entries.some(e => (e.status ?? 'aangemaakt') !== 'aangemaakt');
  if (reedsVerwerkt) {
    return res.status(409).json({ error: 'Deze week is al ingediend en kan niet opnieuw ingediend worden' });
  }

  // Indienen mag ten vroegste vanaf zaterdag van de betreffende week
if (weekNummerInt === 0) {
  // "Voor stageperiode" mag pas ingediend worden zodra de stage echt gestart is
  const startDatum = naarUTCDatum(stage.start_datum);
  if (vandaagUTC() < startDatum) {
    return res.status(409).json({
      error: `Je kan deze dagen nog niet indienen. Dat kan ten vroegste vanaf de start van je stage, op ${formatDatumVolledig(startDatum)}.`,
    });
  }
} else {
  const zaterdag = zaterdagVanWeek(weekNummerInt, stage.start_datum);
  if (vandaagUTC() < zaterdag) {
    return res.status(409).json({
      error: `Je kan deze week nog niet indienen. Dat kan ten vroegste op zaterdag ${formatDatumVolledig(zaterdag)}.`,
    });
  }
}

  const { error } = await supabase
    .from('logboeken')
    .update({ status: 'ingediend' })
    .eq('stage_id', stageId)
    .eq('week_nummer', weekNummerInt);

  if (error) {
    console.error('Fout bij indienen week:', error);
    return res.status(500).json({ error: 'Kon week niet indienen' });
  }

  res.json({ ok: true });
});

// ─── PATCH /api/logboek/:stageId/week/:weekNummer/aftekenen ───────────────────
// Teken een week af (docent only)

router.patch('/:stageId/week/:weekNummer/aftekenen', requireAuth, requireDocent, async (req, res) => {
  const supabase = req.app.get('supabase');
  const { stageId, weekNummer } = req.params;

  const { error } = await supabase
    .from('logboeken')
    .update({
      afgetekend: true,
      afgetekend_op: new Date().toISOString(),
      status: 'goedgekeurd',
    })
    .eq('stage_id', stageId)
    .eq('week_nummer', parseInt(weekNummer, 10));

  if (error) {
    console.error('Fout bij aftekenen week:', error);
    return res.status(500).json({ error: 'Kon week niet aftekenen' });
  }

  res.json({ ok: true });
});

// ─── DELETE /api/logboek/entry/:entryId ───────────────────────────────────────
// Verwijder een logboekregel (enkel eigen entries)

router.delete('/entry/:entryId', requireAuth, requireStudent, async (req, res) => {
  const supabase = req.app.get('supabase');
  const { entryId } = req.params;

  // Verifieer dat de entry bij een stage van de student hoort
  const { data: entry, error: fetchError } = await supabase
    .from('logboeken')
    .select('id, stage_id')
    .eq('id', entryId)
    .single();

  if (fetchError || !entry) {
    return res.status(404).json({ error: 'Entry niet gevonden' });
  }

  const stage = await getStageForStudent(supabase, entry.stage_id, req.user.id);
  if (!stage) return res.status(403).json({ error: 'Geen toegang tot deze entry' });

  // Koppelingen met competenties eerst verwijderen
  const { error: koppelError } = await supabase
    .from('competenties_logboeken')
    .delete()
    .eq('logboek_id', entryId);

  if (koppelError) {
    console.error('Fout bij verwijderen competentie-koppelingen:', koppelError);
    return res.status(500).json({ error: 'Kon gekoppelde leerdoelen niet verwijderen' });
  }

  const { error } = await supabase
    .from('logboeken')
    .delete()
    .eq('id', entryId);

  if (error) {
    console.error('Fout bij verwijderen entry:', error);
    return res.status(500).json({ error: 'Kon entry niet verwijderen' });
  }

  res.json({ ok: true });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDatum(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

function formatDatumVolledig(d) {
  return `${formatDatum(d)}/${d.getFullYear()}`;
}

/**
 * Berekent het weeknummer relatief aan de startdatum van de stage.
 * Week 1 = de week waarin de stage begint.
 */
function berekenWeeknummer(datum, startDatum) {
  // Dagen vóór de officiële startdatum horen niet bij een gewone week,
  // maar bij de aparte "Voor stageperiode"-sectie.
  if (naarUTCDatum(datum) < naarUTCDatum(startDatum)) {
    return 0;
  }

  const maandagVan = (d) => {
    const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = dt.getUTCDay() || 7;
    dt.setUTCDate(dt.getUTCDate() - (dayNum - 1));
    return dt;
  };

  const startMaandag = maandagVan(startDatum);
  const datumMaandag = maandagVan(datum);

  const diffWeken = Math.round((datumMaandag - startMaandag) / (7 * 24 * 60 * 60 * 1000));
  return Math.max(1, diffWeken + 1);
}

/**
 * Zet een Supabase logboek-rij om naar het formaat dat de Vue-component verwacht.
 * LO's (competenties) komen nu via de relatie competenties_logboeken -> competenties.
 */
function mapEntry(row) {
  const koppelingen = row.competenties_logboeken ?? [];
  const losArray = koppelingen
    .map(k => k.competenties?.naam)
    .filter(Boolean);

  const losIds = koppelingen
    .map(k => k.competentie_id)
    .filter(id => id != null);

  const losString = losArray.join(', ');

  const datum = row.datum_van ? row.datum_van.slice(5).split('-').reverse().join('/') : '';

  return {
    id: row.id,
    datum,
    taak: row.taken ?? '',
    uren: row.uren_gemaakt ?? 0,
    los: losString,
    losArray,
    losIds,
    reflectie: row.reflectie ?? '',
    leerpunten: row.leerpunten ?? '',
    open: false,
  };
}

export default router;