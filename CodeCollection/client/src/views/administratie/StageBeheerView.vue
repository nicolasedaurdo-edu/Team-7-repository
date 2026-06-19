<template>
  <div class="dashboard-layout">
    <aside class="sidebar">
      <div class="sidebar-brand">
        <span class="brand-text">STAGE.BE</span>
      </div>

      <nav class="sidebar-nav">
        <button class="nav-item" @click="router.push('/administratie')">
          Accountbeheer
        </button>
        <button class="nav-item" @click="router.push('/administratie/competentiebeheer')">
          Competentiebeheer
        </button>
        <button class="nav-item active">
          Stagebeheer
        </button>
        <button v-if="heeftMeerdereRollen" class="nav-item wissel-rol-btn" @click="router.push('/kies-rol')">
          Wissel rol
        </button>
      </nav>

      <div class="sidebar-footer">
        <button class="logout-btn" @click="handleLogout">Uitloggen</button>
      </div>
    </aside>

    <main class="main-content">
      <header class="topbar">
        <div class="topbar-user">{{ gebruikerNaam }}</div>
        <img src="../../assets/erasmus-logo.png" alt="Erasmus Hogeschool Brussel" class="topbar-logo" />
      </header>

      <section class="content-area">
        <div class="page-header">
          <h2>Stagebeheer</h2>
        </div>

        <div class="filter-row">
          <select v-model="filterStatus" class="filter-select">
            <option value="">Alle statussen</option>
            <option v-for="s in statusOpties" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>

        <div v-if="loading" class="status-message">Laden...</div>
        <div v-else-if="fout" class="status-message error">{{ fout }}</div>

        <table v-else class="account-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Docent</th>
              <th>Stagementor</th>
              <th>Bedrijf</th>
              <th>Status</th>
              <th>Start</th>
              <th>Einde</th>
              <th>Acties</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in gefilterd" :key="s.id">
              <td><strong>{{ volledigeNaam(s.student) }}</strong></td>
              <td>{{ volledigeNaam(s.docent) }}</td>
              <td>{{ volledigeNaam(s.stagementor) }}</td>
              <td>{{ s.stagevoorstel?.bedrijfsnaam || '—' }}</td>
              <td><span class="status-badge status-actief">{{ s.status }}</span></td>
              <td>{{ s.start_datum || '—' }}</td>
              <td>{{ s.eind_datum || '—' }}</td>
              <td class="acties">
                <button @click="openModal(s)" class="btn-bewerken">Bewerken</button>
              </td>
            </tr>
            <tr v-if="gefilterd.length === 0">
              <td colspan="8" style="text-align:center;color:#888;">Geen stages gevonden.</td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>

    <!-- Modal -->
    <div v-if="modalOpen" class="modal-overlay" @click.self="closeModal">
      <div class="modal">
        <h3>Stage bewerken</h3>

        <form @submit.prevent="saveStage">
          <div class="form-group">
            <label>Student</label>
            <select v-model.number="form.student_id" required>
              <option v-for="g in studenten" :key="g.id" :value="g.id">{{ volledigeNaam(g) }}</option>
            </select>
          </div>

          <div class="form-group">
            <label>Docent</label>
            <select v-model.number="form.docent_id">
              <option :value="null">— Geen —</option>
              <option v-for="g in docenten" :key="g.id" :value="g.id">{{ volledigeNaam(g) }}</option>
            </select>
          </div>

          <div class="form-group">
            <label>Stagementor</label>
            <select v-model.number="form.stagementor_id" required>
              <option v-for="g in mentoren" :key="g.id" :value="g.id">{{ volledigeNaam(g) }}</option>
            </select>
          </div>

          <div class="form-group">
            <label>Status</label>
            <select v-model="form.status" required>
              <option v-for="s in statusOpties" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Startdatum</label>
              <input v-model="form.start_datum" type="date" required />
            </div>
            <div class="form-group">
              <label>Einddatum</label>
              <input v-model="form.eind_datum" type="date" required />
            </div>
          </div>

          <hr class="divider" />

          <div class="form-group">
            <label>Bedrijfsnaam</label>
            <input v-model="form.bedrijfsnaam" type="text" />
          </div>

          <div class="form-group">
            <label>Beschrijving</label>
            <textarea v-model="form.beschrijving" rows="3"></textarea>
          </div>

          <div class="form-group">
            <label>Tools</label>
            <input v-model="form.tools" type="text" />
          </div>

          <div class="form-group">
            <label>Technische skills</label>
            <input v-model="form.technische_skills" type="text" />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Straat</label>
              <input v-model="form.straat" type="text" />
            </div>
            <div class="form-group">
              <label>Huisnummer</label>
              <input v-model="form.huisnummer" type="text" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>Gemeente</label>
              <input v-model="form.gemeente" type="text" />
            </div>
            <div class="form-group">
              <label>Land</label>
              <input v-model="form.land" type="text" />
            </div>
          </div>

          <div v-if="modalFout" class="status-message error">{{ modalFout }}</div>

          <div class="modal-acties">
            <button type="button" @click="closeModal" class="btn-cancel">Annuleren</button>
            <button type="submit" class="btn-primary">Opslaan</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const stages = ref([])
