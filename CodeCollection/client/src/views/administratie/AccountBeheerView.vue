<template>
  <div class="dashboard-layout">
    <aside class="sidebar">
      <div class="sidebar-brand">
        <span class="brand-text">STAGE.BE</span>
      </div>

      <nav class="sidebar-nav">
        <button class="nav-item active">
          Accountbeheer
        </button>
        <button class="nav-item" @click="router.push('/administratie/competentiebeheer')">
          Competentiebeheer
        </button>
        <button class="nav-item" @click="router.push('/administratie/stagebeheer')">
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
          <h2>Accountbeheer</h2>
          <button @click="openModal()" class="btn-primary">+ Nieuw account</button>
        </div>

        <div class="filter-row">
          <select v-model="filterRol" class="filter-select">
            <option value="">Alle rollen</option>
            <option value="student">Student</option>
            <option value="docent">Docent</option>
            <option value="stagementor">Stagementor</option>
            <option value="stagecomissie">Stagecomissie</option>
            <option value="administratie">Administratie</option>
          </select>
        </div>


        <div v-if="loading" class="status-message">Laden...</div>
        <div v-else-if="fout" class="status-message error">{{ fout }}</div>

        <table v-else class="account-table">
         <thead>
            <tr>
              <th>Naam</th>
              <th>E-mail</th>
              <th>Rol</th>
              <th>Opleiding</th>
              <th @click="toggleSortStatus" class="sortable-th">
                Status <span class="sort-arrow">{{ sortIndicator }}</span>
              </th>
              <th>Acties</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="g in gefilterd" :key="g.id" :class="{ 'rij-inactief': !g.actief }">
              <td><strong>{{ g.voornaam }} {{ g.achternaam }}</strong></td>
              <td>{{ g.email }}</td>
              <td>
                <span
                  v-for="r in (g.rollen && g.rollen.length ? g.rollen : [g.rol])"
                  :key="r"
                  :class="['badge', `badge-${r}`]"
                  style="margin-right:3px"
                >{{ rolLabel(r) }}</span>
              </td>
              <td>{{ formatOpleidingen(g.opleidingen) }}</td>
              <td>
                <span :class="['status-badge', g.actief ? 'status-actief' : 'status-inactief']">
                  {{ g.actief ? 'Actief' : 'Inactief' }}
                </span>
              </td>
              <td class="acties">
                <button @click="openModal(g)" class="btn-bewerken">Bewerken</button>
                <button @click="verwijder(g)" class="btn-verwijderen">Verwijderen</button>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>

    <!-- Modal -->
    <div v-if="modalOpen" class="modal-overlay" @click.self="closeModal">
      <div class="modal">
        <h3>{{ editingId ? 'Account bewerken' : 'Nieuw account' }}</h3>

        <form @submit.prevent="saveAccount">
          <div class="form-group">
            <label>Voornaam</label>
            <input v-model="form.voornaam" type="text" required />
          </div>
          <div class="form-group">
            <label>Achternaam</label>
            <input v-model="form.achternaam" type="text" required />
          </div>
          <div class="form-group">
            <label>E-mail</label>
            <input v-model="form.email" type="email" required />
          </div>
          <div class="form-group">
  <label>
    Wachtwoord
    <small v-if="editingId" class="hint">(laat leeg om niet te wijzigen)</small>
  </label>
  <input
    v-model="form.wachtwoord"
    type="password"
    :required="!editingId"
    :placeholder="editingId ? '••••••••' : 'Min. 8 tekens, hoofdletter, kleine letter, cijfer'"
  />
  <small class="hint hint-block">
    Min. 8 tekens, 1 hoofdletter, 1 kleine letter, 1 cijfer
  </small>
