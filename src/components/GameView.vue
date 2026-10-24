<script setup>
import { computed, ref, watch } from 'vue'
import ConfirmDialog from './ConfirmDialog.vue'
import { formatTime, periodDuration, periodLabel } from '../game/session.js'

const props = defineProps({ players: Array, session: Object, canUndo: Boolean })
const emit = defineEmits(['switch-view', 'action', 'main-action', 'new-game', 'undo'])
const isBenchOpen = ref(false)
const detailPlayerId = ref(null)
const selectedOutId = ref(null)
const modal = ref(null)
const clockInput = ref('')
const clockError = ref('')
const court = computed(() => props.players.filter((player) => player.isOnCourt))
const bench = computed(() => props.players.filter((player) => !player.isOnCourt))
const selectedOut = computed(() => court.value.find((player) => player.id === selectedOutId.value))
const detailPlayer = computed(() => props.players.find((player) => player.id === detailPlayerId.value))
const live = computed(() => props.session.status === 'PLAYING')
const ended = computed(() => props.session.clockMs === 0)
const status = computed(() => ended.value ? 'Period ended' : live.value ? 'Live' : props.session.status === 'SETUP' ? 'Ready' : 'Paused')
const mainText = computed(() => ended.value ? 'Period ended' : live.value ? 'Stop clock' : props.session.status === 'SETUP' ? 'Confirm starters' : 'Start clock')
const nextPeriod = computed(() => props.session.period === 1 ? '2nd half' : props.session.period === 2 ? 'overtime' : 'next overtime')
const dialogTitle = computed(() => ({ clock: 'Sync game clock', new: 'Start a new game?', period: `Start ${nextPeriod.value}?` })[modal.value])
const benchGroups = computed(() => [
  ['PG', 'Point Guards'], ['SG', 'Shooting Guards'], ['SF', 'Small Forwards'], ['PF', 'Power Forwards'], ['C', 'Centers'],
].map(([pos, title]) => ({ pos, title, players: bench.value.filter((player) => player.pos === pos) })).filter((group) => group.players.length))

watch(() => props.session, () => {
  if (!selectedOut.value) selectedOutId.value = null
})
function photoFallback(event) { event.target.onerror = null; event.target.src = '/icon.png' }
function openClock() {
  clockInput.value = formatTime(props.session.clockMs, true)
  clockError.value = ''
  modal.value = 'clock'
}
function chooseOut(player) {
  selectedOutId.value = player.id
  isBenchOpen.value = true
}
function chooseIn(player) {
  if (!selectedOut.value && court.value.length >= 5) return
  const outgoing = selectedOut.value
  emit('action', outgoing
    ? { type: 'swap', outId: outgoing.id, playerId: player.id, label: `${player.name} in · ${outgoing.name} out` }
    : { type: 'toggle', playerId: player.id, label: `${player.name} on court` })
  selectedOutId.value = null
  if (window.innerWidth < 768) isBenchOpen.value = false
}
function closeBench() { isBenchOpen.value = false; selectedOutId.value = null }
function confirmModal() {
  if (modal.value === 'clock') {
    const match = /^(\d{1,2}):([0-5]\d)$/.exec(clockInput.value.trim())
    const seconds = match ? Number(match[1]) * 60 + Number(match[2]) : -1
    if (seconds < 0 || seconds * 1000 > periodDuration(props.session.period)) {
      clockError.value = `Use MM:SS, from 00:00 to ${formatTime(periodDuration(props.session.period))}.`
      return
    }
    emit('action', { type: 'adjust-clock', seconds, label: 'Game clock synced' })
  } else if (modal.value === 'period') emit('action', { type: 'next-period', label: `${nextPeriod.value} ready` })
  else if (modal.value === 'new') emit('new-game')
  modal.value = null
}
</script>

