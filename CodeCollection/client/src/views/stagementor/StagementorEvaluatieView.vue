<template>
  <div class="dashboard-layout">

    <aside class="sidebar">
      <div class="sidebar-brand">
        <span class="brand-text">STAGE.BE</span>
      </div>
      <nav class="sidebar-nav">
        <button class="nav-item nav-back" @click="router.push('/stagementor')">
          ← Mijn studenten
        </button>

        <div class="nav-separator"></div>

        <button class="nav-item" @click="router.push(`/stagementorlogboeken/${studentId}`)">Logboek</button>
        <button class="nav-item active" @click="$router.push('/stagementor/evaluatie/' + studentId)">Evaluatie</button>
        <button class="nav-item" @click="router.push(`/stagementorlogboeken/${studentId}?tab=documenten`)">Documenten</button>
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

        <!-- Laden / fout / geen evaluatie -->
        <div v-if="loading" class="evaluaties-laden">Evaluaties laden...</div>
        <div v-else-if="fout" class="status-message error">{{ fout }}</div>
        <div v-else-if="evaluatieStatus === 'geen'" class="geblokkeerd-melding">
          Er is momenteel geen evaluatie beschikbaar. Wacht tot de docent een fase activeert.
        </div>

        <template v-else>
          <!-- Tabs -->
          <div class="tabs">
            <button
              v-if="tussentijdsZichtbaar"
              :class="['tab-btn', { active: actieveTab === 'tussentijds' }]"
              @click="actieveTab = 'tussentijds'"
            >
              Tussentijds
            </button>
            <button
              :class="['tab-btn', { active: actieveTab === 'eindevaluatie' }, { geblokkeerd: !eindevaluatieZichtbaar }]"
              @click="eindevaluatieZichtbaar && (actieveTab = 'eindevaluatie')"
            >
              Eindevaluatie
            </button>
          </div>

          <!-- Statusmeldingen per situatie -->
          <div v-if="actieveTab === 'tussentijds' && !tussentijdsBewerkbaar" class="geblokkeerd-melding">
            De tussentijdse evaluatie kan niet meer bewerkt worden.
          </div>
          <div v-if="actieveTab === 'eindevaluatie' && !eindevaluatieZichtbaar" class="geblokkeerd-melding">
            Eindevaluatie is nog niet beschikbaar. Wacht tot de docent dit activeert.
          </div>
          <div v-if="actieveTab === 'eindevaluatie' && eindevaluatieZichtbaar && !eindevaluatieBewerkbaar" class="geblokkeerd-melding">
            De eindevaluatie kan niet meer bewerkt worden.
          </div>

          <div :class="['rubriek-tabel', { 'eindevaluatie-bg': actieveTab === 'eindevaluatie' }]">
            <div class="rubriek-header">
              <div class="col-criteria">Criteria</div>
              <div class="col-score" v-for="optie in scoreOpties" :key="optie.waarde">
                <span class="score-punten">{{ optie.waarde }} punten</span>
                <span class="score-label">{{ optie.label }}</span>
              </div>
              <div class="col-studevaluatie">Evaluatie</div>
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

              <div
                class="col-score"
                v-for="optie in scoreOpties"
                :key="optie.waarde"
                :class="{ geselecteerd: Number(getEvaluatie(competentie.id)?.score) === optie.waarde }"
                @click="huidigeBewerkbaar && !opgeslagen[`${competentie.id}_${actieveTab}`] && setScore(competentie.id, optie.waarde)"
              >
                <p class="optie-beschrijving">{{ getBeschrijving(competentie, optie.waarde) || optie.beschrijving }}</p>
                <input
                  type="radio"
                  :name="'score-' + competentie.id"
                  :value="optie.waarde"
                  :checked="Number(getEvaluatie(competentie.id)?.score) === optie.waarde"
                  :disabled="!huidigeBewerkbaar || opgeslagen[`${competentie.id}_${actieveTab}`]"
                  @change="setScore(competentie.id, optie.waarde)"
                />
              </div>

              <div class="col-studevaluatie">
                <textarea
                  class="tekstvak"
                  placeholder="Jouw evaluatie..."
                  :value="getEvaluatie(competentie.id)?.feedback || ''"
                  @input="setFeedback(competentie.id, $event.target.value)"
                  :disabled="!huidigeBewerkbaar || opgeslagen[`${competentie.id}_${actieveTab}`]"
                ></textarea>
                <div class="opslaan-rij">
                  <button
                    v-if="huidigeBewerkbaar && !opgeslagen[`${competentie.id}_${actieveTab}`]"
                    class="opslaan-btn"
                    @click="slaOp(competentie.id)"
                    :disabled="bezig[competentie.id]"
                  >
                    {{ bezig[competentie.id] ? 'Opslaan...' : 'Opslaan' }}
                  </button>
                  <button
                    v-if="huidigeBewerkbaar && opgeslagen[`${competentie.id}_${actieveTab}`]"
                    class="bewerken-btn"
                    @click="opgeslagen[`${competentie.id}_${actieveTab}`] = false"
                  >
                    Bewerken
                  </button>
                  <span v-if="opgeslagen[`${competentie.id}_${actieveTab}`]" class="opgeslagen-melding">✓ Opgeslagen</span>
                  <span v-if="foutMelding[competentie.id]" class="fout-melding">{{ foutMelding[competentie.id] }}</span>
                </div>
              </div>
            </div>
          </div>
        </template>

      </section>
    </main>
  </div>
