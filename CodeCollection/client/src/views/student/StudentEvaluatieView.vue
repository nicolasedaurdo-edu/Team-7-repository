<template>
  <div class="dashboard-layout">

    <aside class="sidebar">
      <div class="sidebar-brand">
        <span class="brand-text">STAGE.BE</span>
      </div>

      <nav class="sidebar-nav">
        <button class="nav-item">Stagevoorstel</button>
        <button class="nav-item">Logboek</button>
        <button class="nav-item active">Evaluatie</button>
        <button class="nav-item">Documenten</button>
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

        <div class="tabs">
          <button
            :class="['tab-btn', { active: actieveTab === 'tussentijds' }]"
            @click="actieveTab = 'tussentijds'"
          >
            Tussentijds
          </button>
          <button
            :class="['tab-btn', { active: actieveTab === 'eindevaluatie' }, { geblokkeerd: !eindevaluatieOpen }]"
            @click="eindevaluatieOpen && (actieveTab = 'eindevaluatie')"
          >
            Eindevaluatie
          </button>
        </div>

        <div v-if="actieveTab === 'eindevaluatie' && !eindevaluatieOpen" class="geblokkeerd-melding">
          Eindevaluatie is nog niet beschikbaar. Wacht tot de docent dit activeert.
        </div>

        <div v-if="loading" class="status-message">Competenties laden...</div>
        <div v-else-if="fout" class="status-message error">{{ fout }}</div>

        <div v-else :class="['rubriek-tabel', { 'eindevaluatie-bg': actieveTab === 'eindevaluatie' }]">

          <div class="rubriek-header">
            <div class="col-criteria">Criteria</div>
            <div class="col-score" v-for="optie in scoreOpties" :key="optie.waarde">
              <span class="score-punten">{{ optie.waarde }} punten</span>
              <span class="score-label">{{ optie.label }}</span>
            </div>
            <div class="col-zelfevaluatie">Zelfevaluatie</div>
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
              :class="{ geselecteerd: scoreGeselecteerd[competentie.id] && Number(getEvaluatie(competentie.id)?.score) === optie.waarde }"
              @click="!opgeslagen[competentie.id] && setScore(competentie.id, optie.waarde)"
            >
              <p class="optie-beschrijving">{{ optie.beschrijving }}</p>
              <input
                type="radio"
                :name="'score-' + competentie.id"
                :value="optie.waarde"
                :checked="scoreGeselecteerd[competentie.id] && Number(getEvaluatie(competentie.id)?.score) === optie.waarde"
                :disabled="opgeslagen[competentie.id]"
              @change="setScore(competentie.id, optie.waarde)"
              />
            </div>

            <div class="col-zelfevaluatie">
              <textarea
                class="tekstvak"
                placeholder="Jouw zelfevaluatie..."
                :value="getEvaluatie(competentie.id)?.feedback || ''"
                @input="setFeedback(competentie.id, $event.target.value)"
                :disabled="opgeslagen[competentie.id]"
              ></textarea>
              <div class="opslaan-rij">
                <button
                  v-if="!opgeslagen[competentie.id]"
                  class="opslaan-btn"
                  @click="slaOp(competentie.id)"
                  :disabled="bezig[competentie.id]"
                >
                  {{ bezig[competentie.id] ? 'Opslaan...' : 'Opslaan' }}
                </button>
                <button
                  v-if="opgeslagen[competentie.id]"
                  class="bewerken-btn"
                  @click="opgeslagen[competentie.id] = false"
                >
                  Bewerken
                </button>
                <span v-if="opgeslagen[competentie.id]" class="opgeslagen-melding">✓ Opgeslagen</span>
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
import { useStudentEvaluatie } from './useStudentEvaluatie.js'

const {
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
} = useStudentEvaluatie()
</script>

<style scoped>
* { box-sizing: border-box; }

.dashboard-layout {
  display: flex;
  min-height: 100vh;
  font-family: 'Segoe UI', Arial, sans-serif;
  background: #eef2f7;
}

