<script setup>
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import LandingView from './components/LandingView.vue'
import GameView from './components/GameView.vue'
import HalftimeView from './components/HalftimeView.vue'
import GameLogin from './components/GameLogin.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import PracticeView from './components/PracticeView.vue'
import { roster } from './data/roster.js'
import { createPlayerDisplayNames } from './data/playerNames.js'
import { createEmptyPracticeStats } from './data/players.js'
import { applyAction, createSession, restoreSession, settleSession, STORAGE_KEY } from './game/session.js'
import { changePracticeStat, undoPracticeStat } from './practice/scoring.js'
import { createSharedGame } from './game/sharedGame.js'

const view = ref('landing')
const displayNames = createPlayerDisplayNames(roster)
const session = shallowRef(createSession(roster))
const history = ref([])
const notice = ref('')
const noticeIsError = ref(false)
const storageWarning = ref('')
const practice = ref({})
const practiceHistory = ref([])
const authenticated = ref(false)
const canControl = ref(false)
const syncStatus = ref('loading')
const loginBusy = ref(false)
const loginError = ref('')
const takeoverConfirm = ref(false)
const takeoverBusy = ref(false)
const practiceKey = 'drew.rotation.practice.v1'
// Monotonic while this page is open, epoch based for recovery after a reload.
const epoch = Date.now() - performance.now()
const gameNow = () => epoch + performance.now()
let tickTimer, saveTimer, noticeTimer, lastSaveAt = 0
let connection
let deviceId
try {
  deviceId = sessionStorage.getItem('drew.game.device.v1') || crypto.randomUUID()
  sessionStorage.setItem('drew.game.device.v1', deviceId)
} catch { deviceId = crypto.randomUUID() }
const outboxKey = `drew.rotation.shared.pending.v1.${deviceId}`

function archivePending() {
  try {
    const pending = localStorage.getItem(outboxKey)
    if (pending) localStorage.setItem(`drew.rotation.unsynced.backup.v1.${deviceId}`, pending)
    localStorage.removeItem(outboxKey)
  } catch {}
}

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
  displayName: displayNames.get(player.id),
  practiceStats: practice.value[player.id] || createEmptyPracticeStats(),
  practiceTotal: Object.values(practice.value[player.id] || {}).reduce((sum, value) => sum + value, 0),
})))

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
  if (!authenticated.value || !canControl.value) { onResult?.(false); return false }
  const now = gameNow()
  const previous = settleSession(session.value, now)
  try {
    const next = applyAction(previous, action, now)
    if (['toggle', 'swap', 'adjust-clock', 'adjust-player-time', 'set-injured'].includes(action.type)) {
      history.value = [...history.value.slice(-19), { session: previous, label: action.label || 'Last change' }]
    } else history.value = []
    session.value = next
    if (action.label) notify(action.label)
    scheduleSave()
    connection?.publish(next)
    onResult?.(true)
    return true
  } catch (error) {
    notify(error.message, true)
    onResult?.(false)
    return false
  }
}

function mainAction() {
  if (!canControl.value) return
  if (session.value.halftime) { changeView('halftime'); return }
  const allowShortHanded = session.value.players.filter((player) => player.isOnCourt).length !== 5
  if (session.value.status !== 'PLAYING' && allowShortHanded
    && !window.confirm('Fewer than five players are on court. Continue?')) return
  act({ type: session.value.status === 'SETUP' ? 'confirm-starters' : 'clock', allowShortHanded })
}

function undo() {
  if (!canControl.value) return
  const record = history.value.pop()
  if (!record) return
  session.value = settleSession(record.session, gameNow())
  notify(`Undone: ${record.label}`)
  scheduleSave()
  connection?.publish(session.value)
}

function newGame() {
  if (!canControl.value) return
  session.value = createSession(roster, session.value.players.filter((player) => player.isInjured).map((player) => player.id))
  history.value = []
  notify('New game ready. Confirm your starting five.')
  scheduleSave()
  connection?.publish(session.value)
}

