import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

export function useStagementorEvaluatie() {
  const router = useRouter()
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const gebruikerNaam = `${user.voornaam || ''} ${user.achternaam || ''}`.trim() || user.email || 'Stagementor'

  const actieveTab = ref('tussentijds')
  const eindevaluatieOpen = ref(false)
  const competenties = ref([])
  const evaluaties = ref([])
  const loading = ref(true)
  const fout = ref('')
  const bezig = ref({})
  const opgeslagen = ref({})
  const foutMelding = ref({})

  const scoreOpties = [
    { waarde: 5, label: 'Uitstekend', beschrijving: 'Volledig zelfstandig, geen bijsturing nodig.' },
    { waarde: 3, label: 'Voldoende', beschrijving: 'Met regelmatige begeleiding.' },
    { waarde: 0, label: 'Niet aanwezig', beschrijving: 'Weinig of geen toepassing aanwezig.' },
  ]

  function getMentorEvaluatie(competentieId) {
    return evaluaties.value.find(
      e => e.competentie_id === competentieId &&
           e.beoordelaar_id === user.id &&
           e.type === actieveTab.value
    )
  }

  function getStudentEvaluatie(competentieId) {
    return evaluaties.value.find(
      e => e.competentie_id === competentieId &&
           e.beoordelaar_id !== user.id &&
           e.type === actieveTab.value
    )
  }

  function setScore(competentieId, waarde) {
    const bestaande = getMentorEvaluatie(competentieId)
    if (bestaande) {
      bestaande.score = waarde
    } else {
      evaluaties.value.push({
        competentie_id: competentieId,
        beoordelaar_id: user.id,
        type: actieveTab.value,
        score: waarde,
        feedback: '',
      })
    }
  }

  function setFeedback(competentieId, tekst) {
    const bestaande = getMentorEvaluatie(competentieId)
    if (bestaande) {
      bestaande.feedback = tekst
    } else {
      evaluaties.value.push({
        competentie_id: competentieId,
        beoordelaar_id: user.id,
        type: actieveTab.value,
        score: null,
        feedback: tekst,
      })
    }
  }

  async function slaOp(competentieId) {
    const evaluatie = getMentorEvaluatie(competentieId)
    if (!evaluatie || !evaluatie.feedback?.trim() || evaluatie.score === undefined || evaluatie.score === null) {
      foutMelding.value[competentieId] = 'Invullen feedback en score is verplicht!'
      return
    }
    foutMelding.value[competentieId] = ''
    bezig.value[competentieId] = true
    opgeslagen.value[competentieId] = false

    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/mentor/evaluaties', {
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
      opgeslagen.value[competentieId] = true
    } catch (err) {
      foutMelding.value[competentieId] = err.message || 'Kon niet opslaan.'
    } finally {
      bezig.value[competentieId] = false
    }
  }

  async function laadData() {
    loading.value = true
    fout.value = ''
    try {
      const token = localStorage.getItem('token')
      const [compRes, evalRes] = await Promise.all([
        fetch('/api/mentor/competenties', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/mentor/evaluaties', { headers: { Authorization: `Bearer ${token}` } }),
      ])
      const compData = await compRes.json()
      const evalData = await evalRes.json()
      if (!compRes.ok) throw new Error(compData.error || 'Fout bij laden competenties')
      if (!evalRes.ok) throw new Error(evalData.error || 'Fout bij laden evaluaties')
      competenties.value = compData
      evaluaties.value = evalData

      for (const e of evalData) {
        if (e.beoordelaar_id === user.id) {
          opgeslagen.value[e.competentie_id] = true
        }
      }
    } catch (err) {
      fout.value = err.message || 'Kon data niet laden.'
    } finally {
      loading.value = false
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
    eindevaluatieOpen,
    competenties,
    evaluaties,
    loading,
    fout,
    bezig,
    opgeslagen,
    foutMelding,
    scoreOpties,
    getMentorEvaluatie,
    getStudentEvaluatie,
    setScore,
    setFeedback,
    slaOp,
    handleLogout,
  }
}
