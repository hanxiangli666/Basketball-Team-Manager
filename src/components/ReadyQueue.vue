<script setup>
defineProps({ players: Array, activeId: Number })
const emit = defineEmits(['select', 'clear'])
</script>

<template>
  <div class="ready-queue" role="group" aria-label="Ready substitutions">
    <span class="ready-queue-label">READY <b>{{ players.length }}</b></span>
    <div class="ready-chips">
      <button v-for="player in players" :key="player.id" :aria-label="`Use ${player.name} as next incoming player`" :aria-pressed="activeId === player.id" :class="{ active: activeId === player.id }" @click="emit('select', player.id)">
        {{ player.name }}<span v-if="activeId === player.id" aria-hidden="true">→</span>
      </button>
    </div>
    <button class="clear-ready" aria-label="Clear ready players" @click="emit('clear')">×</button>
  </div>
</template>
