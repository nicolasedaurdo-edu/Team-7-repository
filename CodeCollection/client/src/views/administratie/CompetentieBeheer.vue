<template>
  <div class="dashboard-layout">
    <aside class="sidebar">
      <div class="sidebar-brand">
        <span class="brand-text">STAGE.BE</span>
      </div>

      <nav class="sidebar-nav">
  <router-link to="/administratie" class="nav-item">
    Accountbeheer
  </router-link>
  <router-link to="/administratie/competentiebeheer" class="nav-item" :class="{ active: true }">
    Competentiebeheer
  </router-link>
          <button class="nav-item" @click="router.push('/administratie/stagebeheer')">
          Stagebeheer
        </button>
</nav>


      <div class="sidebar-footer">
        <button v-if="heeftMeerdereRollen" class="nav-item wissel-rol-btn" @click="router.push('/kies-rol')">Wissel rol</button>
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
          <h2>Competentiebeheer</h2>
        </div>

        <div v-if="loading" class="status-message">Laden...</div>
        <div v-else-if="fout" class="status-message error">{{ fout }}</div>

        <div v-else class="opleidingen-list">
          <div v-for="opleiding in opleidingen" :key="opleiding.id" class="opleiding-card">
            <div class="opleiding-header" @click="toggleOpleiding(opleiding.id)">
              <span class="arrow">{{ expanded[opleiding.id] ? '▼' : '▶' }}</span>
              <strong>Opleiding: {{ opleiding.naam }}</strong>
              <span class="totaal"
  :class="{ valid: getTotaal(opleiding) === 100, invalid: getTotaal(opleiding) !== 100 }"
>
  Totaal: {{ getTotaal(opleiding) }}%
  <span v-if="getTotaal(opleiding) !== 100"> ⚠️</span>