</template>

<script setup>
import { useStagementorEvaluatie } from './useStagementorEvaluatie.js'
import { useRouter, useRoute } from 'vue-router'
const router = useRouter()
const route = useRoute()
const studentId = route.params.studentId
const heeftMeerdereRollen = (JSON.parse(localStorage.getItem('user') || '{}').rollen?.length ?? 0) > 1
const {
  gebruikerNaam,
  actieveTab,
  evaluatieStatus,
  tussentijdsZichtbaar,
  eindevaluatieZichtbaar,
  tussentijdsBewerkbaar,
  eindevaluatieBewerkbaar,
  huidigeBewerkbaar,
  openCompetentie,
  competenties,
  evaluaties,
  loading,
  fout,
  bezig,
  opgeslagen,
  foutMelding,
  scoreOpties,
  getBeschrijving,
  toggleCompetentie,
  getEvaluatie,
  getMentorEvaluatie,
  setScore,
  setFeedback,
  slaOp,
  handleLogout,
} = useStagementorEvaluatie(studentId)
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

/* ── Layout ── */
.dashboard-layout {
  display: flex;
  min-height: 100vh;
  background: #f5f7fa;
}

/* ── Sidebar ── */
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

/* ── Main ── */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── Topbar ── */
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

/* ── Content area ── */
.content-area {
  padding: 1.5rem 2rem;
  overflow-y: auto;
  flex: 1;
}

/* ── Tabs ── */
.tabs {
  display: flex;
  gap: 0;
  margin-bottom: 1.5rem;
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

.tab-btn.geblokkeerd {
  color: #aaa;
  cursor: not-allowed;
}

/* ── Feedback banners ── */
.geblokkeerd-melding {
  background: #e8f4fb;
  border: 1px solid #b0d4e8;
  border-radius: 8px;
  padding: 1rem 1.25rem;
  font-size: 0.92rem;
  font-weight: 600;
  color: #1a7ab5;
  margin-bottom: 1rem;
}

.status-message {
  color: #888;
  padding: 2rem 0;
  font-size: 0.95rem;
  text-align: center;
}

.status-message.error { color: #e53935; }

.evaluaties-laden {
  font-size: 0.85rem;
  color: #888;
  font-style: italic;
  padding: 0.4rem 0;
  text-align: left;
}

/* ── Rubriek tabel ── */
.rubriek-tabel {
  width: 100%;
  border: 1px solid #d0d0d0;
  border-radius: 10px;
  overflow: hidden;
  background: white;
}

.eindevaluatie-bg .col-score {
  background: white;
}

.eindevaluatie-bg .col-score:hover {
  background: #f0f4f8;
}

.eindevaluatie-bg .col-score.geselecteerd {
  background: #d6eef9;
  border-left: 3px solid #29a8e0;
}

.rubriek-header,
.rubriek-rij {
  display: grid;
  grid-template-columns: 150px repeat(3, 1fr) 300px;
  border-bottom: 1px solid #e0e0e0;
}

.rubriek-rij:last-child {
  border-bottom: none;
}

.rubriek-header {
  background: #29a8e0;
  color: white;
  font-weight: 700;
  font-size: 0.82rem;
}

.rubriek-header > div {
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  border-right: 1px solid rgba(255, 255, 255, 0.2);
}

.score-punten {
  font-weight: 800;
  font-size: 0.85rem;
}

.score-label {
  font-size: 0.75rem;
  opacity: 0.85;
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

.col-score {
  padding: 0.75rem 0.6rem;
  border-right: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  cursor: pointer;
  transition: background 0.15s;
}

.col-score:hover {
  background: #f0f4f8;
}

.col-score.geselecteerd {
  background: #d6eef9;
  border-left: 3px solid #29a8e0;
}

.col-score .optie-beschrijving {
  font-size: 0.88rem;
  font-weight: 500;
  font-style: italic;
  color: #333;
  line-height: 1.5;
  flex: 1;
  margin: 0;
}

.col-score input[type="radio"] {
  margin-top: 0.5rem;
  accent-color: #29a8e0;
}

.col-studevaluatie {
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

/* ── Textarea ── */
.tekstvak {
  width: 100%;
  min-height: 90px;
  padding: 0.6rem 0.75rem;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: 0.9rem;
  font-family: inherit;
  color: #222;
  resize: vertical;
  transition: border-color 0.15s;
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
  border-color: #ddd;
}

/* ── Save row ── */
.opslaan-rij {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.opslaan-btn {
  background: #29a8e0;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 0.5rem 1.25rem;
  font-size: 0.88rem;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s;
}

.opslaan-btn:hover:not(:disabled) {
  opacity: 0.88;
}

.opslaan-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.rubriek-header .col-score {
  background: #29a8e0;
  cursor: default;
}

.opgeslagen-melding {
  font-size: 0.85rem;
  color: #43a047;
  font-weight: 700;
}

.bewerken-btn {
  background: white;
  color: #29a8e0;
  border: 2px solid #29a8e0;
  border-radius: 6px;
  padding: 0.45rem 1rem;
  font-size: 0.88rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s;
}

.bewerken-btn:hover {
  background: #e0f0fb;
}

.fout-melding {
  font-size: 0.85rem;
  color: #e53935;
  font-weight: 600;
}
</style>