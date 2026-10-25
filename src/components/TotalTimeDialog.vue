<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { formatTime } from '../game/session.js'

const props = defineProps({ players: Array })
const emit = defineEmits(['close'])
const dialog = ref(null)
const ranked = computed(() => [...props.players].sort((a, b) => b.totalMs - a.totalMs || Number(b.isOnCourt) - Number(a.isOnCourt)))
let previousFocus
onMounted(() => { previousFocus = document.activeElement; dialog.value.showModal(); dialog.value.querySelector('button').focus() })
onBeforeUnmount(() => { dialog.value.close(); previousFocus?.focus() })
function photoFallback(event) { event.target.onerror = null; event.target.src = '/icon.png' }
</script>

<template>
  <dialog ref="dialog" class="totals-dialog" aria-labelledby="totals-title" @cancel.prevent="emit('close')">
    <div class="totals-header"><div><h2 id="totals-title">Total Time</h2><p>All players · most minutes first</p></div><button aria-label="Close Total Time" @click="emit('close')">Done</button></div>
    <ol class="totals-list mobile-scroll">
      <li v-for="(player, index) in ranked" :key="player.id" class="total-player">
        <span class="total-rank">{{ index + 1 }}</span><img :src="player.img" :alt="player.name" loading="lazy" @error="photoFallback" />
        <div><h3>{{ player.name }}</h3><p>{{ player.pos }}<span v-if="player.isOnCourt" class="total-on-court"> · On court</span></p></div>
        <strong>{{ formatTime(player.totalMs) }}</strong>
      </li>
    </ol>
  </dialog>
</template>