</span>
            </div>

            <div v-if="expanded[opleiding.id]" class="opleiding-body">
              <table class="competentie-table" v-if="opleiding.competenties && opleiding.competenties.length">
                <thead>
                  <tr>
                    <th>Naam</th>
                    <th>Percentage</th>
                    <th>Volgorde</th>
                    <th>Actief</th>
                    <th>Acties</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="comp in opleiding.competenties" :key="comp.id">
                    <td><strong>{{ comp.naam }}</strong></td>
                    <td>{{ comp.percentage }}%</td>
                    <td>{{ comp.volgorde }}</td>
                    <td>
                      <span :class="['badge', comp.actief ? 'badge-actief' : 'badge-inactief']">
                        {{ comp.actief ? 'Ja' : 'Nee' }}
                      </span>
                    </td>
                    <td class="acties">
                      <button @click="openModal(comp, opleiding.id)" class="btn-bewerken">Bewerken</button>
                      <button @click="verwijder(comp)" class="btn-verwijderen">Verwijderen</button>
                    </td>
                  </tr>
                </tbody>
              </table>

              <div v-else class="empty">Nog geen competenties.</div>

              <button class="btn-primary btn-new" @click="openModal(null, opleiding.id)">
                + Nieuwe competentie
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- Modal -->
   <div v-if="modalOpen" class="modal-overlay" @click.self="closeModal">
  <div class="modal">
    <h3>{{ editingId ? 'Competentie bewerken' : 'Nieuwe competentie' }}</h3>

    <form @submit.prevent="saveCompetentie">
      <div class="form-group">
        <label>Naam</label>
        <input v-model="form.naam" type="text" required />
      </div>
      <div class="form-group">
        <label>Beschrijving</label>
        <textarea v-model="form.beschrijving" rows="3"></textarea>
      </div>

      <div class="form-group">
        <label>Beschrijving voor 5 punten</label>
        <textarea
          v-model="form.punten_5_beschrijving"
          rows="2"
          placeholder="Wat verwacht je voor de maximale score?"
        ></textarea>
      </div>

      <div class="form-group">
        <label>Beschrijving voor 3 punten</label>
        <textarea
          v-model="form.punten_3_beschrijving"
          rows="2"
          placeholder="Wat verwacht je voor een gemiddelde score?"
        ></textarea>
      </div>

      <div class="form-group">
        <label>Beschrijving voor 0 punten</label>
        <textarea
          v-model="form.punten_0_beschrijving"
          rows="2"
          placeholder="Wat geldt als onvoldoende?"
        ></textarea>
      </div>

      <div class="form-group">
        <label>Percentage</label>
        <input v-model.number="form.percentage" type="number" min="0" max="100" required />
      </div>
      <div class="form-group">
        <label>Volgorde</label>
        <input v-model.number="form.volgorde" type="number" min="1" required />
      </div>
      <div class="form-group checkbox-group">
        <label>
          <input v-model="form.actief" type="checkbox" /> Actief
        </label>
      </div>
      
          <div v-if="modalFout" class="error-msg">{{ modalFout }}</div>

          <div class="modal-actions">
            <button type="button" @click="closeModal" class="btn-cancel">Annuleren</button>
            <button type="submit" class="btn-primary">
              {{ editingId ? 'Opslaan' : 'Aanmaken' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const opleidingen = ref([])
const loading = ref(true)
const fout = ref('')
const expanded = reactive({})

const modalOpen = ref(false)
const editingId = ref(null)
const modalFout = ref('')

const initialForm = {
  naam: '', beschrijving: '', percentage: 0, volgorde: 1, actief: true, opleiding_id: null
}
const form = ref({ ...initialForm })

const user = JSON.parse(localStorage.getItem('user') || '{}')
const gebruikerNaam = `${user.voornaam || ''} ${user.achternaam || user.naam || ''}`.trim() || 'Admin'
const heeftMeerdereRollen = (user.rollen?.length ?? 0) > 1

async function laadOpleidingen() {
  loading.value = true
  fout.value = ''
  try {
    const token = localStorage.getItem('token')
    const res = await fetch('/api/admin/opleidingen', {
      headers: { Authorization: `Bearer ${token}` }
    })
    const text = await res.text()
    const data = text ? JSON.parse(text) : []
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    opleidingen.value = data
  } catch (err) {
    fout.value = err.message
  } finally {
    loading.value = false
  }
}

function toggleOpleiding(id) {
  expanded[id] = !expanded[id]
}

function getTotaal(opleiding) {
  if (!opleiding.competenties) return 0
  return opleiding.competenties.reduce((sum, c) => sum + Number(c.percentage), 0)
}

function openModal(comp, opleidingId) {
  modalFout.value = ''
  if (comp) {
    editingId.value = comp.id
    form.value = {
      naam: comp.naam,
      beschrijving: comp.beschrijving || '',
      percentage: comp.percentage,
      volgorde: comp.volgorde,
      actief: comp.actief,
      opleiding_id: opleidingId,
      punten_5_beschrijving: comp['5punten_beschrijving'] || '',
      punten_3_beschrijving: comp['3punten_beschrijving'] || '',
      punten_0_beschrijving: comp['0punten_beschrijving'] || ''
    }
  } else {
    editingId.value = null
    form.value = { ...initialForm, opleiding_id: opleidingId }
  }
  modalOpen.value = true
}

function closeModal() {
  modalOpen.value = false
  modalFout.value = ''
}

async function saveCompetentie() {
  modalFout.value = ''
  const token = localStorage.getItem('token')
  const url = editingId.value
    ? `/api/admin/competenties/${editingId.value}`
    : '/api/admin/competenties'
  const method = editingId.value ? 'PUT' : 'POST'

  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(form.value)
    })
    const text = await res.text()
    const data = text ? JSON.parse(text) : {}
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)

    await laadOpleidingen()
    closeModal()
  } catch (err) {
    modalFout.value = err.message
  }
}

