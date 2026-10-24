<script setup>
import { computed, ref } from 'vue'
import ConfirmDialog from './ConfirmDialog.vue'
import { practiceCategories } from '../data/players.js'
const props = defineProps({ players: Array })
const emit = defineEmits(['update-stat', 'reset'])
const category = ref('charges')
const sorted = ref(false)
const confirmReset = ref(false)
const lastChange = ref(null)
const lastTaps = new Map()
const total = (player) => Object.values(player.practiceStats).reduce((sum, value) => sum + value, 0)
const rows = computed(() => sorted.value ? [...props.players].sort((a, b) => total(b) - total(a)) : props.players)
function update(player, delta) {
  const now = performance.now()
  if (now - (lastTaps.get(player.id) ?? -1000) < 350) return
  lastTaps.set(player.id, now)
  if (delta < 0 && player.practiceStats[category.value] === 0) return
  lastChange.value = { playerId: player.id, key: category.value, delta }
  emit('update-stat', player.id, category.value, delta)
}
function undo() {
  if (!lastChange.value) return
  const change = lastChange.value
  emit('update-stat', change.playerId, change.key, -change.delta)
  lastChange.value = null
}
</script>

<template>
  <main class="desk practice-desk">
    <div class="page-heading"><div><p class="eyebrow">PUT IN THE WORK</p><h1>Practice<span class="heading-dot">.</span></h1></div><span class="local-label">Saved on this device</span></div>
    <div class="practice-toolbar"><label>Tracking <select v-model="category"><option v-for="item in practiceCategories" :key="item.key" :value="item.key">{{ item.title }}</option></select></label><div><button class="button button-quiet" :disabled="!lastChange" @click="undo">↶ Undo</button><button class="button button-quiet" :aria-pressed="sorted" @click="sorted = !sorted">{{ sorted ? 'Jersey order' : 'Sort by total' }}</button></div></div>
    <div class="practice-list"><article v-for="player in rows" :key="player.id" class="practice-player"><img :src="player.img" :alt="player.name" /><div class="practice-player-name"><span class="position-label">#{{ player.number }} · {{ player.pos }}</span><h2>{{ player.name }}</h2></div><span class="practice-total">{{ total(player) }} <small>total</small></span><div class="practice-stepper"><button :disabled="player.practiceStats[category] === 0" :aria-label="`Subtract ${category} for ${player.name}`" @click="update(player, -1)">−</button><strong>{{ player.practiceStats[category] }}</strong><button :aria-label="`Add ${category} for ${player.name}`" @click="update(player, 1)">+</button></div></article></div>
    <footer class="game-footer"><span class="footer-credit">One category at a time. Every rep counts.</span><button class="button new-game-button" @click="confirmReset = true">Reset practice</button></footer>
    <ConfirmDialog v-if="confirmReset" title="Reset practice stats?" danger confirm-label="Reset practice" @cancel="confirmReset = false" @confirm="emit('reset'); lastChange = null; confirmReset = false"><p>This clears every player’s practice stats. Game minutes and fouls will be kept.</p></ConfirmDialog>
  </main>
</template>
