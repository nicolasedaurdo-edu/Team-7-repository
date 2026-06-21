<template>
  <div class="dashboard">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-brand">
        <span class="brand-text">STAGE.BE</span>
      </div>
      <nav class="sidebar-nav">
        <button
          class="nav-item"
          :class="{ active: activeView === 'mijn-stage' }"
          @click="activeView = 'mijn-stage'"
        >
          Stagevoorstel
        </button>

<button
  v-if="studentOndertekend && (stageStatus === 'stagevoorstel geaccepteerd' || stageStatus === 'lopend' || stageStatus === 'afgerond')"
  class="nav-item"
  @click="router.push('/studentlogboeken')"
>
  Logboeken
</button>

<button
  v-if="studentOndertekend && (stageStatus === 'stagevoorstel geaccepteerd' || stageStatus === 'lopend' || stageStatus === 'afgerond')"
  class="nav-item"
  @click="router.push('/student/evaluatie')"
>
  Evaluatie
</button>
<button
  v-if="studentOndertekend && (stageStatus === 'stagevoorstel geaccepteerd' || stageStatus === 'lopend' || stageStatus === 'afgerond')"
  class="nav-item"
  @click="router.push('/student/documenten')"
>
  Documenten
</button>
      </nav>

      <div class="sidebar-footer">
        <button v-if="heeftMeerdereRollen" class="nav-item wissel-rol-btn" @click="router.push('/kies-rol')">Wissel rol</button>
        <button class="logout-btn" @click="handleLogout">Uitloggen</button>
      </div>
    </aside>

    <!-- Main content -->
    <main class="main-content">
      <header class="topbar">
        <div class="topbar-user">{{ user?.voornaam }} {{ user?.achternaam }}</div>
          <img src="../../assets/erasmus-logo.png" alt="Erasmus Hogeschool Brussel" class="topbar-logo" />
      </header>

      <!-- ── Mijn Stage View ── -->
      <div class="mijn-stage">

        <!-- FORM: no stage, needs changes, or rejected and wants to create new -->
        <div v-if="!stage || stage.status === 'stagevoorstel aanpassingen vereist' || (stage.status === 'stagevoorstel geweigerd' && criarNovo)">
          <div v-if="stage && stage.status === 'stagevoorstel aanpassingen vereist'" class="alert">
            ✏️ Je stagevoorstel heeft aanpassingen nodig.
          </div>

          <div v-if="stage && stage.status === 'stagevoorstel aanpassingen vereist' && info.feedback" class="feedback">
            <label>Feedback van stagecommissie:</label>
            <p>{{ info.feedback }}</p>
          </div>

          <h2>Stagevoorstel indienen</h2>

          <form @submit.prevent="handleSubmit" class="card">

            <h3>Gegevens bedrijf</h3>
            <div class="form-grid">
              <div class="form-group">
                <input v-model="form.bedrijfsnaam" type="text" placeholder="Cronos Group NV" required />
                <label>Bedrijfsnaam</label>
              </div>
              <div class="form-group">
                <input v-model="form.voornaam_stagementor" type="text" placeholder="Thomas" required />
                <label>Voornaam stagementor</label>
              </div>
              <div class="form-group">
                <input v-model="form.achternaam_stagementor" type="text" placeholder="Peeters" required />
                <label>Achternaam stagementor</label>
              </div>
              <div class="form-group">
                <input v-model="form.email_stagementor" type="email" placeholder="t.peeters@cronos.be" required />
                <label>E-mail stagementor</label>
              </div>
            </div>

            <h3>Stageperiode</h3>
            <div class="form-grid">
              <div class="form-group">
                <input v-model="form.stage_begin" type="date" required />
                <label>Startdatum</label>
              </div>
              <div class="form-group">
                <input v-model="form.stage_einde" type="date" required />
                <label>Einddatum</label>
              </div>
            </div>

            <h3>Stageopdracht</h3>
            <div class="form-group full">
              <textarea
                v-model="form.beschrijving"
                rows="5"
                placeholder="Ik zal meewerken aan de ontwikkeling van een intern webplatform voor projectbeheer..."
                required
              ></textarea>
              <label>Omschrijving stageopdracht</label>
            </div>

            <h3>Competenties</h3>
            <div class="form-grid">
              <div class="form-group">
                <input v-model="form.technische_skills" type="text" placeholder="React, JavaScript" />
                <label>Technische skills</label>
              </div>
              <div class="form-group">
                <input v-model="form.tools" type="text" placeholder="REST API, Git" />
                <label>Tools</label>
              </div>
            </div>

            <h3>Werkadres</h3>
            <div class="form-grid">
              <div class="form-group">
                <input v-model="form.straat" type="text" placeholder="Luchthavenlei" required />
                <label>Straat</label>
              </div>
              <div class="form-group">
                <input v-model="form.huisnummer" type="text" placeholder="1" />
                <label>Huisnummer</label>
              </div>
              <div class="form-group">
                <input v-model="form.gemeente" type="text" placeholder="2100 Antwerpen" required />
                <label>Gemeente</label>
              </div>
              <div class="form-group">
                <input v-model="form.land" type="text" placeholder="België" />
                <label>Land</label>
              </div>
            </div>

            <div v-if="errorMessage" class="error">{{ errorMessage }}</div>

            <div class="actions">
              <button type="button" @click="handleAnnuleren" class="btn-cancel">Annuleren</button>
              <button type="submit" :disabled="loading" class="btn-submit">
                {{ loading ? 'Bezig met indienen...' : 'Indienen' }}
              </button>
            </div>
          </form>
        </div>

        <!-- READ VIEW -->
        <div v-else-if="stage">
          <div class="card">

            <div v-if="stage.status === 'stagevoorstel ingediend'" class="alert">
              ⏳ Je aanvraag is verzonden en wordt momenteel beoordeeld door de stagecommissie.
            </div>
            <div v-if="stage.status === 'stagevoorstel geaccepteerd' || stage.status === 'lopend'" class="alert success">
              ✅ Je stage is goedgekeurd!
            </div>
            <div v-if="stage.status === 'afgerond'" class="alert success">
              🎓 Je stage is afgerond!
            </div>
            <div v-if="stage.status === 'stagevoorstel aanpassingen vereist'" class="alert">
              ✏️ Je stagevoorstel heeft aanpassingen nodig.
            </div>
            <div v-if="stage.status === 'stagevoorstel geweigerd'" class="alert error">
              ❌ Je stagevoorstel is afgekeurd. Je kan een nieuw voorstel indienen.
            </div>
             <div v-if="stage.status === 'stagevoorstel geaccepteerd' && !studentOndertekend" class="actions" style="margin-top: 1.5rem; justify-content: flex-start;">
                <router-link
                :to="`/student/stages/${stage.id}/ondertekenen`"
                class="btn-submit"
                style="text-decoration: none; display: inline-block;"
                >
                  Stageovereenkomst ondertekenen
                </router-link>
              </div>
              <br>
            <h3>Gegevens bedrijf</h3>
            <div class="info-grid">
              <div class="info-item">
                <div class="field-display">{{ info.bedrijfsnaam || '-' }}</div>
                <label>Bedrijfsnaam</label>
              </div>
              <div class="info-item">
                <div class="field-display">{{ stage.stagementor?.voornaam || '-' }}</div>
                <label>Voornaam stagementor</label>
              </div>
              <div class="info-item">
                <div class="field-display">{{ stage.stagementor?.achternaam || '-' }}</div>
                <label>Achternaam stagementor</label>
              </div>
              <div class="info-item">
                <div class="field-display">{{ stage.stagementor?.email || '-' }}</div>
                <label>E-mail stagementor</label>
              </div>
            </div>

            <h3>Stageperiode</h3>
            <div class="info-grid">
              <div class="info-item">
                <div class="field-display">{{ formatDate(stage.start_datum) }}</div>
                <label>Startdatum</label>
              </div>
              <div class="info-item">
                <div class="field-display">{{ formatDate(stage.eind_datum) }}</div>
                <label>Einddatum</label>
              </div>
            </div>

            <h3>Stageopdracht</h3>
            <div class="info-item full">
              <div class="field-display textarea-display">{{ info.beschrijving || '-' }}</div>
              <label>Omschrijving stageopdracht</label>
            </div>

            <h3>Competenties</h3>
            <div class="info-grid">
              <div class="info-item">
                <div class="field-display">{{ info.technische_skills || '-' }}</div>
                <label>Technische skills</label>
              </div>
              <div class="info-item">
                <div class="field-display">{{ info.tools || '-' }}</div>
                <label>Tools</label>
              </div>
            </div>

            <h3>Werkadres</h3>
            <div class="info-grid">
              <div class="info-item">
                <div class="field-display">{{ info.straat || '-' }}</div>
                <label>Straat</label>
              </div>
              <div class="info-item">
                <div class="field-display">{{ info.huisnummer || '-' }}</div>
                <label>Huisnummer</label>
              </div>
              <div class="info-item">
                <div class="field-display">{{ info.gemeente || '-' }}</div>
                <label>Gemeente</label>
              </div>
              <div class="info-item">
                <div class="field-display">{{ info.land || '-' }}</div>
                <label>Land</label>
              </div>

              <!-- Voeg dit toe NA de laatste info-grid (werkadres), VOOR de feedback/actions divs -->
 
            </div>

            <div v-if="stage.status === 'stagevoorstel geweigerd' && info.feedback" class="feedback">
              <label>Feedback van stagecommissie:</label>
              <p>{{ info.feedback }}</p>
            </div>

            <div v-if="stage.status === 'stagevoorstel geweigerd'" class="actions">
              <button @click="handleDeleteAndCreateNew" class="btn-submit">
                + Nieuw voorstel indienen
              </button>
            </div>
          </div>
        </div>

      </div>
      <!-- ── end Mijn Stage View ── -->
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const user = JSON.parse(localStorage.getItem('user'))
const heeftMeerdereRollen = (user?.rollen?.length ?? 0) > 1
const activeView = ref('mijn-stage')

