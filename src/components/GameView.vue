<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ConfirmDialog from './ConfirmDialog.vue'
import { formatTime, periodDuration, periodLabel } from '../game/session.js'

const props = defineProps({ players: Array, session: Object, canUndo: Boolean })
const emit = defineEmits(['action', 'undo', 'new-game'])
const selectedOutId = ref(null)
const filter = ref('ALL')
const modal = ref(null)
const clockInput = ref('')
const clockError = ref('')
const lastTap = new Map()
const clockPanel = ref(null)
const showQuickClock = ref(false)
let clockObserver

const court = computed(() => props.players.filter((player) => player.isOnCourt))
const bench = computed(() => props.players.filter((player) => !player.isOnCourt))
const filteredBench = computed(() => bench.value.filter((player) => filter.value === 'ALL'
  || (filter.value === 'G' && ['PG', 'SG'].includes(player.pos))
  || (filter.value === 'F' && ['SF', 'PF'].includes(player.pos)) || player.pos === filter.value))
const selectedOut = computed(() => court.value.find((player) => player.id === selectedOutId.value))
const live = computed(() => props.session.status === 'PLAYING')
const ended = computed(() => props.session.clockMs === 0)
const status = computed(() => ended.value ? 'Period ended' : live.value ? 'Clock running' : props.session.status === 'SETUP' ? 'Ready for tip-off' : 'Clock paused')
const nextPeriodName = computed(() => props.session.period === 1 ? '2nd half' : props.session.period === 2 ? 'overtime' : 'next overtime')
const courtFouls = computed(() => props.players.reduce((sum, player) => sum + player.fouls, 0))
const dialogTitle = computed(() => ({ clock: 'Set the game clock', new: 'Start a new game?', period: `Move to ${nextPeriodName.value}?`, short: 'Start with fewer than five?', swap: 'Confirm substitution', remove: 'Take player off court?' }[modal.value?.type]))

function safeTap(key, fn) {
  const now = performance.now()
  if (now - (lastTap.get(key) ?? -1000) < 350) return
  lastTap.set(key, now)
  fn()
}
function mainAction() {
  safeTap('main', () => {
    if (!live.value && court.value.length !== 5) { modal.value = { type: 'short' }; return }
    emit('action', { type: 'clock' })
    selectedOutId.value = null
  })
}
function adjustClock(delta) {
  safeTap(`adjust-${delta}`, () => emit('action', { type: 'adjust-clock', delta, label: `Clock ${delta > 0 ? '+' : '−'}${Math.abs(delta)} second${Math.abs(delta) === 1 ? '' : 's'}` }))
}
function openClock() {
  if (live.value) return
  clockInput.value = formatTime(props.session.clockMs, true)
  clockError.value = ''
  modal.value = { type: 'clock' }
}
function chooseCourt(player) {
  safeTap(`out-${player.id}`, () => {
    selectedOutId.value = selectedOutId.value === player.id ? null : player.id
  })
}
function chooseBench(player) {
  safeTap(`in-${player.id}`, () => {
    if (selectedOut.value) modal.value = { type: 'swap', outgoing: selectedOut.value, incoming: player }
    else if (court.value.length < 5) emit('action', { type: 'toggle', playerId: player.id, label: `${player.name} on court` })
  })
}
function changeFoul(player, delta) {
  safeTap(`foul-${player.id}`, () => emit('action', { type: 'foul', playerId: player.id, delta, label: `${player.name}: foul ${delta > 0 ? 'added' : 'removed'}` }))
}
function confirmModal() {
  const choice = modal.value
  if (choice.type === 'clock') {
    const match = /^(\d{1,2}):([0-5]\d)$/.exec(clockInput.value.trim())
    const seconds = match ? Number(match[1]) * 60 + Number(match[2]) : -1
    if (seconds < 0 || seconds * 1000 > periodDuration(props.session.period)) {
      clockError.value = `Enter a time from 00:00 to ${formatTime(periodDuration(props.session.period))}.`
      return
    }
    emit('action', { type: 'adjust-clock', seconds, label: `Clock set to ${clockInput.value.trim()}` })
  } else if (choice.type === 'swap') {
    emit('action', { type: 'swap', outId: choice.outgoing.id, playerId: choice.incoming.id, label: `${choice.incoming.name} in · ${choice.outgoing.name} out` })
  } else if (choice.type === 'remove') {
    emit('action', { type: 'toggle', playerId: choice.outgoing.id, label: `${choice.outgoing.name} off court` })
  } else if (choice.type === 'short') emit('action', { type: 'clock', allowShortHanded: true })
  else if (choice.type === 'period') emit('action', { type: 'next-period', label: `${nextPeriodName.value} ready` })
  else if (choice.type === 'new') emit('new-game')
  selectedOutId.value = null
  modal.value = null
}
function photoFallback(event) { event.target.onerror = null; event.target.src = '/icon.png' }
onMounted(() => {
  clockObserver = new IntersectionObserver(([entry]) => { showQuickClock.value = !entry.isIntersecting }, { threshold: 0 })
  clockObserver.observe(clockPanel.value)
})
onBeforeUnmount(() => clockObserver?.disconnect())
</script>