</div>
          <div class="form-group">
            <label>Rollen <small class="hint">(minstens één verplicht)</small></label>
            <div class="rollen-checkboxes">
              <label v-for="r in alleRollen" :key="r.waarde" class="rol-checkbox-label">
                <input
                  type="checkbox"
                  :value="r.waarde"
                  v-model="form.rollen"
                  class="rol-checkbox"
                />
                {{ r.label }}
              </label>
            </div>
            <small v-if="rollenFout" class="hint" style="color:#cc0000">{{ rollenFout }}</small>
          </div>

          <div class="form-group">
            <label>
              Opleiding{{ isMultiSelect ? 'en' : '' }}
              <small v-if="isMultiSelect" class="hint">(meerdere mogelijk)</small>
              <small v-else class="hint">(één keuze)</small>
            </label>

            <!-- Dropdown searchable -->
            <div class="dropdown" :class="{ open: dropdownOpen }">
              <div class="dropdown-trigger" @click="toggleDropdown">
                <div class="selected-tags">
                  <span v-if="form.opleiding_ids.length === 0" class="placeholder">
                    Selecteer opleiding{{ isMultiSelect ? 'en' : '' }}...
                  </span>
                  <span
                    v-for="oid in form.opleiding_ids"
                    :key="oid"
                    class="tag"
                  >
                    {{ getOpleidingNaam(oid) }}
                    <span class="tag-remove" @click.stop="removeOpleiding(oid)">×</span>
                  </span>
                </div>
                <span class="dropdown-arrow">{{ dropdownOpen ? '▲' : '▼' }}</span>
              </div>

              <div v-if="dropdownOpen" class="dropdown-menu">
                <input
                  v-model="searchTerm"
                  type="text"
                  placeholder="Zoeken..."
                  class="dropdown-search"
                  @click.stop
                />
                <div class="dropdown-options">
                  <div
                    v-for="opl in gefilterdeOpleidingen"
                    :key="opl.id"
                    class="dropdown-option"
                    :class="{ selected: form.opleiding_ids.includes(opl.id) }"
                    @click="toggleOpleiding(opl.id)"
                  >
                    <span class="checkbox">
                      {{ form.opleiding_ids.includes(opl.id) ? '✓' : '' }}
                    </span>
                    {{ opl.naam }}
                  </div>
                  <div v-if="gefilterdeOpleidingen.length === 0" class="no-results">
                    Geen resultaten
                  </div>
                </div>
              </div>
            </div>
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
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const gebruikers = ref([])
const opleidingenLijst = ref([])
const loading = ref(true)
const fout = ref('')
const filterRol = ref('')

const modalOpen = ref(false)
const editingId = ref(null)
const modalFout = ref('')

const dropdownOpen = ref(false)
const searchTerm = ref('')

const initialForm = {
  voornaam: '', achternaam: '', email: '', rollen: ['student'], opleiding_ids: [], wachtwoord: ''
}
const form = ref({ ...initialForm })

const user = JSON.parse(localStorage.getItem('user') || '{}')
const gebruikerNaam = `${user.voornaam || ''} ${user.achternaam || user.naam || ''}`.trim() || 'Admin'
const heeftMeerdereRollen = (user.rollen?.length ?? 0) > 1

const alleRollen = [
  { waarde: 'student',        label: 'Student' },
  { waarde: 'docent',         label: 'Docent' },
  { waarde: 'stagementor',    label: 'Stagementor' },
  { waarde: 'stagecommissie', label: 'Stagecommissie' },
  { waarde: 'administratie',  label: 'Administratie' },
]

const rollenFout = ref('')

const isMultiSelect = computed(() => !form.value.rollen?.includes('student'))

const gefilterd = computed(() => {
  if (!filterRol.value) return gebruikers.value
  return gebruikers.value.filter(g =>
    (g.rollen && g.rollen.length ? g.rollen : [g.rol]).includes(filterRol.value)
  )
})

const gefilterdeOpleidingen = computed(() => {
  const term = searchTerm.value.toLowerCase().trim()
  if (!term) return opleidingenLijst.value
  return opleidingenLijst.value.filter(o => o.naam.toLowerCase().includes(term))
})

function rolLabel(rol) {
  const labels = {
    student: 'Student',
    docent: 'Docent',
    stagementor: 'Stagementor',
    stagecomissie: 'Stagecomissie',
    administratie: 'Administratie',
    wachtwoord: ''
  }
  return labels[rol] || rol
}

function formatOpleidingen(opleidingen) {
  if (!opleidingen || opleidingen.length === 0) return '—'
  return opleidingen.map(o => o.naam).join(', ')
}

const sortStatus = ref(null) // null | 'actief-eerst' | 'inactief-eerst'

