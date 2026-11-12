<script setup>
import { computed, ref } from 'vue'
import ConfirmDialog from './ConfirmDialog.vue'
import TimeFields from './TimeFields.vue'
import { formatTime, parseTimeParts } from '../game/session.js'
import { HALFTIME_MS } from '../game/halftime.js'

const props = defineProps({ timer: Object })
const emit = defineEmits(['action', 'switch-view'])
const modal = ref(null)
const minutes = ref('15')
const seconds = ref('00')
const error = ref('')
const running = computed(() => props.timer.status === 'RUNNING')
const ended = computed(() => props.timer.remainingMs === 0)
const status = computed(() => ended.value ? 'Time to return' : running.value ? 'Counting down' : props.timer.status === 'READY' ? 'Ready when you are' : 'Paused')
const actionText = computed(() => running.value ? 'Pause timer' : props.timer.status === 'READY' ? 'Start 15 minutes' : 'Resume timer')
const dialTicks = Array.from({ length: 60 }, (_, index) => ({ angle: index * 6, major: index % 5 === 0 }))
const titles = { sync: 'Sync halftime clock', reset: 'Reset halftime?', end: 'Prepare the 2nd half?' }

function openSync() {
  const remaining = Math.ceil(props.timer.remainingMs / 1000)
  minutes.value = String(Math.floor(remaining / 60))
  seconds.value = String(remaining % 60).padStart(2, '0')
  error.value = ''
  modal.value = 'sync'
}
function confirm() {
  let action
  if (modal.value === 'sync') {
    const value = parseTimeParts(minutes.value.trim(), seconds.value.trim())
    if (value === null || value * 1000 > HALFTIME_MS) { error.value = 'Enter a time between 00:00 and 15:00.'; return }
    action = { type: 'sync-halftime', seconds: value }
  } else if (modal.value === 'reset') action = { type: 'reset-halftime' }
  else action = { type: 'next-period', label: '2nd half ready. Start the clock at tip-off.' }
  const ending = modal.value === 'end'
  emit('action', action, (success) => {
    if (!success) return
    modal.value = null
    if (ending) emit('switch-view', 'game')
  })
}
</script>

<template>
  <main class="halftime-view" :class="{ 'halftime-soon': timer.remainingMs <= 180000, 'halftime-ended': ended }">
    <header class="halftime-header">
      <button class="halftime-back" aria-label="Back to court" @click="emit('switch-view', 'game')">Court</button>
      <div><p>DREW MBB</p><h1>Halftime</h1></div>
      <button class="halftime-reset" @click="modal = 'reset'">Reset</button>
    </header>
    <section class="halftime-stage" aria-label="15-minute halftime timer">
      <p class="halftime-status" role="status">{{ status }}</p>
      <button class="halftime-dial" aria-label="Sync halftime clock" @click="openSync">
        <svg class="halftime-face" viewBox="0 0 320 320" fill="none" aria-hidden="true">
          <circle class="halftime-track" cx="160" cy="160" r="154" stroke-width="3" />
          <circle class="halftime-progress" cx="160" cy="160" r="154" stroke-width="3" pathLength="1" stroke-dasharray="1" :stroke-dashoffset="1 - timer.remainingMs / HALFTIME_MS" transform="rotate(-90 160 160)" />
          <line v-for="tick in dialTicks" :key="tick.angle" x1="160" y1="17" x2="160" :y2="tick.major ? 30 : 22" :transform="`rotate(${tick.angle} 160 160)`" :class="tick.major ? 'halftime-major-tick' : 'halftime-minor-tick'" :stroke-width="tick.major ? 2 : 1" />
        </svg>
        <span class="halftime-digits"><strong role="timer" aria-live="off">{{ formatTime(timer.remainingMs, true) }}</strong><span>Until the 2nd half</span></span>
      </button>
      <p class="halftime-sync-hint">Tap the clock to sync</p>
    </section>
    <footer class="halftime-footer">
      <p>Player minutes are paused</p>
      <button v-if="!ended" class="halftime-primary" @click="emit('action', { type: 'halftime-clock' })">{{ actionText }}</button>
      <button class="halftime-end" :class="{ 'halftime-primary': ended }" @click="modal = 'end'">{{ ended ? 'Set up 2nd half' : 'End halftime' }}</button>
    </footer>
    <ConfirmDialog v-if="modal" :title="titles[modal]" :confirm-label="modal === 'sync' ? 'Sync time' : modal === 'reset' ? 'Reset to 15:00' : 'Set up 2nd half'" @cancel="modal = null" @confirm="confirm">
      <template v-if="modal === 'sync'"><p>Match the break clock. It keeps counting if running.</p><TimeFields v-model:minutes="minutes" v-model:seconds="seconds" prefix="halftime" :invalid="Boolean(error)" @input="error = ''" /><p id="halftime-error" class="field-error" role="alert">{{ error }}</p></template>
      <p v-else-if="modal === 'reset'">Reset this break to 15:00 and pause the timer?</p>
      <p v-else>End the break and set the game clock to 20:00. The lineup and Total Time carry over. Start the game clock when play resumes.</p>
    </ConfirmDialog>
  </main>
</template>