<template>
  <main class="game-view">
    <div class="game-top">
      <header class="game-header">
        <div class="game-header-left">
          <button class="menu-button" aria-label="Back to menu" @click="emit('switch-view', 'landing')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg>
          </button>
          <div class="game-brand"><h1>DREW MBB</h1><div class="game-meta"><span class="period-label">{{ periodLabel(session.period) }}</span><span class="clock-status" :class="{ live, ended }"><i aria-hidden="true"></i>{{ status }}</span></div></div>
        </div>
        <button class="clock-display" aria-label="Sync game clock" @click="openClock">
          <strong role="timer" aria-live="off">{{ formatTime(session.clockMs, true) }}</strong>
          <small>Set time <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m15 5 4 4M5 19l4-1L20 7a2.8 2.8 0 0 0-4-4L5 14z" /></svg></small>
        </button>
      </header>
      <section class="game-controls" aria-label="Game clock controls">
        <div class="clock-control-row">
          <button class="clock-adjust" aria-label="Subtract 1 second" :disabled="ended" @click="emit('action', { type: 'adjust-clock', delta: -1 })"><span>−1</span><small>s</small></button>
          <button class="main-action" :class="{ running: live }" :disabled="ended" @click="emit('main-action')">
            <svg v-if="live" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            <svg v-else-if="session.status === 'SETUP'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
            <svg v-else viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l12-7z" /></svg>
            {{ mainText }}
          </button>
          <button class="clock-adjust" aria-label="Add 1 second" :disabled="session.clockMs >= periodDuration(session.period)" @click="emit('action', { type: 'adjust-clock', delta: 1 })"><span>+1</span><small>s</small></button>
        </div>
        <div class="secondary-controls"><button :disabled="live || session.status === 'SETUP'" @click="modal = 'period'">{{ session.period === 1 ? '2nd half' : 'Overtime' }}<span aria-hidden="true">→</span></button><button class="new-game" :disabled="live" @click="modal = 'new'">New game<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 10a9 9 0 1 1 1 7M3 4v6h6" /></svg></button></div>
      </section>
    </div>
    <div class="rotation-area">
      <section class="court-section" aria-label="On court">
        <div class="court-heading"><h2>ON COURT</h2><span>{{ court.length }}/5</span></div>
        <div class="court-list mobile-scroll">
          <article v-for="player in court" :key="player.id" class="court-player" :class="{ selected: selectedOutId === player.id, 'alert-level-1': player.stintMs >= 120000, 'alert-level-2': player.stintMs >= 180000, 'alert-level-3': player.stintMs >= 240000 }">
            <button class="court-photo" :aria-label="`View ${player.name} details`" @click="detailPlayerId = player.id"><img :src="player.img" :alt="player.name" decoding="async" @error="photoFallback" /></button>
            <div class="court-player-info"><h3>{{ player.name }}</h3><div class="player-time" aria-label="Time on court">{{ formatTime(player.stintMs) }}</div><small>Total {{ formatTime(player.totalMs) }} · {{ player.pos }}</small></div>
            <button class="sub-out" :aria-label="`Sub out ${player.name}`" @click="chooseOut(player)">Sub out ↗</button>
          </article>
          <p v-if="!court.length" class="empty-court">Open Bench to select your starters.</p>
        </div>
        <div class="court-bottom"><button class="undo-button" :disabled="!canUndo" @click="emit('undo')">↶ Undo</button><button class="bench-toggle" :aria-expanded="isBenchOpen" aria-controls="bench-drawer" @click="isBenchOpen = true">‹ BENCH <span>{{ bench.length }}</span></button></div>
      </section>
      <div v-if="isBenchOpen" class="bench-backdrop" @click="closeBench"></div>
      <aside id="bench-drawer" class="bench-drawer" :class="{ open: isBenchOpen }" aria-label="Bench">
        <div class="bench-heading"><h2>BENCH <small>{{ bench.length }} PLAYERS</small></h2><button class="bench-close" aria-label="Close bench" @click="closeBench">Close ›</button></div>
        <div class="bench-instruction" role="status"><template v-if="selectedOut">Replacing <strong>{{ selectedOut.name }}</strong><button @click="selectedOutId = null">Cancel</button></template><template v-else>{{ court.length === 5 ? 'Tap “Sub out” on a court player to make a swap.' : 'Choose a player to fill an open spot.' }}</template></div>
        <div class="bench-list mobile-scroll"><section v-for="group in benchGroups" :key="group.pos" class="bench-group"><h3>{{ group.title }}</h3><div class="bench-grid"><article v-for="player in group.players" :key="player.id" class="bench-player"><button class="bench-photo" :aria-label="`View ${player.name} details`" @click="detailPlayerId = player.id"><img :src="player.img" :alt="player.name" loading="lazy" decoding="async" @error="photoFallback" /></button><h4>{{ player.name }}</h4><div class="bench-stats"><span>Total {{ formatTime(player.totalMs) }}</span></div><button class="sub-in" :aria-label="`Sub in ${player.name}`" :disabled="!selectedOut && court.length >= 5" @click="chooseIn(player)">{{ selectedOut ? 'Swap in' : 'Sub in' }}</button></article></div></section></div>
      </aside>
    </div>
    <ConfirmDialog v-if="modal" :title="dialogTitle" :danger="modal === 'new'" :confirm-label="modal === 'clock' ? 'Sync time' : 'Confirm'" @cancel="modal = null" @confirm="confirmModal">
      <template v-if="modal === 'clock'"><p>Match the scoreboard. The current lineup’s minutes will adjust with the clock.</p><label for="clock-input">Time remaining (MM:SS)</label><input id="clock-input" v-model="clockInput" class="clock-input" inputmode="text" autocomplete="off" maxlength="5" aria-describedby="clock-validation" @input="clockError = ''" /><p id="clock-validation" class="field-error">{{ clockError }}</p></template>
      <p v-else-if="modal === 'period'">Reset the clock to {{ session.period === 1 ? '20:00' : '05:00' }} for {{ nextPeriod }}? Total minutes and lineup will carry over.</p>
      <p v-else>Clear this game’s minutes and lineup? Practice stats will be kept.</p>
    </ConfirmDialog>
    <ConfirmDialog v-if="detailPlayer" :title="detailPlayer.name" confirm-label="Done" @cancel="detailPlayerId = null" @confirm="detailPlayerId = null"><div class="detail-player"><img :src="detailPlayer.img" :alt="detailPlayer.name" @error="photoFallback" /><p>{{ detailPlayer.pos }} · {{ detailPlayer.isOnCourt ? 'ON COURT' : 'ON BENCH' }}</p><dl><div><dt>{{ detailPlayer.isOnCourt ? 'Time on court' : 'Rest duration' }}</dt><dd>{{ formatTime(detailPlayer.isOnCourt ? detailPlayer.stintMs : detailPlayer.restMs) }}</dd></div><div><dt>Last sub out</dt><dd>{{ detailPlayer.lastSubOutClockMs === null ? '--:--' : formatTime(detailPlayer.lastSubOutClockMs, true) }}</dd></div><div><dt>Total time</dt><dd>{{ formatTime(detailPlayer.totalMs) }}</dd></div></dl></div></ConfirmDialog>
  </main>
</template>
