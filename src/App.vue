<script setup>
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import LandingView from './components/LandingView.vue'
import GameView from './components/GameView.vue'
import PracticeView from './components/PracticeView.vue'
import { roster } from './data/roster.js'
import { createEmptyPracticeStats } from './data/players.js'
import { applyAction, createSession, restoreSession, settleSession, STORAGE_KEY } from './game/session.js'

const view = ref('landing')
const session = shallowRef(createSession(roster))
const history = ref([])
const notice = ref('')
const noticeIsError = ref(false)
const storageWarning = ref('')
const practice = ref({})
const sortMode = ref('default')
const practiceKey = 'drew.rotation.practice.v1'
// Monotonic while this page is open, epoch based for recovery after a reload.
const epoch = Date.now() - performance.now()
const gameNow = () => epoch + performance.now()
let tickTimer, saveTimer, noticeTimer, lastSaveAt = 0

try {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) session.value = restoreSession(saved, roster, gameNow())
} catch {
  storageWarning.value = 'Could not restore the saved game. Check your lineup before starting.'
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
} catch {
  practice.value = Object.fromEntries(roster.map((player) => [player.id, createEmptyPracticeStats()]))
}

const players = computed(() => roster.map((player) => ({
  ...player,
  ...session.value.players.find((state) => state.id === player.id),
  practiceStats: practice.value[player.id] || createEmptyPracticeStats(),
  practiceTotal: Object.values(practice.value[player.id] || {}).reduce((sum, value) => sum + value, 0),
})))
const practicePlayers = computed(() => sortMode.value === 'score-desc'
  ? [...players.value].sort((a, b) => b.practiceTotal - a.practiceTotal || a.id - b.id)
  : players.value)

function notify(message, isError = false) {
  notice.value = message
  noticeIsError.value = isError
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => { notice.value = '' }, 3500)
}

function persist() {
  clearTimeout(saveTimer)
  saveTimer = null
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settleSession(session.value, gameNow())))
    localStorage.setItem(practiceKey, JSON.stringify(practice.value))
    lastSaveAt = gameNow()
  } catch {
    storageWarning.value = 'This browser cannot save changes. Keep the page open to preserve this session.'
  }
}

function scheduleSave() {
  if (!saveTimer) saveTimer = setTimeout(persist, 120)
}

function act(action, onResult) {
  const now = gameNow()
  const previous = settleSession(session.value, now)
  try {
    const next = applyAction(previous, action, now)
    if (['toggle', 'swap', 'adjust-clock', 'adjust-player-time'].includes(action.type)) {
      history.value = [...history.value.slice(-19), { session: previous, label: action.label || 'Last change' }]
    } else history.value = []
    session.value = next
    if (action.label) notify(action.label)
    scheduleSave()
    onResult?.(true)
    return true
  } catch (error) {
    notify(error.message, true)
    onResult?.(false)
    return false
  }
}

function mainAction() {
  const allowShortHanded = session.value.players.filter((player) => player.isOnCourt).length !== 5
  if (session.value.status !== 'PLAYING' && allowShortHanded
    && !window.confirm('Fewer than five players are on court. Continue?')) return
  act({ type: session.value.status === 'SETUP' ? 'confirm-starters' : 'clock', allowShortHanded })
}

function undo() {
  const record = history.value.pop()
  if (!record) return
  session.value = settleSession(record.session, gameNow())
  notify(`Undone: ${record.label}`)
  scheduleSave()
}

function newGame() {
  session.value = createSession(roster)
  history.value = []
  notify('New game ready. Confirm your starting five.')
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
  if (!(key in (practice.value[playerId] || {}))) return
  practice.value[playerId][key] = Math.max(0, practice.value[playerId][key] + delta)
  scheduleSave()
}

function resetPractice() {
  practice.value = Object.fromEntries(roster.map((player) => [player.id, createEmptyPracticeStats()]))
  sortMode.value = 'default'
  scheduleSave()
}

function refreshClock() {
  const previous = session.value
  if (previous.status !== 'PLAYING') return
  const next = settleSession(previous, gameNow())
  // Check often, but redraw only when a visible second or game status changes.
  if (next.status !== previous.status || Math.ceil(next.clockMs / 1000) !== Math.ceil(previous.clockMs / 1000)
    || next.players.some((player, index) => Math.floor(player.totalMs / 1000) !== Math.floor(previous.players[index].totalMs / 1000)
      || Math.floor(player.restMs / 1000) !== Math.floor(previous.players[index].restMs / 1000))) {
    session.value = next
  }
  if (next.status === 'PAUSED') {
    history.value = []
    notify('Period ended. The clock is stopped.')
    persist()
  } else if (gameNow() - lastSaveAt >= 1000) scheduleSave()
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
  <p v-if="storageWarning" role="alert" class="storage-warning">{{ storageWarning }}</p>
  <LandingView v-if="view === 'landing'" @switch-view="changeView" />
  <GameView v-else-if="view === 'game'" :players="players" :session="session" :can-undo="history.length > 0"
    @action="act" @main-action="mainAction" @undo="undo" @new-game="newGame" @switch-view="changeView" />
  <PracticeView v-else :players="practicePlayers" :sort-mode="sortMode" @switch-view="changeView"
    @update-practice-stat="updatePractice" @sort-practice="sortMode = sortMode === 'default' ? 'score-desc' : 'default'" @reset-practice="resetPractice" />
  <div v-if="notice" :class="view === 'game' && !noticeIsError ? 'sr-only' : 'toast'" role="status" aria-live="polite">{{ notice }}</div>
</template>
