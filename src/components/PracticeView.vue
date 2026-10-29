<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
import ConfirmDialog from './ConfirmDialog.vue'
import { practiceCategories } from '../data/players.js'
import { practiceLeaders } from '../practice/scoring.js'

const props = defineProps({ players: { type: Array, required: true }, canUndo: Boolean })
const emit = defineEmits(['switch-view', 'update-practice-stat', 'undo', 'reset-practice'])
const categoryKey = 'drew.rotation.practice.category.v1'
const selectedKey = ref(practiceCategories[0].key)
try {
  const saved = localStorage.getItem(categoryKey)
  if (practiceCategories.some((category) => category.key === saved)) selectedKey.value = saved
} catch { /* Scoring still works when preferences cannot be saved. */ }

const category = computed(() => practiceCategories.find((item) => item.key === selectedKey.value))
const lead = computed(() => practiceLeaders(props.players))
const leaderIds = computed(() => new Set(lead.value.players.map((player) => player.id)))
const leaderText = computed(() => lead.value.players.length === 1 ? lead.value.players[0].name
  : lead.value.players.length > 1 ? `${lead.value.players.length} tied leaders` : 'No points yet')
const resetOpen = ref(false)
const lastScoredId = ref(null)
const feedback = ref('')
let flashTimer

function selectCategory(key) {
  selectedKey.value = key
  try { localStorage.setItem(categoryKey, key) } catch { /* Optional preference only. */ }
}
function addPoint(player) {
  const key = category.value.key
  const title = category.value.title
  const value = (player.practiceStats?.[key] || 0) + 1
  emit('update-practice-stat', player.id, key, 1, (success) => {
    if (!success) return
    lastScoredId.value = player.id
    clearTimeout(flashTimer)
    flashTimer = setTimeout(() => { lastScoredId.value = null }, 650)
    feedback.value = `${player.name}: ${title} ${value}.`
  })
}
function undoPoint() { emit('undo'); lastScoredId.value = null; feedback.value = 'Last point undone.' }
function resetPractice() { emit('reset-practice'); resetOpen.value = false; lastScoredId.value = null; feedback.value = 'Practice reset.' }
function photoFallback(event) { event.target.onerror = null; event.target.src = '/icon.png' }
function firstName(name) { return name.split(' ')[0] }
function lastName(name) { return name.split(' ').slice(1).join(' ') }
onBeforeUnmount(() => clearTimeout(flashTimer))
</script>

<template>
  <main class="practice-view" :style="{ '--practice-rows': Math.max(1, Math.ceil(players.length / 4)), '--practice-wide-rows': Math.max(1, Math.ceil(players.length / 5)) }">
    <header class="practice-header">
      <button class="practice-nav" @click="emit('switch-view', 'landing')">Menu</button>
      <h1>PRACTICE</h1>
      <button class="practice-reset" @click="resetOpen = true">Reset</button>
    </header>
    <section class="practice-lead" aria-label="Practice leaders">
      <span class="practice-lead-label">{{ lead.score ? 'LEAD' : 'READY' }}</span>
      <strong>{{ leaderText }}</strong><b v-if="lead.score">{{ lead.score }} <small>pts</small></b>
    </section>
    <div class="practice-workspace">
      <section class="practice-roster" aria-label="Practice scoring grid">
        <button v-for="player in players" :key="player.id" class="practice-card" :class="{ 'is-leader': leaderIds.has(player.id), 'just-scored': lastScoredId === player.id }"
          :aria-label="`Add ${category.title} for ${player.name}`" :aria-description="`${category.title}: ${player.practiceStats?.[category.key] || 0}. Total: ${player.practiceTotal || 0}.`" @click="addPoint(player)">
          <span class="practice-player-heading"><img class="practice-photo" :src="player.img" alt="" loading="lazy" decoding="async" @error="photoFallback" /><span class="practice-player-name"><span>{{ firstName(player.name) }}</span><span>{{ lastName(player.name) }}</span></span></span>
          <span class="practice-player-score"><b>{{ player.practiceTotal || 0 }}</b><span class="practice-stat-count">{{ category.label }} <strong>{{ player.practiceStats?.[category.key] || 0 }}</strong></span></span>
        </button>
      </section>
      <footer class="practice-toolbar">
        <div class="practice-current-stat"><button class="practice-undo" :disabled="!canUndo" aria-label="Undo last practice point" @click="undoPoint">Undo</button><div><h2>{{ category.title }}</h2><p>Tap a player to add 1</p></div></div>
        <div class="practice-categories" role="group" aria-label="Choose practice stat">
          <button v-for="item in practiceCategories" :key="item.key" :aria-label="`Select ${item.title}`" :aria-pressed="selectedKey === item.key" :class="{ active: selectedKey === item.key }" @click="selectCategory(item.key)">{{ item.label }}</button>
        </div>
      </footer>
    </div>
    <p class="sr-only" role="status" aria-live="polite">{{ feedback }}</p>
    <ConfirmDialog v-if="resetOpen" title="Reset practice?" confirm-label="Reset practice" danger @cancel="resetOpen = false" @confirm="resetPractice"><p>Clear all practice points for every player?</p></ConfirmDialog>
  </main>
</template>