const sortIndicator = computed(() => {
  if (sortStatus.value === 'actief-eerst') return '▲'
  if (sortStatus.value === 'inactief-eerst') return '▼'
  return '⇅'
})

function toggleSortStatus() {
  if (sortStatus.value === null) {
    sortStatus.value = 'actief-eerst'
  } else if (sortStatus.value === 'actief-eerst') {
    sortStatus.value = 'inactief-eerst'
  } else {
    sortStatus.value = null
  }
}

function getOpleidingNaam(id) {
  const opl = opleidingenLijst.value.find(o => o.id === id)
  return opl ? opl.naam : `#${id}`
}

function toggleDropdown() {
  dropdownOpen.value = !dropdownOpen.value
  if (dropdownOpen.value) searchTerm.value = ''
}

function toggleOpleiding(id) {
  if (isMultiSelect.value) {
    const idx = form.value.opleiding_ids.indexOf(id)
    if (idx >= 0) {
      form.value.opleiding_ids.splice(idx, 1)
    } else {
      form.value.opleiding_ids.push(id)
    }
  } else {
    // Student: slechts één opleiding
    form.value.opleiding_ids = [id]
    dropdownOpen.value = false
  }
}

function removeOpleiding(id) {
  form.value.opleiding_ids = form.value.opleiding_ids.filter(x => x !== id)
}