// ── Stage state ──────────────────────────────────────────────
const stage = ref(null)
const stageStatus = ref(null)
const criarNovo = ref(false)
const loading = ref(false)
const errorMessage = ref('')

const initialForm = {
  bedrijfsnaam: '',
  voornaam_stagementor: '',
  achternaam_stagementor: '',
  email_stagementor: '',
  stage_begin: '',
  stage_einde: '',
  beschrijving: '',
  technische_skills: '',
  tools: '',
  straat: '',
  huisnummer: '',
  gemeente: '',
  land: ''
}

const form = ref({ ...initialForm })

const info = computed(() => stage.value?.stagevoorstellen || {})

// Pre-fill form when changes are required.
// Belangrijk: de mentorvelden worden hier gevuld met de HUIDIGE stagementor
// (uit stage.stagementor, afkomstig van GET /api/stagevoorstellen/mijn).
// Zo moet de student niet elke keer opnieuw dezelfde mentor intypen, en als
// hij/zij wél een andere mentor invult, wordt dat correct doorgestuurd naar
// de PUT-route die de stagementor_id bijwerkt.
watch(stage, (newStage) => {
  if (newStage?.status === 'stagevoorstel aanpassingen vereist') {
    form.value = {
      bedrijfsnaam: info.value.bedrijfsnaam || '',
      voornaam_stagementor: newStage.stagementor?.voornaam || '',
      achternaam_stagementor: newStage.stagementor?.achternaam || '',
      email_stagementor: newStage.stagementor?.email || '',
      stage_begin: newStage.start_datum || '',
      stage_einde: newStage.eind_datum || '',
      beschrijving: info.value.beschrijving || '',
      technische_skills: info.value.technische_skills || '',
      tools: info.value.tools || '',
      straat: info.value.straat || '',
      huisnummer: info.value.huisnummer || '',
      gemeente: info.value.gemeente || '',
      land: info.value.land || ''
    }
  }
})