function changeView(nextView) {
  if (nextView === 'landing') {
    connection?.close()
    connection = null
    authenticated.value = false
    canControl.value = false
  }
  if (['game', 'halftime'].includes(nextView) && !authenticated.value) {
    loginError.value = ''
    view.value = 'login'
    return
  }
  if (nextView === 'practice' && session.value.status === 'PLAYING') {
    notify('Pause the game clock before opening practice.')
    return
  }
  view.value = nextView
}

async function login(password) {
  if (loginBusy.value) return
  loginBusy.value = true
  loginError.value = ''
  try {
    const response = await fetch('/api/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }), signal: AbortSignal.timeout(8000) })
    if (!response.ok) {
      loginError.value = response.status === 401 ? 'Incorrect password. Please try again.' : response.status === 429 ? 'Too many attempts. Please try again later.' : 'Unable to connect. Please try again.'
      return
    }
    connection?.close()
    try {
      if (!localStorage.getItem('drew.rotation.before-shared.v1')) localStorage.setItem('drew.rotation.before-shared.v1', localStorage.getItem(STORAGE_KEY) || JSON.stringify(settleSession(session.value, gameNow())))
    } catch { storageWarning.value = 'This browser cannot keep a backup of the previous local game.' }
    connection = createSharedGame({
      deviceId, getNow: gameNow,
      onRemote: (state) => {
        const wasHalftime = Boolean(session.value.halftime)
        session.value = settleSession(state, gameNow())
        if (authenticated.value && view.value === 'halftime' && !state.halftime) view.value = 'game'
        else if (authenticated.value && view.value === 'game' && state.halftime && !wasHalftime) view.value = 'halftime'
        scheduleSave()
      },
      onAccess: (allowed) => { canControl.value = allowed; if (!allowed) { history.value = []; archivePending() } },
      onStatus: (status) => { syncStatus.value = status },
      onExpired: () => { authenticated.value = false; canControl.value = false; takeoverConfirm.value = false; loginError.value = 'Your session has expired. Please enter the password again.'; view.value = 'login' },
      onLostControl: () => {
        history.value = []
        archivePending()
        notify('Another phone took control. You are now viewing the shared game.')
      },
      onPending: (state) => { try { localStorage.setItem(outboxKey, JSON.stringify({ deviceId, state })) } catch { storageWarning.value = 'Changes cannot be saved on this phone. Keep the page open until Live sync appears.' } },
      onSynced: () => { try { localStorage.removeItem(outboxKey) } catch {} },
    })
    history.value = []
    syncStatus.value = 'loading'
    let pending
    try { const saved = JSON.parse(localStorage.getItem(outboxKey) || 'null'); if (saved?.deviceId === deviceId) pending = saved.state } catch {}
    await connection.connect(settleSession(session.value, gameNow()), pending)
    authenticated.value = true
    view.value = session.value.halftime ? 'halftime' : 'game'
  } catch {
    connection?.close()
    connection = null
    canControl.value = false
    loginError.value = 'Unable to connect. Check your connection and try again.'
  } finally { loginBusy.value = false }
}

async function takeControl() {
  if (takeoverBusy.value) return
  takeoverBusy.value = true
  try {
    await connection.takeControl()
    history.value = []
    takeoverConfirm.value = false
    notify('This phone now controls the game.')
  } catch { notify('Could not take control. Check your connection and try again.', true) }
  finally { takeoverBusy.value = false }
}

function updatePractice(playerId, key, delta, onResult) {
  const change = changePracticeStat(practice.value, playerId, key, delta)
  if (!change) { onResult?.(false); return }
  practice.value = change.stats
  practiceHistory.value = [...practiceHistory.value.slice(-99), change.record]
  scheduleSave()
  onResult?.(true)
}

function undoPractice() {
  const record = practiceHistory.value.at(-1)
  const restored = undoPracticeStat(practice.value, record)
  if (!restored) return
  practice.value = restored
  practiceHistory.value.pop()
  scheduleSave()
}

function resetPractice() {
  practice.value = Object.fromEntries(roster.map((player) => [player.id, createEmptyPracticeStats()]))
  practiceHistory.value = []
  scheduleSave()
}

function refreshClock() {
  const previous = session.value
  if (previous.status !== 'PLAYING' && previous.halftime?.status !== 'RUNNING') return
  const next = settleSession(previous, gameNow())
  // Check often, but redraw only when a visible second or game status changes.
  if (next.status !== previous.status || next.halftime?.status !== previous.halftime?.status
    || Math.ceil((next.halftime?.remainingMs ?? 0) / 1000) !== Math.ceil((previous.halftime?.remainingMs ?? 0) / 1000)
    || Math.ceil(next.clockMs / 1000) !== Math.ceil(previous.clockMs / 1000)
    || next.players.some((player, index) => Math.floor(player.totalMs / 1000) !== Math.floor(previous.players[index].totalMs / 1000)
      || Math.floor(player.restMs / 1000) !== Math.floor(previous.players[index].restMs / 1000))) {
    session.value = next
  }
  if (next.halftime?.status === 'ENDED') {
    notify('Halftime is over. Time to return to court.')
    persist()
  } else if (next.status === 'PAUSED' && !next.halftime) {
    history.value = []
    notify('Period ended. The clock is stopped.')
    persist()
  } else if (gameNow() - lastSaveAt >= 1000) scheduleSave()
}

function handlePageHide() { refreshClock(); persist() }
function handleVisibility() { if (!document.hidden) refreshClock(); else handlePageHide() }
function refreshSharedGame() { connection?.refresh().catch(() => {}) }

onMounted(() => {
  tickTimer = setInterval(refreshClock, 100)
  document.addEventListener('visibilitychange', handleVisibility)
  window.addEventListener('pagehide', handlePageHide)
  window.addEventListener('online', refreshSharedGame)
})
onBeforeUnmount(() => {
  clearInterval(tickTimer)
  clearTimeout(saveTimer)
  clearTimeout(noticeTimer)
  document.removeEventListener('visibilitychange', handleVisibility)
  window.removeEventListener('pagehide', handlePageHide)
  window.removeEventListener('online', refreshSharedGame)
  connection?.close()
  persist()
})
</script>

<template>
  <p v-if="storageWarning" role="alert" class="storage-warning">{{ storageWarning }}</p>
  <LandingView v-if="view === 'landing'" @switch-view="changeView" />
  <GameLogin v-else-if="view === 'login'" :busy="loginBusy" :error="loginError" @submit="login" @back="changeView('landing')" />
  <GameView v-else-if="view === 'game' && authenticated" :players="players" :session="session" :can-undo="canControl && history.length > 0" :read-only="!canControl" :sync-status="syncStatus"
    @action="act" @main-action="mainAction" @undo="undo" @new-game="newGame" @switch-view="changeView" @take-control="takeoverConfirm = true" />
  <HalftimeView v-else-if="view === 'halftime' && authenticated && session.halftime" :timer="session.halftime" :read-only="!canControl" :sync-status="syncStatus" @action="act" @switch-view="changeView" @take-control="takeoverConfirm = true" />
  <PracticeView v-else-if="view === 'practice'" :players="players" :can-undo="practiceHistory.length > 0" @switch-view="changeView"
    @update-practice-stat="updatePractice" @undo="undoPractice" @reset-practice="resetPractice" />
  <div v-if="notice" :class="view !== 'landing' && !noticeIsError ? 'sr-only' : 'toast'" role="status" aria-live="polite">{{ notice }}</div>
  <ConfirmDialog v-if="takeoverConfirm" title="Take control on this phone?" confirm-label="Take control" :disabled="takeoverBusy" @cancel="takeoverConfirm = false" @confirm="takeControl"><p>The other phone will switch to view only. All times and the current clock status will be preserved.</p></ConfirmDialog>
</template>