const gebruikers = ref([])
const loading = ref(true)
const fout = ref('')
const filterStatus = ref('')

const modalOpen = ref(false)
const modalFout = ref('')
const editingId = ref(null)

const statusOpties = [
  'stagevoorstel ingediend',
  'stagevoorstel geaccepteerd',
  'stagevoorstel geweigerd',
  'stagevoorstel aanpassingen vereist',
  'lopend',
  'afgerond',
  'beëindigd'
]

const initialForm = {
  student_id: null, docent_id: null, stagementor_id: null,
  status: '', start_datum: '', eind_datum: '',
  bedrijfsnaam: '', beschrijving: '', tools: '', technische_skills: '',
  straat: '', huisnummer: '', gemeente: '', land: ''
}
const form = ref({ ...initialForm })

const user = JSON.parse(localStorage.getItem('user') || '{}')
const gebruikerNaam = `${user.voornaam || ''} ${user.achternaam || user.naam || ''}`.trim() || 'Admin'
const heeftMeerdereRollen = (user.rollen?.length ?? 0) > 1

function heeftRol(g, rol) {
  const rollen = g.rollen && g.rollen.length ? g.rollen : (g.rol ? [g.rol] : [])
  return rollen.includes(rol)
}

const studenten = computed(() => gebruikers.value.filter(g => heeftRol(g, 'student')))
const docenten = computed(() => gebruikers.value.filter(g => heeftRol(g, 'docent')))
const mentoren = computed(() => gebruikers.value.filter(g => heeftRol(g, 'stagementor')))

const gefilterd = computed(() => {
  if (!filterStatus.value) return stages.value
  return stages.value.filter(s => s.status === filterStatus.value)
})

function volledigeNaam(g) {
  if (!g) return '—'
  return `${g.voornaam || ''} ${g.achternaam || ''}`.trim() || '—'
}

