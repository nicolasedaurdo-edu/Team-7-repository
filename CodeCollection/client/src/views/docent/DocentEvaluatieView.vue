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

    <button class="nav-item" @click="router.push(`/docent/logboeken/${route.params.studentId}?pagina=stageinfo`)">Stageinfo</button>
    <button class="nav-item" @click="router.push(`/docent/logboeken/${route.params.studentId}`)">Logboek</button>
    <button class="nav-item active">Evaluatie</button>
    <button class="nav-item" @click="router.push(`/docent/logboeken/${route.params.studentId}?pagina=documenten`)">Documenten</button>
  </nav>

  <div class="sidebar-footer">
    <button v-if="heeftMeerdereRollen" class="nav-item wissel-rol-btn" @click="router.push('/kies-rol')">Wissel rol</button>
    <button class="logout-btn" @click="handleLogout">Uitloggen</button>
  </div>
</aside>

    <main class="main-content">

      <header class="topbar">
        <div class="topbar-links">
          <div class="topbar-user">{{ gebruikerNaam }}</div>
         
        </div>
        <img src="../../assets/erasmus-logo.png" alt="Erasmus Hogeschool Brussel" class="topbar-logo" />
      </header>

      <section class="content-area">

        <div class="tabs-rij">
          <div class="tabs">
            <button
              :class="['tab-btn', { active: actieveTab === 'tussentijds' }]"
              @click="actieveTab = 'tussentijds'"
            >
              Tussentijds
            </button>
            <button
              :class="['tab-btn', { active: actieveTab === 'eindevaluatie' }]"
              @click="actieveTab = 'eindevaluatie'"
            >
              Eindevaluatie
            </button>
          </div>

          <div class="status-selector">
            <label for="evaluatie-status" class="status-label">Evaluatiestatus</label>
            <select
              id="evaluatie-status"
              class="status-select"
              :value="evaluatieStatus"
              :disabled="bezig"
              @change="wijzigEvaluatieStatus($event.target.value)"
            >
              <option v-for="optie in evaluatieStatusOpties" :key="optie.waarde" :value="optie.waarde">
                {{ optie.label }}
              </option>
            </select>
          </div>
        </div>

        <div v-if="loading" class="status-message">Evaluaties laden...</div>
        <div v-else-if="fout" class="status-message error">{{ fout }}</div>

        <div v-else class="rubriek-tabel">

          <div class="rubriek-header">
            <div class="col-criteria">Criteria</div>
            <div class="col-eval">Zelfevaluatie (student)</div>
            <div class="col-eval">Evaluatie (stagementor)</div>
            <div class="col-eval">Eindconclusie (docent)</div>
          </div>

          <div
            v-for="(competentie, index) in competenties"
            :key="competentie.id"
            class="rubriek-rij"
          >
            <div class="col-criteria">
              <span class="lo-badge">LO{{ index + 1 }}</span>
              <span class="lo-naam">{{ competentie.naam }}</span>
            </div>

            <div class="col-eval">
              <template v-if="getStudentEvaluatie(competentie.id)">
                <div class="score-rij">
                  <div class="score-badge">{{ getStudentEvaluatie(competentie.id).score }} / 5</div>
                  <span v-if="getRubriek(getStudentEvaluatie(competentie.id).score)" class="rubriek-label">
                    {{ getRubriek(getStudentEvaluatie(competentie.id).score).label }}
                  </span>
                </div>
                <p v-if="getBeschrijving(competentie, getStudentEvaluatie(competentie.id).score)" class="rubriek-beschrijving">
                  {{ getBeschrijving(competentie, getStudentEvaluatie(competentie.id).score) }}
                </p>
                <p class="feedback-tekst">{{ getStudentEvaluatie(competentie.id).feedback }}</p>
              </template>
              <p v-else class="leeg-tekst">Nog niet ingevuld</p>
            </div>

            <div class="col-eval">
              <template v-if="getMentorEvaluatie(competentie.id)">
                <div class="score-rij">
                  <div class="score-badge">{{ getMentorEvaluatie(competentie.id).score }} / 5</div>
                  <span v-if="getRubriek(getMentorEvaluatie(competentie.id).score)" class="rubriek-label">
                    {{ getRubriek(getMentorEvaluatie(competentie.id).score).label }}
                  </span>
                </div>
                <p v-if="getBeschrijving(competentie, getMentorEvaluatie(competentie.id).score)" class="rubriek-beschrijving">
                  {{ getBeschrijving(competentie, getMentorEvaluatie(competentie.id).score) }}
                </p>
                <p class="feedback-tekst">{{ getMentorEvaluatie(competentie.id).feedback }}</p>
              </template>
              <p v-else class="leeg-tekst">Nog niet ingevuld</p>
            </div>

            <div class="col-eval col-docent">
  <div class="score-opties">
    <button
      v-for="optie in scoreOpties"
      :key="optie.waarde"
      type="button"
      class="score-optie-btn"
      :class="{ gekozen: Number(getDocentEvaluatie(competentie.id)?.score) === optie.waarde }"
      :disabled="opgeslagen[`${competentie.id}_${actieveTab}`]"
      @click="setScore(competentie.id, optie.waarde)"
    >
      <span class="optie-titel">{{ optie.waarde }} — {{ optie.label }}</span>
      <span v-if="getBeschrijving(competentie, optie.waarde)" class="optie-beschrijving">
        {{ getBeschrijving(competentie, optie.waarde) }}
      </span>
    </button>
  </div>

  <textarea
    class="tekstvak"
    placeholder="Eindconclusie / feedback van de docent..."
    :value="getDocentEvaluatie(competentie.id)?.feedback || ''"
    @input="setFeedback(competentie.id, $event.target.value)"
    :disabled="opgeslagen[`${competentie.id}_${actieveTab}`]"
  ></textarea>

  <div class="opslaan-rij">
    <button
      v-if="!opgeslagen[`${competentie.id}_${actieveTab}`]"
      class="opslaan-btn"
      @click="slaOp(competentie.id)"
      :disabled="bezigOpslaan[competentie.id]"
    >
      {{ bezigOpslaan[competentie.id] ? 'Opslaan...' : 'Opslaan' }}
    </button>
    <button
      v-if="opgeslagen[`${competentie.id}_${actieveTab}`]"
      class="bewerken-btn"
      @click="opgeslagen[`${competentie.id}_${actieveTab}`] = false"
    >
      Bewerken
    </button>
    <span v-if="opgeslagen[`${competentie.id}_${actieveTab}`]" class="opgeslagen-melding">✓ Definitief opgeslagen</span>
    <span v-if="foutMelding[competentie.id]" class="fout-melding">{{ foutMelding[competentie.id] }}</span>
  </div>