// ── Helpers ──────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('nl-BE')
}

// ── API calls ─────────────────────────────────────────────────
async function loadStage() {
  const token = localStorage.getItem('token')
  try {
    const response = await fetch('/api/stagevoorstellen/mijn', {
      headers: { Authorization: `Bearer ${token}` }
    })
    const data = await response.json()
    if (Array.isArray(data) && data.length > 0) {
      stage.value = data[0]
      stageStatus.value = data[0].status
    } else {
      stage.value = null
      stageStatus.value = null
    }
  } catch (err) {
    console.error(err)
  }
}
const studentOndertekend = computed(() => {
  return stage.value?.stagevoorstellen?.student_ondertekend === true
})

async function handleSubmit() {
  loading.value = true
  errorMessage.value = ''

  const token = localStorage.getItem('token')
  const isUpdate = stage.value?.status === 'stagevoorstel aanpassingen vereist'

  try {
    const url = isUpdate
      ? `/api/stagevoorstellen/${stage.value.id}`
      : '/api/stagevoorstellen'

    const response = await fetch(url, {
      method: isUpdate ? 'PUT' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(form.value)
    })

    const data = await response.json()
    if (!response.ok) throw new Error(data.error)

    await loadStage()
    form.value = { ...initialForm }
    criarNovo.value = false
  } catch (err) {
    errorMessage.value = err.message || 'Indienen mislukt'
  } finally {
    loading.value = false
  }
}