async function laadStages() {
  loading.value = true
  try {
    const token = localStorage.getItem('token')
    const res = await fetch('/api/admin/stages', {
      headers: { Authorization: `Bearer ${token}` }
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    stages.value = data
  } catch (err) {
    fout.value = err.message
  } finally {
    loading.value = false
  }
}

async function laadGebruikers() {
  try {
    const token = localStorage.getItem('token')
    const res = await fetch('/api/admin/gebruikers', {
      headers: { Authorization: `Bearer ${token}` }
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    gebruikers.value = data
  } catch (err) {
    console.error('Fout bij laden gebruikers:', err.message)
  }
}

function openModal(stage) {
  modalFout.value = ''
  editingId.value = stage.id
  form.value = {
    student_id: stage.student_id,
    docent_id: stage.docent_id,
    stagementor_id: stage.stagementor_id,
    status: stage.status,
    start_datum: stage.start_datum || '',
    eind_datum: stage.eind_datum || '',
    bedrijfsnaam: stage.stagevoorstel?.bedrijfsnaam || '',
    beschrijving: stage.stagevoorstel?.beschrijving || '',
    tools: stage.stagevoorstel?.tools || '',
    technische_skills: stage.stagevoorstel?.technische_skills || '',
    straat: stage.stagevoorstel?.straat || '',
    huisnummer: stage.stagevoorstel?.huisnummer || '',
    gemeente: stage.stagevoorstel?.gemeente || '',
    land: stage.stagevoorstel?.land || ''
  }
  modalOpen.value = true
}

function closeModal() {
  modalOpen.value = false
  modalFout.value = ''
}

async function saveStage() {
  modalFout.value = ''
  try {
    const token = localStorage.getItem('token')
    const res = await fetch(`/api/admin/stages/${editingId.value}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(form.value)
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    closeModal()
    await laadStages()
  } catch (err) {
    modalFout.value = err.message
  }
}

function handleLogout() {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  router.push('/')
}

onMounted(() => {
  laadStages()
  laadGebruikers()
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

.sidebar-brand { padding: 1.25rem 1rem; background: #1ec8f0; }
.brand-text { font-size: 1.4rem; font-weight: 800; color: #fff; }

.sidebar-nav { flex: 1; padding: 1rem 0.75rem; }

.nav-item {
  width: 100%;
  background: transparent;
  border: none;
  border-radius: 6px;
  padding: 0.75rem 1rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: #29a8e0;
  cursor: pointer;
  margin-bottom: 0.5rem;
  text-align: left;
  transition: background 0.15s;
}
.nav-item:hover { background: #f0f7fc; }
.nav-item.active { background: #29a8e0; color: white; }

.sidebar-footer { padding: 1rem 0.75rem; }

.logout-btn {
  width: 100%;
  background: #ffeaea;
  color: #cc0000;
  border: none;
  border-radius: 6px;
  padding: 0.75rem 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.logout-btn:hover { background: #ffdada; }

.main-content { flex: 1; display: flex; flex-direction: column; }

.topbar {
  background: white;
  padding: 0.75rem 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e0e0e0;
}
.topbar-logo { height: 36px; object-fit: contain; }

.topbar-user {
  background: #e8e8e8;
  border-radius: 6px;
  padding: 0.4rem 1rem;
  font-weight: 600;
  display: inline-block;
}

.content-area { padding: 1.5rem 2rem; }

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}
.page-header h2 { font-size: 1.3rem; font-weight: 700; margin: 0; }

.filter-row { margin-bottom: 1rem; }

.filter-select {
  padding: 0.55rem 0.75rem;
  border: 1px solid #d5dae0;
  border-radius: 6px;
  font-size: 0.9rem;
  min-width: 220px;
}
.filter-select:focus { border-color: #29a8e0; box-shadow: 0 0 0 3px rgba(41,168,224,0.12); outline: none; }

.status-message { padding: 1rem 0; }
.status-message.error { color: #cc0000; }

.account-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  background: white;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 2px 6px rgba(0,0,0,0.04);
}
.account-table th {
  background: #29a8e0;
  color: white;
  text-align: left;
  padding: 0.6rem 0.9rem;
  font-size: 0.85rem;
  font-weight: 600;
}
.account-table td {
  padding: 0.6rem 0.9rem;
  font-size: 0.9rem;
  border-bottom: 1px solid #f0f0f0;
  color: #1a1a1a;
}
.account-table tbody tr:hover { background: #f8fafc; }

.acties { display: flex; gap: 0.5rem; }

.btn-bewerken {
  padding: 0.4rem 0.75rem;
  border: none;
  border-radius: 6px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  background: #e8eef3;
  color: #29a8e0;
  transition: background 0.15s;
}
.btn-bewerken:hover { background: #d8e2eb; }

.status-badge {
  padding: 0.25rem 0.65rem;
  border-radius: 5px;
  font-size: 0.78rem;
  font-weight: 700;
}
.status-actief { background: #e3f7e8; color: #2e8b3d; }

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: flex-start;   /* ← center → flex-start */
  justify-content: center;
  z-index: 1000;
  overflow-y: auto;          /* ← toevoegen */
  padding: 2rem 0;           /* ← toevoegen voor ademruimte */
}
.modal {
  background: white;
  border-radius: 8px;
  padding: 1.5rem 2rem;
  max-width: 560px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}
.modal h3 { margin: 0 0 1rem; color: #111; }

.form-row { display: flex; gap: 1rem; }
.form-row .form-group { flex: 1; }

.form-group {
  margin-bottom: 0.85rem;
  display: flex;
  flex-direction: column;
}
.form-group label {
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
  color: #333;
}
.form-group input,
.form-group select,
.form-group textarea {
  padding: 0.55rem 0.75rem;
  border: 1px solid #d5dae0;
  border-radius: 6px;
  font-size: 0.92rem;
  font-family: inherit;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  border-color: #29a8e0;
  box-shadow: 0 0 0 3px rgba(41,168,224,0.12);
  outline: none;
}

.divider { border: none; border-top: 1px solid #eee; margin: 1rem 0; }

.modal-acties {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1rem;
}

.btn-primary {
  background: #29a8e0;
  color: white;
  border: none;
  padding: 0.55rem 1.1rem;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-primary:hover { background: #1e90c0; }

.btn-cancel {
  background: #eee;
  color: #444;
  border: none;
  padding: 0.55rem 1.1rem;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}
.btn-cancel:hover { background: #e0e0e0; }
</style>
