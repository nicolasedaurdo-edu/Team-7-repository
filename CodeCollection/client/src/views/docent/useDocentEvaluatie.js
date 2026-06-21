import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

export function useDocentEvaluatie(studentId) {
  const router = useRouter()
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const gebruikerNaam = `${user.voornaam || ''} ${user.achternaam || ''}`.trim() || user.email || 'Docent'

  const actieveTab = ref('tussentijds')
  const evaluatieStatus = ref('geen')
  const competenties = ref([])
  const evaluaties = ref([])
  const loading = ref(true)
  const fout = ref('')
  const bezig = ref(false)
  const bezigOpslaan = ref({})
  const opgeslagen = ref({})
  const foutMelding = ref({})
  const heeftMeerdereRollen = (JSON.parse(localStorage.getItem('user') || '{}').rollen?.length ?? 0) > 1

  const scoreOpties = [
    { waarde: 5, label: 'Uitstekend', beschrijving: 'Volledig zelfstandig, geen bijsturing nodig.' },
    { waarde: 3, label: 'Voldoende', beschrijving: 'Met regelmatige begeleiding.' },
    { waarde: 0, label: 'Niet aanwezig', beschrijving: 'Weinig of geen toepassing aanwezig.' },
  ]

  const evaluatieStatusOpties = [
    { waarde: 'geen', label: 'Beide evaluaties dicht' },
    { waarde: 'tussentijds', label: 'Tussentijdse evaluatie open' },
    { waarde: 'tussentijdse_afgelopen', label: 'Tussentijdse evaluatie dicht' },
    { waarde: 'eindevaluatie', label: 'Eindevaluatie open' },
    { waarde: 'stage_afgelopen', label: 'Eindevaluatie dicht' },
  ]

  function getRubriek(score) {
    return scoreOpties.find(o => o.waarde === Number(score)) || null
  }

  function getBeschrijving(competentie, score) {
    if (!competentie || score === null || score === undefined) return null
    const n = Number(score)
    const tekst = competentie[`beschrijving_${n}`] ?? competentie[`${n}punten_beschrijving`]
    return tekst && String(tekst).trim() ? tekst : null
  }

  function getStudentEvaluatie(competentieId) {
    return evaluaties.value.find(
      e => e.competentie_id === competentieId &&
           e.rol === 'student' &&
           e.type === actieveTab.value
    )
  }

  function getMentorEvaluatie(competentieId) {
    return evaluaties.value.find(
      e => e.competentie_id === competentieId &&
           e.rol === 'stagementor' &&
           e.type === actieveTab.value
    )
  }

  function getDocentEvaluatie(competentieId) {
    return evaluaties.value.find(
      e => e.competentie_id === competentieId &&
           e.rol === 'docent' &&
           e.type === actieveTab.value
    )
  }

  function setScore(competentieId, waarde) {
    const bestaande = getDocentEvaluatie(competentieId)
    if (bestaande) {
      if (Number(bestaande.score) === Number(waarde)) return
      bestaande.score = waarde
    } else {
      evaluaties.value.push({
        competentie_id: competentieId,
        beoordelaar_id: user.id,
        rol: 'docent',
        type: actieveTab.value,
        score: waarde,
        feedback: '',
        zichtbaar_voor_student: false,
      })
    }
  }

  function setFeedback(competentieId, tekst) {
    const bestaande = getDocentEvaluatie(competentieId)
    if (bestaande) {
      bestaande.feedback = tekst
    } else {
      evaluaties.value.push({
        competentie_id: competentieId,
        beoordelaar_id: user.id,
        rol: 'docent',
        type: actieveTab.value,
        score: null,
        feedback: tekst,
        zichtbaar_voor_student: false,
      })
    }
  }

  async function slaOp(competentieId) {
  const evaluatie = getDocentEvaluatie(competentieId)
  if (!evaluatie || !evaluatie.feedback?.trim()) {
    foutMelding.value[competentieId] = 'Invullen feedback is verplicht!'
    return
  }
  foutMelding.value[competentieId] = ''
  bezigOpslaan.value[competentieId] = true
  opgeslagen.value[`${competentieId}_${actieveTab.value}`] = false   // was: opgeslagen.value[competentieId] = false

  try {
    const token = localStorage.getItem('token')
    const response = await fetch(`/api/docent/evaluaties/${studentId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        competentie_id: competentieId,
        type: actieveTab.value,
        score: evaluatie.score,
        feedback: evaluatie.feedback,
      }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'Fout bij opslaan')
    opgeslagen.value[`${competentieId}_${actieveTab.value}`] = true   // was: opgeslagen.value[competentieId] = true
  } catch (err) {
    alert(err.message || 'Kon niet opslaan.')
  } finally {
    bezigOpslaan.value[competentieId] = false
  }
}

  async function laadData() {
    loading.value = true
    fout.value = ''
    try {
      const token = localStorage.getItem('token')
     const [compRes, evalRes] = await Promise.all([
  fetch(`/api/docent/competenties/${studentId}`, { // ✅ studentId in de URL
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}` }
  }),
  fetch(`/api/docent/evaluaties/${studentId}`, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${token}` }
  }),
])
      const compData = await compRes.json()
      const evalData = await evalRes.json()
      if (!compRes.ok) throw new Error(compData.error || 'Fout bij laden competenties')
      if (!evalRes.ok) throw new Error(evalData.error || 'Fout bij laden evaluaties')
      competenties.value = compData
      evaluaties.value = evalData.evaluaties || []
      evaluatieStatus.value = evalData.evaluatie_status || 'geen'

      for (const e of evaluaties.value) {
  if (e.rol === 'docent') {
    opgeslagen.value[`${e.competentie_id}_${e.type}`] = true   // was: opgeslagen.value[e.competentie_id] = true
  }
}
    } catch (err) {
      fout.value = err.message || 'Kon data niet laden.'
    } finally {
      loading.value = false
    }
  }

  async function wijzigEvaluatieStatus(nieuweStatus) {
    if (nieuweStatus === evaluatieStatus.value) return
    bezig.value = true
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/docent/evaluatie-status/${studentId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ evaluatie_status: nieuweStatus }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Fout bij bijwerken')
      evaluatieStatus.value = data.evaluatie_status
    } catch (err) {
      alert(err.message || 'Kon evaluatiestatus niet bijwerken.')
    } finally {
      bezig.value = false
    }
  }

  function handleLogout() {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    router.push('/')
  }

  onMounted(laadData)

  return {
    gebruikerNaam,
    actieveTab,
    evaluatieStatus,
    evaluatieStatusOpties,
    competenties,
    evaluaties,
    loading,
    fout,
    bezig,
    bezigOpslaan,
    opgeslagen,
    foutMelding,
    scoreOpties,
    getRubriek,
    getBeschrijving,
    getStudentEvaluatie,
    getMentorEvaluatie,
    getDocentEvaluatie,
    setScore,
    setFeedback,
    slaOp,
    wijzigEvaluatieStatus,
    handleLogout,
    heeftMeerdereRollen,
  }
}