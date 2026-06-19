<template>
  <div class="dashboard-layout">

    <aside class="sidebar">
      <div class="sidebar-brand">
        <span class="brand-text">STAGE.BE</span>
      </div>

      <nav class="sidebar-nav">
        <button class="nav-item nav-back" @click="router.push('/docent')">
          ← Mijn studenten
        </button>

        <div class="nav-separator"></div>
       
        <button class="nav-item" :class="{ active: pagina === 'stageinfo' }"  @click="pagina = 'stageinfo'">Stageinfo</button>
        <button class="nav-item" :class="{ active: pagina === 'logboek' }"    @click="pagina = 'logboek'">Logboek</button>
        <button class="nav-item" :class="{ active: pagina === 'evaluatie' }"  @click="router.push(`/docent/evaluatie/${studentId}`)">Evaluatie</button>
        <button class="nav-item" :class="{ active: pagina === 'documenten' }" @click="pagina = 'documenten'">Documenten</button>
      </nav>

      <div class="sidebar-footer">
        <button v-if="heeftMeerdereRollen" class="nav-item wissel-rol-btn" @click="router.push('/kies-rol')">Wissel rol</button>
        <button class="logout-btn" @click="uitloggen">Uitloggen</button>
      </div>
    </aside>

    <main class="main-content">

      <header class="topbar">
        <div class="topbar-user">{{ docent.naam }}</div>
        <img src="../../assets/erasmus-logo.png" alt="Erasmus Hogeschool Brussel" class="topbar-logo" />
      </header>

      <section class="content-area">

        <div v-if="loadingInfo" class="status-message">Gegevens laden...</div>
        <div v-else-if="foutInfo" class="status-message error">{{ foutInfo }}</div>

        <template v-else>

          <div v-if="pagina === 'logboek'">
            <div class="section-header">
              <h2>Logboek van {{ student.voornaam }} {{ student.achternaam }}</h2>
              <p class="sectie-subtitel">
                Stageperiode: {{ formatDatum(stage.start_datum) }} – {{ formatDatum(stage.eind_datum) }} | {{ stage.bedrijf || '—' }}
              </p>
            </div>

            <div v-if="loadingLogboek" class="status-message">Logboek laden...</div>
            <div v-else-if="weken.length === 0" class="status-message">Nog geen dagen ingevoerd door de student.</div>

            <div v-for="week in weken" :key="week.nummer" class="week-kaart">
              <div class="week-header">
                <div class="week-titel">
                  {{ week.nummer === 0 ? 'Voor stageperiode' : `Week ${week.nummer}` }}
                  <span class="badge" :class="statusKleur(week.status)">{{ week.status }}</span>
                </div>
              </div>

              <table class="dag-tabel">
                <thead>
                  <tr>
                    <th>Datum</th>
                    <th>Taken</th>
                    <th>Uren</th>
                    <th>Reflectie</th>
                    <th>Leerpunten</th>
                    <th>Leerdoelen</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="dag in week.dagen" :key="dag.id">
                    <td class="col-datum">{{ formatDatum(dag.datum) }}</td>
                    <td class="col-text">{{ truncate(dag.taak) }}</td>
                    <td class="col-uren">{{ dag.uren }}</td>
                    <td class="col-text">{{ truncate(dag.reflectie) }}</td>
                    <td class="col-text">{{ truncate(dag.leerpunten) }}</td>
                    <td class="col-leerdoelen">
                      <span v-if="!dag.competenties || dag.competenties.length === 0" class="muted">—</span>
                      <span v-else class="leerdoel-tag" v-for="c in dag.competenties" :key="c.id">
                        {{ c.naam }}
                      </span>
                    </td>
                    <td class="col-acties">
                      <button class="knop-meer" @click="openDagDetail(dag)">Bekijk meer</button>
                    </td>
                  </tr>
                </tbody>
              </table>

              <div class="week-totaal">
                Totaal: <strong>{{ week.dagen.reduce((s, d) => s + Number(d.uren || 0), 0) }} uren</strong>
              </div>
            </div>
          </div>

          <!-- Stagevoorstel -->
          <div v-if="pagina === 'stageinfo'">
            <div class="section-header">
              <h2>Stagevoorstel</h2>
            </div>

            <div v-if="loadingVoorstel" class="status-message">Laden...</div>
            <div v-else-if="!stagevoorstel" class="status-message">Geen stagevoorstel gevonden.</div>

            <div v-else class="info-kaart">
  <div><strong>Bedrijf:</strong> {{ stagevoorstel.bedrijfsnaam || '—' }}</div>
  <div><strong>Adres:</strong>
    {{ stagevoorstel.straat }} {{ stagevoorstel.huisnummer }},
    {{ stagevoorstel.gemeente }}, {{ stagevoorstel.land }}
  </div>
  <div><strong>Beschrijving:</strong> {{ stagevoorstel.beschrijving || '—' }}</div>
  <div><strong>Technische skills:</strong> {{ stagevoorstel.technische_skills || '—' }}</div>
  <div><strong>Tools:</strong> {{ stagevoorstel.tools || '—' }}</div>
  <div><strong>Stagementor:</strong>
    {{ stagevoorstel.mentor_voornaam || '—' }} {{ stagevoorstel.mentor_achternaam || '' }}
  </div>
  <div><strong>E-mail stagementor:</strong> {{ stagevoorstel.mentor_email || '—' }}</div>