async function handleDeleteAndCreateNew() {
  const token = localStorage.getItem('token')
  try {
    const response = await fetch(`/api/stagevoorstellen/${stage.value.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error)
    }

    stage.value = null
    stageStatus.value = null
    criarNovo.value = false
    form.value = { ...initialForm }
  } catch (err) {
    errorMessage.value = err.message || 'Verwijderen mislukt'
  }
}

function handleAnnuleren() {
  form.value = { ...initialForm }
  errorMessage.value = ''
  criarNovo.value = false
}

function handleLogout() {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  router.push('/login')
}

onMounted(loadStage)
</script>

<style scoped>
/* ── Layout ─────────────────────────────────────────────────── */
.dashboard {
  display: flex;
  min-height: 100vh;
  font-family: Arial, Helvetica, sans-serif;
  background: #f5f7fa;
}

/* ── Sidebar ─────────────────────────────────────────────────── */
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
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
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
  transition: background 0.15s;
}

.nav-item:hover { background: #f0f7fc; }
.nav-item.active { background: #29a8e0; color: white; }

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

/* ── Main ────────────────────────────────────────────────────── */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── Topbar ──────────────────────────────────────────────────── */
.topbar {
  background: white;
  padding: 0.75rem 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e0e0e0;
}
.topbar-logo {
  height: 36px;
  object-fit: contain;
}


.topbar-user {
  background: #e8e8e8;
  border-radius: 6px;
  padding: 0.4rem 1rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: #222;
}

/* ── Mijn Stage ──────────────────────────────────────────────── */
.mijn-stage {
  padding: 1.5rem 2rem;
  max-width: 950px;
  margin: 0 auto;
  width: 100%;
  overflow-y: auto;
}

h2 {
  color: #111;
  font-size: 1.4rem;
  font-weight: 700;
  margin-bottom: 1.5rem;
}

.card {
  background: white;
  border-radius: 10px;
  border-top: 3px solid #29a8e0;
  padding: 2rem;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}

h3 {
  color: #333;
  font-size: 1rem;
  margin: 1.5rem 0 1rem 0;
  font-weight: 700;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #eee;
}

h3:first-of-type {
  margin-top: 0;
}

/* ── Alerts ──────────────────────────────────────────────────── */
.alert {
  background: #fff8d6;
  border-left: 4px solid #f5d142;
  padding: 0.85rem 1rem;
  border-radius: 4px;
  margin-bottom: 1.5rem;
  font-size: 0.9rem;
  color: #555;
}

.alert.success {
  background: #d6f5d6;
  border-left-color: #4caf50;
  color: #2d6b2d;
}

.alert.error {
  background: #fdecea;
  border-left-color: #f44336;
  color: #b71c1c;
}

/* ── Hint ────────────────────────────────────────────────────── */
.hint {
  font-size: 0.82rem;
  color: #666;
  background: #f0f7fc;
  border-left: 4px solid #29a8e0;
  padding: 0.6rem 0.85rem;
  border-radius: 4px;
  margin: -0.75rem 0 1.5rem;
}

/* ── Grids ───────────────────────────────────────────────────── */
.info-grid,
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem 1.5rem;
  margin-bottom: 1.5rem;
}

.info-item,
.form-group {
  display: flex;
  flex-direction: column;
}

.info-item.full,
.form-group.full {
  grid-column: 1 / -1;
  margin-bottom: 1.5rem;
}

/* ── Field display ───────────────────────────────────────────── */
.field-display {
  background: #f0f0f0;
  padding: 0.65rem 0.85rem;
  border-radius: 6px;
  font-size: 0.95rem;
  color: #333;
  min-height: 1.5rem;
  font-weight: 600;
}

.textarea-display {
  min-height: 6rem;
  white-space: pre-wrap;
}

.info-item label,
.form-group label {
  font-size: 0.72rem;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin-top: 0.35rem;
}

/* ── Form inputs ─────────────────────────────────────────────── */
.form-group input,
.form-group textarea {
  background: white;
  padding: 0.55rem 0.75rem;
  border: 1px solid #d5dae0;
  border-radius: 6px;
  font-size: 0.92rem;
  font-family: inherit;
  color: #222;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.form-group input::placeholder,
.form-group textarea::placeholder {
  color: #aaa;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #29a8e0;
  box-shadow: 0 0 0 3px rgba(41,168,224,0.12);
  background: white;
}

/* ── Feedback ────────────────────────────────────────────────── */
.feedback {
  margin-top: 1.5rem;
  padding: 1rem;
  background: #fff8f0;
  border-left: 4px solid #ff9800;
  border-radius: 4px;
}

.feedback label {
  font-weight: 600;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: #666;
}

/* ── Error ───────────────────────────────────────────────────── */
.error {
  background: #fdecea;
  color: #b71c1c;
  border: 1px solid #f5c6cb;
  border-radius: 6px;
  padding: 0.75rem;
  font-size: 0.92rem;
  font-weight: 600;
  margin-bottom: 1rem;
}

/* ── Actions ─────────────────────────────────────────────────── */
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1rem;
}

.btn-cancel,
.btn-submit {
  padding: 0.65rem 1.5rem;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 700;
  transition: opacity 0.15s;
}

.btn-cancel {
  background: #aaa;
  color: white;
}

.btn-cancel:hover {
  opacity: 0.88;
}

.btn-submit {
  background: #29a8e0;
  color: white;
  box-shadow: 0 2px 4px rgba(41,168,224,0.25);
  transition: background 0.15s, box-shadow 0.15s, transform 0.05s;
}

.btn-submit:hover:not(:disabled) {
  background: #1e90c0;
  box-shadow: 0 4px 8px rgba(41,168,224,0.35);
}

.btn-submit:active:not(:disabled) { transform: translateY(1px); }

.btn-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>