</div>

          </div>
        </div>

      </section>
    </main>
  </div>
</template>

<script setup>
import { useDocentEvaluatie } from './useDocentEvaluatie.js'
import { useRouter, useRoute } from 'vue-router'
const router = useRouter()
const route = useRoute()
const {
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
} = useDocentEvaluatie(route.params.studentId)
</script>

<style>
html, body, #app {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
}
</style>

<style scoped>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  font-family: Arial, Helvetica, sans-serif;
}

.dashboard-layout {
  display: flex;
  min-height: 100vh;
  background: #f0f4f8;
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

.topbar-links {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.topbar-user {
  background: #e8e8e8;
  border-radius: 6px;
  padding: 0.4rem 1rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: #222;
}

.topbar-role {
  font-size: 0.8rem;
  font-weight: 600;
  color: #888;
}

.topbar-logo {
  height: 36px;
  object-fit: contain;
}

.content-area {
  padding: 1.5rem 2rem;
  overflow-y: auto;
  flex: 1;
}

.tabs-rij {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.tabs {
  display: flex;
  gap: 0;
  background: white;
  border-radius: 8px;
  padding: 0.3rem;
  width: fit-content;
  border: 1px solid #e0e0e0;
}

.tab-btn {
  background: none;
  border: none;
  padding: 0.6rem 1.5rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: #888;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.15s;
}

.tab-btn:hover {
  color: #29a8e0;
}

.tab-btn.active {
  background: #29a8e0;
  color: white;
}

.status-selector {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.status-label {
  font-size: 0.85rem;
  font-weight: 700;
  color: #555;
}

.status-select {
  background: white;
  color: #1a7ab5;
  border: 2px solid #29a8e0;
  border-radius: 6px;
  padding: 0.5rem 0.9rem;
  font-size: 0.88rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
}

.status-select:hover:not(:disabled) {
  background: #e0f0fb;
}

.status-select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.status-message {
  color: #888;
  padding: 2rem 0;
  font-size: 0.95rem;
  text-align: center;
}

.status-message.error { color: #e53935; }

.rubriek-tabel {
  width: 100%;
  border: 1px solid #d0d0d0;
  border-radius: 10px;
  overflow: hidden;
  background: white;
}

.rubriek-header,
.rubriek-rij {
  display: grid;
  grid-template-columns: 180px 1fr 1fr 1.3fr;
  border-bottom: 1px solid #e0e0e0;
}

.rubriek-rij:last-child {
  border-bottom: none;
}

.rubriek-header {
  background: #29a8e0;
  color: white;
  font-weight: 700;
  font-size: 0.85rem;
}

.rubriek-header > div {
  padding: 0.75rem;
  border-right: 1px solid rgba(255, 255, 255, 0.2);
}

.col-criteria {
  color: black;
  padding: 0.85rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  border-right: 1px solid #e0e0e0;
  background: #f0f4f8;
}

.lo-badge {
  font-size: 0.72rem;
  font-weight: 800;
  color: white;
  background: #29a8e0;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  width: fit-content;
}

.lo-naam {
  font-size: 0.88rem;
  font-weight: 600;
  color: #222;
}

.col-eval {
  padding: 0.85rem 0.9rem;
  border-right: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.col-eval:last-child {
  border-right: none;
}

.score-rij {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.score-badge {
  font-size: 0.82rem;
  font-weight: 800;
  color: #1a7ab5;
  background: #e0f0fb;
  padding: 0.25rem 0.6rem;
  border-radius: 5px;
  width: fit-content;
}

.rubriek-label {
  font-size: 0.82rem;
  font-weight: 700;
  color: #1a7ab5;
}

.rubriek-beschrijving {
  font-size: 0.82rem;
  color: #666;
  font-style: italic;
}

.feedback-tekst {
  font-size: 0.88rem;
  color: #333;
  line-height: 1.5;
}

.leeg-tekst {
  font-size: 0.85rem;
  color: #aaa;
  font-style: italic;
}

/* ── Docent eindconclusie-kolom ── */
.col-docent {
  background: #f7fbfe;
}

.score-opties {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.score-optie-btn {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  text-align: left;
  background: white;
  border: 1px solid #cdd9e3;
  border-radius: 6px;
  padding: 0.45rem 0.6rem;
  font-size: 0.82rem;
  font-weight: 600;
  color: #333;
  cursor: pointer;
  transition: all 0.15s;
}

.optie-titel {
  font-weight: 700;
}

.optie-beschrijving {
  font-weight: 400;
  font-size: 0.78rem;
  color: #666;
  line-height: 1.35;
}

.score-optie-btn.gekozen .optie-beschrijving {
  color: #eaf6ff;
}

.score-optie-btn:hover:not(:disabled) {
  border-color: #29a8e0;
  background: #e0f0fb;
}

.score-optie-btn.gekozen {
  background: #29a8e0;
  border-color: #29a8e0;
  color: white;
}

.score-optie-btn:disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.tekstvak {
  width: 100%;
  min-height: 70px;
  padding: 0.5rem 0.65rem;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: 0.85rem;
  font-family: inherit;
  color: #222;
  resize: vertical;
  background: white;
}

.tekstvak:focus {
  outline: none;
  border-color: #29a8e0;
}

.tekstvak:disabled {
  background: #f0f0f0;
  color: #999;
  cursor: not-allowed;
}

.opslaan-rij {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.opslaan-btn {
  background: #29a8e0;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 0.45rem 1.1rem;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
}

.opslaan-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.bewerken-btn {
  background: white;
  color: #29a8e0;
  border: 2px solid #29a8e0;
  border-radius: 6px;
  padding: 0.4rem 0.9rem;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
}

.opgeslagen-melding {
  font-size: 0.82rem;
  color: #43a047;
  font-weight: 700;
}

.fout-melding {
  font-size: 0.82rem;
  color: #e53935;
  font-weight: 600;
}
.wissel-rol-btn { background: white; color: #29a8e0; border: 1px solid #29a8e0; margin-bottom: 0.5rem; }
</style>