async function laadGebruikers() {
  loading.value = true
  try {
    const token = localStorage.getItem('token')
    const res = await fetch('/api/admin/gebruikers', {
      headers: { Authorization: `Bearer ${token}` }
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    gebruikers.value = data
  } catch (err) {
    fout.value = err.message
  } finally {
    loading.value = false
  }
}

async function laadOpleidingen() {
  try {
    const token = localStorage.getItem('token')
    const res = await fetch('/api/admin/opleidingen-lijst', {
      headers: { Authorization: `Bearer ${token}` }
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    opleidingenLijst.value = data
  } catch (err) {
    console.error('Fout bij laden opleidingen:', err.message)
  }
}

function openModal(gebruiker = null) {
  modalFout.value = ''
  searchTerm.value = ''
  dropdownOpen.value = false

  if (gebruiker) {
    editingId.value = gebruiker.id
    form.value = {
      voornaam: gebruiker.voornaam,
      achternaam: gebruiker.achternaam,
      email: gebruiker.email,
      rollen: gebruiker.rollen && gebruiker.rollen.length ? [...gebruiker.rollen] : [gebruiker.rol],
      opleiding_ids: (gebruiker.opleidingen || []).map(o => o.id)
    }
  } else {
    editingId.value = null
    form.value = { ...initialForm, rollen: ['student'], opleiding_ids: [] }
  }
  modalOpen.value = true
}

function closeModal() {
  modalOpen.value = false
  modalFout.value = ''
  dropdownOpen.value = false
}

async function saveAccount() {
  modalFout.value = ''
  rollenFout.value = ''

  if (!form.value.rollen || form.value.rollen.length === 0) {
    rollenFout.value = 'Kies minstens één rol.'
    return
  }

  const token = localStorage.getItem('token')
  const url = editingId.value
    ? `/api/admin/gebruikers/${editingId.value}`
    : '/api/admin/gebruikers'
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
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)

    await laadGebruikers()
    closeModal()
  } catch (err) {
    modalFout.value = err.message
  }
}

async function verwijder(g) {
  if (!confirm(`Verwijder ${g.voornaam} ${g.achternaam}?`)) return

  const token = localStorage.getItem('token')
  try {
    const res = await fetch(`/api/admin/gebruikers/${g.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error)
    }
    await laadGebruikers()
  } catch (err) {
    alert('Fout: ' + err.message)
  }
}

function handleLogout() {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  router.push('/')
}

onMounted(() => {
  laadGebruikers()
  laadOpleidingen()
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
}

.sidebar-nav {
  flex: 1;
  padding: 1rem 0.75rem;
}

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
.topbar-logo {
  height: 36px;
  object-fit: contain;
}

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
  min-width: 180px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.filter-select:focus { border-color: #29a8e0; box-shadow: 0 0 0 3px rgba(41,168,224,0.12); outline: none; }

.btn-primary {
  background: #29a8e0;
  color: white;
  border: none;
  padding: 0.55rem 1.1rem;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(41, 168, 224, 0.25);
  transition: background 0.15s, box-shadow 0.15s, transform 0.05s;
}

.btn-primary:hover { background: #1e90c0; box-shadow: 0 4px 8px rgba(41, 168, 224, 0.35); }
.btn-primary:active { transform: translateY(1px); }

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
  padding: 0.25rem 0.65rem;
  border-radius: 5px;
  font-size: 0.78rem;
  font-weight: 700;
  color: white;
}

.badge-student { background: #2196f3; }
.badge-docent { background: #ff9800; }
.badge-stagementor { background: #4caf50; }
.badge-stagecomissie { background: #9c27b0; }
.badge-administratie { background: #607d8b; }

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
  max-width: 520px;
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

.hint {
  font-weight: 400;
  color: #888;
  font-size: 0.78rem;
  margin-left: 0.4rem;
}

.form-group input,
.form-group select {
  padding: 0.55rem 0.75rem;
  border: 1px solid #d5dae0;
  border-radius: 6px;
  font-size: 0.92rem;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.form-group input:focus,
.form-group select:focus {
  border-color: #29a8e0;
  box-shadow: 0 0 0 3px rgba(41,168,224,0.12);
  outline: none;
}

/* Dropdown searchable */
.dropdown { position: relative; }

.dropdown-trigger {
  border: 1px solid #ccc;
  border-radius: 5px;
  padding: 0.4rem 0.7rem;
  background: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  min-height: 42px;
  gap: 0.5rem;
}

.dropdown.open .dropdown-trigger {
  border-color: #29a8e0;
  box-shadow: 0 0 0 2px rgba(41,168,224,0.15);
}

.selected-tags {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.placeholder {
  color: #999;
  font-size: 0.9rem;
}

.tag {
  background: #29a8e0;
  color: white;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  font-size: 0.82rem;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.tag-remove {
  cursor: pointer;
  font-weight: 700;
  font-size: 1rem;
  line-height: 1;
}
.tag-remove:hover { color: #ffe0e0; }

.dropdown-arrow {
  color: #666;
  font-size: 0.75rem;
}

.dropdown-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: white;
  border: 1px solid #ccc;
  border-radius: 5px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  z-index: 10;
  max-height: 240px;
  display: flex;
  flex-direction: column;
}

.dropdown-search {
  padding: 0.5rem 0.7rem;
  border: none;
  border-bottom: 1px solid #eee;
  border-radius: 5px 5px 0 0;
  font-size: 0.9rem;
  outline: none;
}
.status-badge {
  padding: 0.25rem 0.65rem;
  border-radius: 5px;
  font-size: 0.78rem;
  font-weight: 700;
}

.status-actief {
  background: #e3f7e8;
  color: #2e8b3d;
}

.status-inactief {
  background: #fdecea;
  color: #cc0000;
}

.rij-inactief {
  opacity: 0.6;
}

.rij-inactief td strong {
  text-decoration: line-through;
}

.dropdown-options {
  overflow-y: auto;
  flex: 1;
}

.dropdown-option {
  padding: 0.5rem 0.7rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.dropdown-option:hover { background: #f0f7fc; }
.dropdown-option.selected {
  background: #e3f2fd;
  font-weight: 600;
}

.checkbox {
  width: 18px;
  height: 18px;
  border: 1px solid #aaa;
  border-radius: 3px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  color: #29a8e0;
  background: white;
}

.dropdown-option.selected .checkbox {
  background: #29a8e0;
  color: white;
  border-color: #29a8e0;
}

.no-results {
  padding: 0.7rem;
  color: #888;
  font-style: italic;
  text-align: center;
  font-size: 0.85rem;
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
.hint-block {
  display: block;
  margin-top: 0.3rem;
  font-size: 0.75rem;
  color: #888;
}

.rollen-checkboxes {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.5rem 0;
}

.rol-checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  cursor: pointer;
  font-weight: 500;
  color: #333;
}

.rol-checkbox {
  width: 16px;
  height: 16px;
  accent-color: #29a8e0;
  cursor: pointer;
}

.wissel-rol-btn {
  background: white;
  color: #29a8e0;
  border: 1px solid #29a8e0;
}
</style>