.sidebar {
  width: 280px;
  background: linear-gradient(180deg, #5a9ab8 0%, #7ab8d0 100%);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  box-shadow: 2px 0 8px rgba(0,0,0,0.08);
}

.sidebar-brand {
  padding: 1.5rem 1.25rem;
  background: rgba(0,0,0,0.12);
}

.brand-text {
  font-size: 1.8rem;
  font-weight: 900;
  color: #fff;
  letter-spacing: 1px;
}

.sidebar-nav {
  flex: 1;
  padding: 1.25rem 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.nav-item {
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  border-radius: 8px;
  padding: 0.85rem 1.25rem;
  font-size: 1rem;
  font-weight: 600;
  color: rgba(255,255,255,0.8);
  cursor: pointer;
  transition: all 0.15s;
}

.nav-item:hover {
  background: rgba(255,255,255,0.15);
  color: white;
}

.nav-item.active {
  background: white;
  color: #3a7a9e;
  box-shadow: 0 2px 6px rgba(0,0,0,0.1);
}

.sidebar-footer {
  padding: 1rem 0.85rem 1.5rem;
}

.logout-btn {
  width: 100%;
  background: rgba(255,255,255,0.12);
  border: 1px solid rgba(255,255,255,0.25);
  border-radius: 8px;
  padding: 0.7rem 1rem;
  font-size: 0.88rem;
  font-weight: 600;
  color: white;
  cursor: pointer;
  transition: all 0.15s;
}

.logout-btn:hover {
  background: rgba(255,255,255,0.22);
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.topbar {
  background: white;
  padding: 0.85rem 2rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #dde3ec;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
}

.topbar-user {
  background: #eaf1f6;
  border-radius: 8px;
  padding: 0.5rem 1.25rem;
  font-size: 1.3rem;
  font-weight: 800;
  color: #1a7aaa;
}

.topbar-logo {
  height: 36px;
  object-fit: contain;
}

.topbar-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #4a90b8;
  opacity: 0.75;
}

.content-area {
  padding: 2rem 1rem;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #f2f5f8;
}

.tabs,
.status-message,
.competenties-lijst {
  width: 100%;
  max-width: 780px;
}

.tabs {
  display: flex;
  gap: 0;
  margin-bottom: 2rem;
  background: white;
  border-radius: 10px;
  padding: 0.35rem;
  width: fit-content;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06);
}

.tab-btn {
  background: none;
  border: none;
  padding: 0.75rem 2rem;
  font-size: 1.05rem;
  font-weight: 600;
  color: #888;
  cursor: pointer;
  border-radius: 7px;
  transition: all 0.15s;
}

.tab-btn:hover {
  color: #4a90b8;
}

.tab-btn.active {
  background: #4a90b8;
  color: white;
  box-shadow: 0 2px 6px rgba(41,168,224,0.3);
}

.tab-btn.geblokkeerd {
  color: #aaa;
  cursor: not-allowed;
}

.geblokkeerd-melding {
  width: 100%;
  background: #e8f4fb;
  border: 1px solid #b0d4e8;
  border-radius: 8px;
  padding: 1.25rem 1.5rem;
  font-size: 1rem;
  font-weight: 600;
  color: #4a7a9e;
  margin-bottom: 1rem;
}

.eindevaluatie-bg {
  background: #e8f4fb;
}

.status-message {
  color: #666;
  padding: 2rem 0;
  font-size: 0.95rem;
  text-align: center;
}

.status-message.error { color: #e53935; }

.competenties-lijst {
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 2px solid #c5d5e0;
  border-radius: 8px;
  overflow: hidden;
}

.competentie-blok {
  background: #ffffff;
  border-bottom: 1px solid #c5d5e0;
}

.competentie-blok:last-child {
  border-bottom: none;
}

.competentie-header {
  width: 100%;
  background: #f4f8fb;
  border: none;
  padding: 1rem 1.25rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  transition: background 0.15s;
}

.competentie-header:hover {
  background: #e8f0f5;
}

.competentie-titel {
  display: flex;
  align-items: center;
  gap: 1rem;
  text-align: left;
}

.lo-label {
  font-size: 0.75rem;
  font-weight: 800;
  color: white;
  background: #4a90b8;
  padding: 0.25rem 0.6rem;
  border-radius: 5px;
  white-space: nowrap;
  letter-spacing: 0.3px;
}

.lo-naam {
  font-size: 0.97rem;
  font-weight: 600;
  color: #1a1a2e;
}

.competentie-rechts {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  flex-shrink: 0;
}

.score-preview {
  font-size: 0.85rem;
  font-weight: 800;
  color: white;
  background: #4a90b8;
  padding: 0.2rem 0.6rem;
  border-radius: 20px;
}

.chevron {
  font-size: 1.3rem;
  color: #bbb;
  transition: transform 0.2s;
  line-height: 1;
  display: inline-block;
}

.chevron.open {
  transform: rotate(90deg);
  color: #4a90b8;
}

.competentie-body {
  padding: 1.25rem 1.5rem 1.5rem;
  border-top: 1px solid #eef2f7;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  background: #fafcfe;
}

.sectie-label {
  display: block;
  font-size: 0.78rem;
  font-weight: 800;
  color: #4a90b8;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  margin-bottom: 0.6rem;
}

.score-opties {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.score-optie {
  display: flex;
  align-items: flex-start;
  gap: 0.85rem;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  border: 2px solid #e8edf3;
  cursor: pointer;
  background: white;
  transition: all 0.15s;
}

.score-optie:has(input:disabled) {
  background: #f0f0f0;
  cursor: not-allowed;
  opacity: 0.75;
  border-color: #ddd;
}

.score-optie input[type="radio"] {
  margin-top: 3px;
  accent-color: #4a90b8;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.score-optie:hover {
  border-color: #4a90b8;
  background: #f5fafd;
}

.score-optie.geselecteerd {
  border-color: #4a90b8;
  background: #eaf1f6;
  opacity: 1;
}

.optie-inhoud {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.optie-punt {
  font-size: 0.92rem;
  font-weight: 700;
  color: #1a1a2e;
}

.optie-beschrijving {
  font-size: 0.82rem;
  color: #777;
}

.tekst-sectie {
  display: flex;
  flex-direction: column;
}

.tekstvak {
  width: 100%;
  min-height: 100px;
  padding: 0.85rem 1rem;
  border: 2px solid #e8edf3;
  border-radius: 8px;
  font-size: 0.9rem;
  font-family: inherit;
  color: #222;
  resize: vertical;
  transition: border-color 0.15s;
  background: white;
}

.tekstvak:focus {
  outline: none;
  border-color: #4a90b8;
  box-shadow: 0 0 0 3px rgba(41,168,224,0.1);
}

.tekstvak:disabled {
  background: #f0f0f0;
  color: #999;
  cursor: not-allowed;
  border-color: #ddd;
}

.mentor-sectie {
  background: white;
  border: 2px solid #e8edf3;
  border-radius: 8px;
  padding: 1rem 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.mentor-veld {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.mentor-waarde {
  font-size: 0.9rem;
  color: #aaa;
  font-style: italic;
}

.opslaan-rij {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.opslaan-btn {
  background: #4a90b8;
  color: white;
  border: none;
  border-radius: 8px;
  padding: 0.6rem 1.75rem;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: 0 2px 6px rgba(41,168,224,0.3);
}

.opslaan-btn:hover:not(:disabled) {
  background: #3a7a9e;
  box-shadow: 0 4px 10px rgba(41,168,224,0.4);
  transform: translateY(-1px);
}

.opslaan-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.opgeslagen-melding {
  font-size: 0.88rem;
  color: #43a047;
  font-weight: 700;
}

.bewerken-btn {
  background: white;
  color: #4a90b8;
  border: 2px solid #4a90b8;
  border-radius: 8px;
  padding: 0.6rem 1.25rem;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
}

.bewerken-btn:hover {
  background: #eaf1f6;
}

.fout-melding {
  font-size: 0.85rem;
  color: #e53935;
  font-weight: 600;
}

/* ── Rubriek tabel ── */
.rubriek-tabel {
  width: 100%;
  border: 1px solid #c5d5e0;
  border-radius: 8px;
  overflow: hidden;
  background: white;
}

.rubriek-header,
.rubriek-rij {
  display: grid;
  grid-template-columns: 150px repeat(3, 1fr) 300px;
  border-bottom: 1px solid #c5d5e0;
}

.rubriek-rij:last-child {
  border-bottom: none;
}

.rubriek-header {
  background: #4a90b8;
  color: white;
  font-weight: 700;
  font-size: 0.82rem;
}

.rubriek-header > div {
  padding: 0.75rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  border-right: 1px solid rgba(255,255,255,0.2);
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
  padding: 0.85rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  border-right: 1px solid #c5d5e0;
  background: #f4f8fb;
}

.lo-badge {
  font-size: 0.72rem;
  font-weight: 800;
  color: white;
  background: #4a90b8;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  width: fit-content;
}

.lo-naam {
  font-size: 0.95rem;
  font-weight: 600;
  color: #1a1a2e;
}

.col-score {
  padding: 0.75rem 0.6rem;
  border-right: 1px solid #c5d5e0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  cursor: pointer;
  transition: background 0.15s;
}

.col-score:hover {
  background: #f0f6fb;
}

.col-score.geselecteerd {
  background: #daeaf5;
  border-left: 3px solid #4a90b8;
}

.col-score .optie-beschrijving {
  font-size: 1rem;
  font-weight: 600;
  color: #333;
  line-height: 1.5;
  flex: 1;
}

.col-score input[type="radio"] {
  margin-top: 0.5rem;
  accent-color: #4a90b8;
}

.col-zelfevaluatie {
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
</style>