</div>
          </div>

          <!-- Documenten -->
          <div v-if="pagina === 'documenten'">
            <div class="section-header">
              <h2>Documenten</h2>
            </div>


                        <div class="info-kaart" style="margin-top: 1rem;">
  <div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem;">
    <div>
      <div style="font-weight: 700; font-size: 1rem; color: #111;">Eindevaluatie PDF</div>
      <div style="font-size: 0.85rem; color: #666; margin-top: 0.25rem;">
        Genereer of download de eindevaluatie
      </div>
    </div>
    <div style="display: flex; gap: 0.5rem;">
      <button class="knop-blauw" @click="genereerEindevaluatie" :disabled="genererenTussen">
        {{ genererenTussen ? 'Bezig...' : 'Genereer / Ververs' }}
      </button>
      <button class="knop-blauw" @click="downloadEindevaluatie" :disabled="downloadenTussen">
        {{ downloadenTussen ? 'Bezig...' : 'Downloaden' }}
      </button>
    </div>
  </div>
  <div v-if="tussenFout" class="error-msg" style="margin-top: 0.75rem;">{{ tussenFout }}</div>
  <div v-if="tussenSucces" style="margin-top: 0.75rem; color: #2e7d32; font-weight: 600;">{{ tussenSucces }}</div>
</div>


            <div class="info-kaart" style="margin-top: 1rem;">
  <div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem;">
    <div>
      <div style="font-weight: 700; font-size: 1rem; color: #111;">Tussentijdsevaluatie PDF</div>
      <div style="font-size: 0.85rem; color: #666; margin-top: 0.25rem;">
        Genereer of download de tussentijdse evaluatie
      </div>
    </div>
    <div style="display: flex; gap: 0.5rem;">
      <button class="knop-blauw" @click="genereerTussentijdsevaluatie" :disabled="genererenTussen">
        {{ genererenTussen ? 'Bezig...' : 'Genereer / Ververs' }}
      </button>
      <button class="knop-blauw" @click="downloadTussentijdsevaluatie" :disabled="downloadenTussen">
        {{ downloadenTussen ? 'Bezig...' : 'Downloaden' }}
      </button>
    </div>
  </div>
  <div v-if="tussenFout" class="error-msg" style="margin-top: 0.75rem;">{{ tussenFout }}</div>
  <div v-if="tussenSucces" style="margin-top: 0.75rem; color: #2e7d32; font-weight: 600;">{{ tussenSucces }}</div>
</div>

<div class="info-kaart" style="margin-top: 1rem;">
  <div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem;">
    <div>
      <div style="font-weight: 700; font-size: 1rem; color: #111;">Stagevoorstel PDF</div>
      <div style="font-size: 0.85rem; color: #666; margin-top: 0.25rem;">
        Download het ondertekende stagevoorstel van de student
      </div>
    </div>
    <button class="knop-blauw" @click="downloadStagevoorstel" :disabled="downloadenVoorstel">
      {{ downloadenVoorstel ? 'Bezig...' : 'Downloaden' }}
    </button>
  </div>
  <div v-if="voorstelFout" class="error-msg" style="margin-top: 0.75rem;">{{ voorstelFout }}</div>