<template>
  <main class="desk">
    <div v-if="showQuickClock" class="quick-clock" role="group" aria-label="Quick clock controls">
      <strong class="quick-clock-time">{{ formatTime(session.clockMs, true) }}</strong>
      <div class="quick-adjustments"><button class="adjust-button" :disabled="ended" aria-label="Quick subtract 1 second" @click="adjustClock(-1)">−1</button><button class="adjust-button" :disabled="session.clockMs >= periodDuration(session.period)" aria-label="Quick add 1 second" @click="adjustClock(1)">+1</button></div>
      <button class="main-clock-button" :class="{ running: live }" :disabled="ended" @click="mainAction">{{ ended ? 'Ended' : live ? 'Stop clock' : 'Start clock' }}</button>
    </div>
    <div class="page-heading">
      <div><p class="eyebrow">THE COURTSIDE DESK</p><h1>Game day<span class="heading-dot">.</span></h1></div>
      <div class="game-meta"><span class="pill">{{ periodLabel(session.period) }}</span><span class="local-label">Saved on this device</span></div>
    </div>

    <section ref="clockPanel" class="clock-panel" aria-label="Game clock">
      <div class="clock-readout">
        <div class="clock-status" :class="{ live, ended }"><span class="status-dot"></span>{{ status }}</div>
        <div class="clock-digits" role="timer" aria-label="Time remaining" aria-live="off">{{ formatTime(session.clockMs, true) }}</div>
        <span class="clock-caption">{{ periodLabel(session.period) }} <span> / </span> GAME CLOCK</span>
      </div>
      <div class="clock-controls">
        <button class="main-clock-button" :class="{ running: live }" :disabled="ended" @click="mainAction">
          <span aria-hidden="true" class="play-symbol">{{ live ? 'Ⅱ' : '▶' }}</span>
          <span>{{ ended ? 'Period ended' : live ? 'Stop clock' : 'Start clock' }}</span>
        </button>
        <div class="clock-adjustments" aria-label="Adjust remaining game time">
          <div class="adjustment-pair">
            <button class="adjust-button" :disabled="ended" aria-label="Subtract 10 seconds" @click="adjustClock(-10)">−10<span>SEC</span></button>
            <button class="adjust-button" :disabled="ended" aria-label="Subtract 1 second" @click="adjustClock(-1)">−1<span>SEC</span></button>
          </div>
          <div class="adjustment-pair">
            <button class="adjust-button" :disabled="session.clockMs >= periodDuration(session.period)" aria-label="Add 1 second" @click="adjustClock(1)">+1<span>SEC</span></button>
            <button class="adjust-button" :disabled="session.clockMs >= periodDuration(session.period)" aria-label="Add 10 seconds" @click="adjustClock(10)">+10<span>SEC</span></button>
          </div>
        </div>
        <button class="edit-clock" :disabled="live" @click="openClock">Set exact time <span aria-hidden="true">↗</span><span class="edit-hint">{{ live ? 'Pause to edit' : 'Match the scoreboard' }}</span></button>
      </div>
      <div class="clock-side-note"><span class="vertical-rule"></span><span>Stay in the game.<br /><strong>We’ll track the minutes.</strong></span></div>
    </section>

    <div class="rotation-toolbar">
      <p><span class="status-dot"></span><strong>{{ court.length }} on court</strong><span class="toolbar-divider">/</span><span>{{ bench.length }} on bench</span><span class="player-foul-summary"><span class="toolbar-divider">/</span>{{ courtFouls }} player fouls</span></p>
      <button class="button button-quiet undo-button" :disabled="!canUndo" @click="safeTap('undo', () => emit('undo'))"><span aria-hidden="true">↶</span> Undo last change</button>
    </div>

    <div v-if="selectedOut" class="substitution-strip" role="status">
      <span><strong>#{{ selectedOut.number }} {{ selectedOut.name }}</strong> selected. Choose a replacement from the bench.</span>
      <div class="strip-actions"><button class="button button-quiet" @click="modal = { type: 'remove', outgoing: selectedOut }">Off court only</button><button class="button button-green" @click="selectedOutId = null">Cancel</button></div>
    </div>

    <div class="rotation-layout">
      <section class="court-section" aria-labelledby="court-title">
        <div class="section-heading"><h2 id="court-title"><span class="court-marker" aria-hidden="true"></span>On court <span class="count-badge">{{ court.length }}/5</span></h2><span class="section-note">CURRENT ROTATION</span></div>
        <div class="court-list">
          <article v-for="player in court" :key="player.id" class="court-player" :class="{ selected: selectedOutId === player.id, 'long-stint': player.stintMs >= 240000 }">
            <div class="player-portrait"><img :src="player.img" :alt="player.name" @error="photoFallback" /><span>#{{ player.number }}</span></div>
            <div class="court-player-info"><span class="position-label">{{ player.pos }}</span><h3>{{ player.name }}</h3><span v-if="player.stintMs >= 240000" class="stint-note">4+ min on court</span><span v-else class="player-state">On court</span><span class="compact-total">Total {{ formatTime(player.totalMs) }}</span></div>
            <div class="time-stat"><span>THIS STINT</span><strong :class="{ 'time-warning': player.stintMs >= 240000 }">{{ formatTime(player.stintMs) }}</strong></div>
            <div class="time-stat total-stat"><span>TOTAL</span><strong>{{ formatTime(player.totalMs) }}</strong></div>
            <div class="foul-control"><span class="stat-label">FOULS</span><div><button :aria-label="`Remove foul for ${player.name}`" :disabled="player.fouls === 0" @click="changeFoul(player, -1)">−</button><strong :class="{ 'foul-warning': player.fouls >= 4 }">{{ player.fouls }}</strong><button :aria-label="`Add foul for ${player.name}`" :disabled="player.fouls >= 5" @click="changeFoul(player, 1)">+</button></div></div>
            <button class="button sub-out-button" :aria-pressed="selectedOutId === player.id" :aria-label="`Sub out ${player.name}`" @click="chooseCourt(player)">{{ selectedOutId === player.id ? 'Selected' : 'Sub out' }}<span aria-hidden="true">↗</span></button>
          </article>
          <div v-for="slot in Math.max(0, 5 - court.length)" :key="`empty-${slot}`" class="empty-court"><span aria-hidden="true">+</span><div><strong>Open spot</strong><p>Choose a player from the bench.</p></div></div>
        </div>
        <p class="court-footnote">Minutes run with the game clock. Pauses don’t count.</p>
      </section>

      <section class="bench-section" aria-labelledby="bench-title">
        <div class="section-heading"><h2 id="bench-title">The bench <span class="count-badge">{{ bench.length }}</span></h2><span class="section-note">READY WHEN YOU ARE</span></div>
        <div class="bench-filters" aria-label="Filter bench by position"><button v-for="option in [{ key: 'ALL', label: 'All players' }, { key: 'G', label: 'Guards' }, { key: 'F', label: 'Forwards' }, { key: 'C', label: 'Centers' }]" :key="option.key" :aria-pressed="filter === option.key" :class="{ active: filter === option.key }" @click="filter = option.key">{{ option.label }}</button></div>
        <div class="bench-grid">
          <article v-for="player in filteredBench" :key="player.id" class="bench-player" :class="{ 'fouled-out': player.fouls >= 5 }">
            <div class="bench-player-top"><div class="bench-portrait"><img :src="player.img" :alt="player.name" loading="lazy" @error="photoFallback" /></div><span class="bench-number">#{{ player.number }}</span><span class="position-label">{{ player.pos }}</span></div>
            <h3>{{ player.name }}</h3>
            <div class="bench-stats"><div><span>TOTAL</span><strong>{{ formatTime(player.totalMs) }}</strong></div><div><span>{{ player.hasPlayed ? 'REST' : 'FOULS' }}</span><strong>{{ player.hasPlayed ? formatTime(player.restMs) : player.fouls }}</strong></div></div>
            <div v-if="player.hasPlayed" class="bench-fouls">{{ player.fouls }} {{ player.fouls === 1 ? 'foul' : 'fouls' }}</div>
            <button class="button sub-in-button" :disabled="player.fouls >= 5 || (!selectedOut && court.length >= 5)" :aria-label="`Sub in ${player.name}`" @click="chooseBench(player)"><span aria-hidden="true">↙</span>{{ player.fouls >= 5 ? 'Fouled out' : selectedOut ? 'Swap in' : 'Sub in' }}</button>
          </article>
        </div>
        <p v-if="filteredBench.length === 0" class="empty-bench">No players in this group.</p>
        <p class="bench-help">{{ selectedOut ? 'Choose a replacement, then confirm the swap.' : court.length >= 5 ? 'To make a substitution, select “Sub out” on the left.' : 'Tap “Sub in” to fill an open spot.' }}</p>
      </section>
    </div>

    <footer class="game-footer"><span class="footer-credit">DREW BASKETBALL <span> / </span> Built for the sideline.</span><div><button class="button button-quiet" :disabled="live" @click="modal = { type: 'period' }">{{ session.period === 1 ? 'Next: 2nd half' : 'Next: overtime' }} <span aria-hidden="true">→</span></button><button class="button new-game-button" :disabled="live" @click="modal = { type: 'new' }">New game</button></div></footer>

    <ConfirmDialog v-if="modal" :title="dialogTitle" :danger="modal.type === 'new'" :confirm-label="modal.type === 'clock' ? 'Set time' : modal.type === 'swap' ? 'Confirm swap' : modal.type === 'new' ? 'Start new game' : 'Confirm'" @cancel="modal = null" @confirm="confirmModal">
      <template v-if="modal.type === 'clock'"><p>Match the scoreboard. The current lineup’s minutes will adjust by the same amount.</p><label class="clock-input-label" for="clock-input">Time remaining (MM:SS)</label><input id="clock-input" v-model="clockInput" class="clock-input" autocomplete="off" inputmode="text" maxlength="5" aria-describedby="clock-validation" @input="clockError = ''" /><p id="clock-validation" class="field-error">{{ clockError }}</p></template>
      <template v-else-if="modal.type === 'swap'"><div class="swap-preview"><div><span class="eyebrow">OUT</span><strong>#{{ modal.outgoing.number }} {{ modal.outgoing.name }}</strong></div><span aria-hidden="true">⇄</span><div><span class="eyebrow">IN</span><strong>#{{ modal.incoming.number }} {{ modal.incoming.name }}</strong></div></div><p>Both changes are recorded together when you confirm.</p></template>
      <p v-else-if="modal.type === 'remove'">Remove <strong>{{ modal.outgoing.name }}</strong> without a replacement? You will have {{ court.length - 1 }} players on court.</p>
      <p v-else-if="modal.type === 'short'">There are {{ court.length }} players on court. Start the clock with this lineup?</p>
      <p v-else-if="modal.type === 'period'">The clock will reset to {{ session.period === 1 ? '20:00' : '05:00' }} and stay paused. Total minutes and player fouls will carry over.</p>
      <p v-else>All game minutes and fouls will be cleared. Practice stats will be kept. This cannot be undone.</p>
    </ConfirmDialog>
  </main>
</template>
