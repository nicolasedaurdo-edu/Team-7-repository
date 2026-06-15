import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

export function useStudentEvaluatie() {
  const router = useRouter()
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const gebruikerNaam = `${user.voornaam || ''} ${user.achternaam || ''}`.trim() || user.email || 'Student'

  const actieveTab = ref('tussentijds')
  const eindevaluatieOpen = ref(false) // wordt later door docent aangezet
  const openCompetentie = ref(null)
  const competenties = ref([])
  const evaluaties = ref([])
  const loading = ref(true)
  const fout = ref('')
  const bezig = ref({})
  const opgeslagen = ref({})
  const foutMelding = ref({})
  const scoreGeselecteerd = ref({})

  const scoreOpties = [
    { waarde: 5, label: 'Uitstekend', beschrijving: 'Volledig zelfstandig, geen bijsturing nodig.' },
    { waarde: 3, label: 'Voldoende', beschrijving: 'Met regelmatige begeleiding.' },
    { waarde: 0, label: 'Niet aanwezig', beschrijving: 'Weinig of geen toepassing aanwezig.' },
  ]

  function toggleCompetentie(id) {
    openCompetentie.value = openCompetentie.value === id ? null : id
  }

  function getEvaluatie(competentieId) {
    return evaluaties.value.find(
      e => e.competentie_id === competentieId &&
           e.beoordelaar_id === user.id &&
           e.type === actieveTab.value
    )
  }

  function getMentorEvaluatie(competentieId) {
    return evaluaties.value.find(
      e => e.competentie_id === competentieId &&
           e.beoordelaar_id !== user.id &&
           e.type === actieveTab.value &&
           e.zichtbaar_voor_student
    )
  }

  function setScore(competentieId, waarde) {
    scoreGeselecteerd.value[competentieId] = true
    const bestaande = getEvaluatie(competentieId)
    if (bestaande) {
      bestaande.score = waarde
    } else {
      evaluaties.value.push({
        competentie_id: competentieId,
        beoordelaar_id: user.id,
        type: actieveTab.value,
        score: waarde,
        feedback: '',
        zichtbaar_voor_student: false,
      })
    }
  }

  function setFeedback(competentieId, tekst) {
    const bestaande = getEvaluatie(competentieId)
    if (bestaande) {
      bestaande.feedback = tekst
    } else {
      evaluaties.value.push({
        competentie_id: competentieId,
        beoordelaar_id: user.id,
        type: actieveTab.value,
        score: null,
        feedback: tekst,
        zichtbaar_voor_student: false,
      })
    }
  }

  async function slaOp(competentieId) {
    const evaluatie = getEvaluatie(competentieId)
    if (!evaluatie || !evaluatie.feedback?.trim() || !scoreGeselecteerd.value[competentieId]) {
      foutMelding.value[competentieId] = 'Invullen feedback en score is verplicht!'
      return
    }
    foutMelding.value[competentieId] = ''

    bezig.value[competentieId] = true
    opgeslagen.value[competentieId] = false

    try {
      const token = localStorage.getItem('token')
      const response = await fetch('/api/student/evaluaties', {
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
        fetch('/api/student/competenties', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/student/evaluaties', { headers: { Authorization: `Bearer ${token}` } }),
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
          if (e.score !== null && e.score !== undefined) {
            scoreGeselecteerd.value[e.competentie_id] = true
          }
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
    openCompetentie,
    competenties,
    evaluaties,
    loading,
    fout,
    bezig,
    opgeslagen,
    foutMelding,
    scoreGeselecteerd,
    scoreOpties,
    toggleCompetentie,
    getEvaluatie,
    getMentorEvaluatie,
    setScore,
    setFeedback,
    slaOp,
    handleLogout,
  }
}