</div>


          </div>

        </template>

      </section>

      <!-- Modal van dag-detail -->
      <div v-if="dagDetail" class="modal-overlay" @click.self="dagDetail = null">
        <div class="modal">
          <h3>{{ formatDatum(dagDetail.datum) }}</h3>

          <div class="modal-section">
            <strong>Taken</strong>
            <div class="modal-text">{{ dagDetail.taak || '—' }}</div>
          </div>

          <div class="modal-section">
            <strong>Uren</strong>
            <div class="modal-text">{{ dagDetail.uren }}</div>
          </div>

          <div class="modal-section">
            <strong>Reflectie</strong>
            <div class="modal-text">{{ dagDetail.reflectie || '—' }}</div>
          </div>

          <div class="modal-section">
            <strong>Leerpunten</strong>
            <div class="modal-text">{{ dagDetail.leerpunten || '—' }}</div>
          </div>

          <div class="modal-section">
            <strong>Leerdoelen</strong>
            <div class="modal-text">
              <span v-if="!dagDetail.competenties || dagDetail.competenties.length === 0" class="muted">Geen leerdoelen gekoppeld</span>
              <span v-else class="leerdoel-tag" v-for="c in dagDetail.competenties" :key="c.id">
                {{ c.naam }}
              </span>
            </div>
          </div>

          <div class="modal-actions">
            <button class="knop-blauw" @click="dagDetail = null">Sluiten</button>
          </div>
        </div>
      </div>

    </main>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()

const studentId = route.params.studentId
const pagina = ref('logboek')

const docent = reactive({ naam: '' })
const student = reactive({ id: null, voornaam: '', achternaam: '', email: '', opleiding: '' })
const stage = reactive({ start_datum: '', eind_datum: '', status: '', bedrijf: '' })

const weken = ref([])
const stagevoorstel = ref(null)

const loadingInfo = ref(true)
const loadingLogboek = ref(false)
const loadingVoorstel = ref(false)
const foutInfo = ref('')
const dagDetail = ref(null)

const genereren = ref(false)
const downloaden = ref(false)
const eindevaluatieFout = ref('')
const eindevaluatieSucces = ref('')

const API_BASE = `/api/docent/student/${studentId}`

const genererenTussen = ref(false)
const downloadenTussen = ref(false)
const tussenFout = ref('')
const tussenSucces = ref('')

const downloadenVoorstel = ref(false)
const voorstelFout = ref('')

