<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import GameView from './components/GameView.vue'
import PracticeView from './components/PracticeView.vue'
import { roster } from './data/roster.js'
import { createEmptyPracticeStats } from './data/players.js'
import { applyAction, createSession, restoreSession, settleSession, STORAGE_KEY } from './game/session.js'

const view = ref('game')
const session = ref(createSession(roster))
const history = ref([])
const notice = ref('')
const storageWarning = ref('')
const practice = ref({})
const practiceKey = 'drew.rotation.practice.v1'
let tickTimer, saveTimer, noticeTimer, lastSaveAt = 0

try {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) session.value = restoreSession(saved, roster)
} catch {
  storageWarning.value = 'Could not restore the saved game. A fresh game is open; check your lineup before starting.'
}
try {
  const saved = JSON.parse(localStorage.getItem(practiceKey) || '{}')
  for (const player of roster) {
    practice.value[player.id] = createEmptyPracticeStats()
    for (const key of Object.keys(practice.value[player.id])) {
      const value = saved?.[player.id]?.[key]
      if (Number.isSafeInteger(value) && value >= 0) practice.value[player.id][key] = value
    }
  }
} catch { practice.value = Object.fromEntries(roster.map((player) => [player.id, createEmptyPracticeStats()])) }

const players = computed(() => roster.map((player) => ({
  ...player,
  ...session.value.players.find((state) => state.id === player.id),
  practiceStats: practice.value[player.id] || createEmptyPracticeStats(),
})))

function notify(message) {
  notice.value = message
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => { notice.value = '' }, 4500)
}

function persist() {
  clearTimeout(saveTimer)
  saveTimer = null
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session.value))
    localStorage.setItem(practiceKey, JSON.stringify(practice.value))
    lastSaveAt = Date.now()
  } catch {
    storageWarning.value = 'This browser cannot save changes. Keep this page open to preserve the current game.'
  }
}

function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(persist, 120)
}

function act(action) {
  const now = Date.now()
  const previous = settleSession(session.value, now)
  try {
    const next = applyAction(previous, action, now)
    if (['toggle', 'swap', 'adjust-clock', 'foul'].includes(action.type)) {
      history.value = [...history.value.slice(-19), { session: previous, label: action.label || 'Last change' }]
    } else history.value = []
    session.value = next
    if (action.label) notify(action.label)
    scheduleSave()
  } catch (error) { notify(error.message) }
}

function undo() {
  const record = history.value.pop()
  if (!record) return
  session.value = settleSession(record.session, Date.now())
  notify(`Undone: ${record.label}`)
  scheduleSave()
}

function newGame() {
  session.value = createSession(roster)
  history.value = []
  notify('New game ready. Select your starting five.')
  scheduleSave()
}

function changeView(nextView) {
  if (nextView === 'practice' && session.value.status === 'PLAYING') {
    notify('Pause the game clock before opening practice.')
    return
  }
  view.value = nextView
}

function updatePractice(playerId, key, delta) {
  if (!(key in practice.value[playerId])) return
  practice.value[playerId][key] = Math.max(0, practice.value[playerId][key] + delta)
  scheduleSave()
}

function resetPractice() {
  practice.value = Object.fromEntries(roster.map((player) => [player.id, createEmptyPracticeStats()]))
  scheduleSave()
}

function refreshClock() {
  const previous = session.value
  session.value = settleSession(previous, Date.now())
  if (previous.status === 'PLAYING' && session.value.status === 'PAUSED') {
    history.value = []
    notify('Period ended. The clock is stopped.')
    persist()
  } else if (session.value.status === 'PLAYING' && Date.now() - lastSaveAt >= 1000 && !saveTimer) scheduleSave()
}

function handlePageHide() { refreshClock(); persist() }
function handleVisibility() { if (!document.hidden) refreshClock(); else handlePageHide() }

onMounted(() => {
  tickTimer = setInterval(refreshClock, 100)
  document.addEventListener('visibilitychange', handleVisibility)
  window.addEventListener('pagehide', handlePageHide)
})
onBeforeUnmount(() => {
  clearInterval(tickTimer)
  clearTimeout(saveTimer)
  clearTimeout(noticeTimer)
  document.removeEventListener('visibilitychange', handleVisibility)
  window.removeEventListener('pagehide', handlePageHide)
  persist()
})
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <a class="brand" href="#game" @click.prevent="changeView('game')" aria-label="Drew Rangers game desk">
        <img src="/icon.png" alt="" width="42" height="42" />
        <span><strong>DREW RANGERS</strong><small>MEN’S BASKETBALL</small></span>
      </a>
      <nav class="mode-nav" aria-label="Tracking mode">
        <button :aria-current="view === 'game' ? 'page' : undefined" :class="{ active: view === 'game' }" @click="changeView('game')">Game day</button>
        <button :aria-current="view === 'practice' ? 'page' : undefined" :class="{ active: view === 'practice' }" @click="changeView('practice')">Practice</button>
      </nav>
      <span class="header-note"><span class="status-dot"></span> Courtside, simplified.</span>
    </header>

    <p v-if="storageWarning" role="alert" class="storage-warning">{{ storageWarning }}</p>
    <GameView v-if="view === 'game'" :players="players" :session="session" :can-undo="history.length > 0"
      @action="act" @undo="undo" @new-game="newGame" />
    <PracticeView v-else :players="players" @update-stat="updatePractice" @reset="resetPractice" />
    <div class="toast" role="status" aria-live="polite" aria-atomic="true" :class="{ visible: notice }">{{ notice }}</div>
  </div>
</template>