async function verwijder(comp) {
  if (!confirm(`Verwijder competentie "${comp.naam}"?`)) return

  const token = localStorage.getItem('token')
  try {
    const res = await fetch(`/api/admin/competenties/${comp.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) {
      const text = await res.text()
      const data = text ? JSON.parse(text) : {}
      throw new Error(data.error || `HTTP ${res.status}`)
    }
    await laadOpleidingen()
  } catch (err) {
    alert('Fout: ' + err.message)
  }
}

function handleLogout() {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  router.push('/')
}

onMounted(laadOpleidingen)
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
.sidebar-nav {
  flex: 1;
  padding: 1rem 0.75rem;
}

.brand-text {
  font-size: 1.4rem;
  font-weight: 800;
  color: #fff;
}

.nav-item {
  display: block;
  text-decoration: none;
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

.sidebar-footer {
  padding: 1rem 0.75rem;
}

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

.wissel-rol-btn {
  background: white;
  color: #29a8e0;
  border: 1px solid #29a8e0;
  margin-bottom: 0.5rem;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
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
  font-weight: 600;
  display: inline-block;
}
.topbar-logo {
  height: 36px;
  object-fit: contain;
}

.content-area {
  padding: 1.5rem 2rem;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.page-header h2 {
  font-size: 1.3rem;
  font-weight: 700;
  margin: 0;
}

.status-message { padding: 1rem 0; }
.status-message.error { color: #cc0000; }

.opleiding-card {
  background: white;
  border-radius: 10px;
  border-top: 3px solid #29a8e0;
  margin-bottom: 1rem;
  box-shadow: 0 2px 6px rgba(0,0,0,0.04);
  overflow: hidden;
}

.opleiding-header {
  background: #29a8e0;
  color: white;
  padding: 0.9rem 1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.95rem;
}

.arrow { font-size: 0.85rem; }

.totaal {
  margin-left: auto;
  padding: 0.25rem 0.75rem;
  border-radius: 5px;
  font-size: 0.82rem;
  font-weight: 700;
}

.totaal.valid { background: #2e7d32; }
.totaal.invalid { background: #c62828; }

.opleiding-body { padding: 1rem; }

.competentie-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  margin-bottom: 0.75rem;
}

.competentie-table th {
  background: #29a8e0;
  color: white;
  text-align: left;
  padding: 0.55rem 0.8rem;
  font-size: 0.82rem;
  font-weight: 600;
}

.competentie-table td {
  padding: 0.55rem 0.8rem;
  font-size: 0.88rem;
  border-bottom: 1px solid #f0f0f0;
  color: #1a1a1a;
}

.acties { display: flex; gap: 0.5rem; }

.btn-bewerken, .btn-verwijderen {
  padding: 0.4rem 0.75rem;
  border: none;
  border-radius: 5px;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-bewerken { background: #e8eef3; color: #29a8e0; border-radius: 6px; transition: background 0.15s; }
.btn-bewerken:hover { background: #d8e2eb; }
.btn-verwijderen { background: #f44336; color: white; transition: background 0.15s; }
.btn-verwijderen:hover { background: #d33; }

.badge {
  padding: 0.25rem 0.7rem;
  border-radius: 5px;
  font-size: 0.78rem;
  font-weight: 700;
  color: white;
}
.badge-actief { background: #4caf50; }
.badge-inactief { background: #9e9e9e; }

.empty {
  color: #888;
  font-style: italic;
  padding: 0.5rem 0 1rem;
}

.btn-primary {
  background: #29a8e0;
  color: white;
  border: none;
  padding: 0.55rem 1.1rem;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(41,168,224,0.25);
  transition: background 0.15s, box-shadow 0.15s, transform 0.05s;
}
.btn-primary:hover { background: #1e90c0; box-shadow: 0 4px 8px rgba(41,168,224,0.35); }
.btn-primary:active { transform: translateY(1px); }
.btn-new { margin-top: 0.25rem; }

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
  max-width: 480px;
  width: 90%;
}

.modal h3 { margin: 0 0 1rem; color: #111; }

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

.checkbox-group label {
  flex-direction: row;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1rem;
}

.btn-cancel {
  background: #e8eef3;
  color: #29a8e0;
  border: none;
  padding: 0.55rem 1.1rem;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.btn-cancel:hover { background: #d8e2eb; }

.error-msg {
  background: #fdecea;
  color: #cc0000;
  padding: 0.6rem 0.85rem;
  border-radius: 5px;
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
}
</style>