async function downloadStagevoorstel() {
  downloadenVoorstel.value = true
  voorstelFout.value = ''
  try {
    const res = await fetch(`${API_BASE}/stagevoorstel/download-pdf`, {
      headers: authHeaders()
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Fout bij downloaden')
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `stagevoorstel_${studentId}.pdf`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch (err) {
    voorstelFout.value = err.message
  } finally {
    downloadenVoorstel.value = false
  }
}

async function genereerTussentijdsevaluatie() {
  genererenTussen.value = true
  tussenFout.value = ''
  tussenSucces.value = ''
  try {
    const res = await fetch(`${API_BASE}/tussentijdsevaluatie/genereer`, {
      method: 'POST',
      headers: authHeaders()
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Fout bij genereren')

  } catch (err) {
    tussenFout.value = err.message
  } finally {
    genererenTussen.value = false
  }
}

async function downloadTussentijdsevaluatie() {
  downloadenTussen.value = true
  tussenFout.value = ''
  try {
    const res = await fetch(`${API_BASE}/tussentijdsevaluatie/download`, {
      headers: authHeaders()
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Fout bij downloaden')
    window.open(data.url, '_blank')
  } catch (err) {
    tussenFout.value = err.message
  } finally {
    downloadenTussen.value = false
  }
}

function truncate(text, max = 60) {
  if (!text) return '—'
  return text.length > max ? text.slice(0, max) + '...' : text
}

function openDagDetail(dag) {
  dagDetail.value = dag
}

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` }
}

async function laadInfo() {
  loadingInfo.value = true
  foutInfo.value = ''
  try {
    const res = await fetch(`${API_BASE}/info`, { headers: authHeaders() })
    const text = await res.text()
    const data = text ? JSON.parse(text) : null
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)

    Object.assign(student, data.student)
    Object.assign(stage, data.stage)
    docent.naam = data.docent?.naam || ''
  } catch (err) {
    foutInfo.value = err.message
  } finally {
    loadingInfo.value = false
  }
}

async function laadLogboek() {
  loadingLogboek.value = true
  try {
    const res = await fetch(`${API_BASE}/logboek`, { headers: authHeaders() })
    const data = await res.json()
    weken.value = data.sort((a, b) => b.nummer - a.nummer)
  } catch (err) {
    console.error(err)
  } finally {
    loadingLogboek.value = false
  }
}

async function laadStagevoorstel() {
  loadingVoorstel.value = true
  try {
    const res = await fetch(`${API_BASE}/stagevoorstel`, { headers: authHeaders() })
    stagevoorstel.value = await res.json()
  } catch (err) {
    console.error(err)
  } finally {
    loadingVoorstel.value = false
  }
}

watch(pagina, (nova) => {
  if (nova === 'logboek' && weken.value.length === 0) laadLogboek()
  if (nova === 'stageinfo' && stagevoorstel.value === null) laadStagevoorstel()
  if (nova === 'documenten') { eindevaluatieFout.value = ''; eindevaluatieSucces.value = '' }
}, { immediate: false })

async function genereerEindevaluatie() {
  genereren.value = true
  eindevaluatieFout.value = ''
  eindevaluatieSucces.value = ''
  try {
    const res = await fetch(`${API_BASE}/eindevaluatie/genereer`, {
      method: 'POST',
      headers: authHeaders()
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
    eindevaluatieSucces.value = 'Eindevaluatie succesvol gegenereerd.'
  } catch (err) {
    eindevaluatieFout.value = err.message
  } finally {
    genereren.value = false
  }
}

async function downloadEindevaluatie() {
  downloaden.value = true
  eindevaluatieFout.value = ''
  eindevaluatieSucces.value = ''
  try {
    const res = await fetch(`${API_BASE}/eindevaluatie/download`, { headers: authHeaders() })
    const data = await res.json()
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
    window.open(data.url, '_blank')
  } catch (err) {
    eindevaluatieFout.value = err.message
  } finally {
    downloaden.value = false
  }
}

function statusKleur(status) {
  const s = (status || '').toLowerCase()
  if (s.includes('afgetekend') || s.includes('goedgekeurd')) return 'badge-groen'
  if (s.includes('afgekeurd')) return 'badge-rood'
  if (s.includes('ingediend')) return 'badge-blauw'
  return 'badge-grijs'
}

function formatDatum(datum) {
  if (!datum) return '—'
  return new Date(datum).toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const heeftMeerdereRollen = (JSON.parse(localStorage.getItem('user') || '{}').rollen?.length ?? 0) > 1

function uitloggen() {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  router.push('/')
}

onMounted(async () => {
  // Lees ?pagina= query parameter
  if (route.query.pagina) {
    pagina.value = route.query.pagina
  }
  
  await laadInfo()
  if (!foutInfo.value) {
    if (pagina.value === 'logboek') await laadLogboek()
    if (pagina.value === 'stageinfo') await laadStagevoorstel()
  }
})
</script>

<style scoped>
.dashboard-layout {
  display: flex;
  min-height: 100vh;
  font-family: Arial, Helvetica, sans-serif;
  background: #f5f7fa;
}

.sidebar {
  width: 180px;
  background: white;
  border-right: 1px solid #e5e8ec;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  position: sticky;
  top: 0;            
  height: 100vh;
}

.sidebar-brand {
  padding: 1.25rem 1rem;
  background: #1ec8f0;
}

.brand-text {
  font-size: 1.4rem;
  font-weight: 800;
  color: #fff;
  letter-spacing: 0.5px;
}

.sidebar-nav {
  flex: 1;
  padding: 1rem 0.75rem;
}

.nav-item {
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  border-radius: 6px;
  padding: 0.65rem 1rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: #29a8e0;
  cursor: pointer;
  margin-bottom: 0.5rem;
  transition: background 0.15s;
}



.nav-item:hover { background: #f0f7fc; }
.nav-item.active { background: #29a8e0; color: white; }

.nav-back {
  background: #29a8e0;
  color: white;
  font-weight: 700;
}

.nav-back:hover { background: #1e90c0; }

.nav-separator {
  height: 1px;
  background: #e5e8ec;
  margin: 0.5rem 0 0.75rem;
}

.nav-item.disabled {
  background: transparent;
  color: #bbb;
  cursor: not-allowed;
}

.nav-item.disabled:hover { background: transparent; }


.sidebar-footer {
  padding: 1rem 0.75rem;
}

.logout-btn {
  width: 100%;
  background: #ffeaea;
  color: #cc0000;
  border: none;
  border-radius: 6px;
  padding: 0.65rem 1rem;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.logout-btn:hover { background: #ffdada; }
.wissel-rol-btn { background: white; color: #29a8e0; border: 1px solid #29a8e0; margin-bottom: 0.5rem; }

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.topbar {
  background: white;
  padding: 0.75rem 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e0e0e0;
}

.topbar-user {
  background: #e8e8e8;
  border-radius: 6px;
  padding: 0.4rem 1rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: #222;
}

.topbar-logo {
  height: 36px;
  object-fit: contain;
}

.content-area {
  padding: 1.5rem 2rem;
  overflow-y: auto;
}

.section-header {
  margin-bottom: 1.25rem;
}

.section-header h2 {
  font-size: 1.4rem;
  font-weight: 700;
  color: #111;
  margin: 0 0 0.25rem;
}

.sectie-subtitel {
  font-size: 0.85rem;
  color: #555;
  margin: 0;
}

.status-message {
  color: #555;
  padding: 1rem 0;
  font-size: 0.95rem;
  font-style: italic;
}

.status-message.error {
  color: #cc0000;
}

.week-kaart {
  background: white;
  border-radius: 10px;
  border-top: 3px solid #29a8e0;
  padding: 1.25rem;
  margin-bottom: 1.25rem;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}

.week-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.week-titel {
  font-size: 1rem;
  font-weight: 700;
  color: #111;
  display: flex;
  align-items: center;
  gap: 10px;
}

.week-acties {
  display: flex;
  gap: 8px;
}

.week-totaal {
  margin-top: 12px;
  font-size: 13px;
  color: #555;
  text-align: right;
}

.dag-tabel {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.dag-tabel th {
  background: #29a8e0;
  color: white;
  padding: 8px 12px;
  text-align: left;
  font-weight: 600;
}

.dag-tabel td {
  padding: 8px 12px;
  border-bottom: 1px solid #f0f0f0;
  color: #1a1a1a;
}

.dag-tabel tr:last-child td {
  border-bottom: none;
}

.info-kaart {
  background: white;
  border-radius: 10px;
  border-top: 3px solid #29a8e0;
  padding: 1.25rem 1.5rem;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 14px;
  color: #333;
  margin-bottom: 1rem;
  overflow: hidden;
}

.badge {
  display: inline-block;
  padding: 0.25rem 0.7rem;
  border-radius: 5px;
  font-size: 0.78rem;
  font-weight: 700;
  white-space: nowrap;
}

.badge-groen { background: #4caf50; color: #fff; }
.badge-blauw { background: #2196f3; color: #fff; }
.badge-rood  { background: #e53935; color: #fff; }
.badge-grijs  { background: #aaa;    color: #fff; }

.knop-blauw {
  background: #29a8e0;
  color: white;
  border: none;
  padding: 0.55rem 1.1rem;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: none;
  box-shadow: 0 2px 4px rgba(41,168,224,0.25);
  transition: background 0.15s, box-shadow 0.15s, transform 0.05s;
}

.knop-blauw:hover { background: #1e90c0; box-shadow: 0 4px 8px rgba(41,168,224,0.35); }
.knop-blauw:active { transform: translateY(1px); }

.knop-groen {
  background: #4caf50;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
}

.knop-groen:hover {
  background: #388e3c;
}

.knop-rood {
  background: #f44336;
  color: white;
  border: none;
  padding: 0.55rem 1.1rem;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
  transition: background 0.15s;
}

.knop-rood:hover { background: #d33; }
/* Tabela compacta com texto truncado */
.dag-tabel {
  table-layout: fixed;
  width: 100%;
}

.col-datum { width: 100px; }
.col-uren { width: 70px; text-align: center; }
.col-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}
.col-leerdoelen {
  width: 160px;
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  padding: 8px 12px;
  overflow: hidden;
  white-space: nowrap;
}
.col-acties { width: 120px; text-align: right; }

.leerdoel-tag {
  display: inline-block;
  background: #e3f2fd;
  color: #1565c0;
  padding: 0.2rem 0.55rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}

.muted {
  color: #999;
  font-style: italic;
  font-size: 0.85rem;
}

.knop-meer {
  background: #29a8e0;
  color: white;
  border: none;
  padding: 0.35rem 0.75rem;
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
}

.knop-meer:hover {
  background: #1e90c0;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: white;
  border-radius: 10px;
  padding: 1.5rem 2rem;
  max-width: 600px;
  width: 90%;
  max-height: 85vh;
  overflow-y: auto;
}

.modal h3 {
  margin: 0 0 1rem;
  color: #111;
  font-size: 1.2rem;
}

.modal-section {
  margin-bottom: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.modal-section strong {
  font-size: 0.85rem;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.modal-text {
  background: #f7f9fb;
  padding: 0.75rem 1rem;
  border-radius: 6px;
  font-size: 0.95rem;
  color: #222;
  white-space: pre-wrap;
  word-wrap: break-word;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 1rem;
}

.knop-rij {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.error-msg {
  color: #cc0000;
  font-size: 0.9rem;
}

.succes-msg {
  color: #2e7d32;
  font-size: 0.9rem;
}
</style>