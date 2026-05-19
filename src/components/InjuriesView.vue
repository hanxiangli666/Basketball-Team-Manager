<script setup>
import { computed, ref } from "vue"

const props = defineProps({
  players: {
    type: Array,
    required: true,
  },
  injuredPlayerIds: {
    type: Array,
    default: () => [],
  },
  isSyncing: {
    type: Boolean,
    default: false,
  },
  syncError: {
    type: String,
    default: "",
  },
})

const emit = defineEmits([
  "switch-view",
  "add-injured-player",
  "remove-injured-player",
  "clear-injured-players",
])

const draggedPlayerId = ref(null)
const isDropActive = ref(false)

const injuredIdSet = computed(() => new Set(props.injuredPlayerIds))

const injuredPlayers = computed(() =>
  props.injuredPlayerIds
    .map((id) => props.players.find((player) => player.id === id))
    .filter(Boolean),
)

const availablePlayers = computed(() =>
  [...props.players].sort((a, b) => a.id - b.id),
)

function addInjuredPlayer(playerId) {
  if (injuredIdSet.value.has(playerId)) {
    return
  }

  emit("add-injured-player", playerId)
}

function removeInjuredPlayer(playerId) {
  emit("remove-injured-player", playerId)
}

function handleDragStart(event, playerId) {
  draggedPlayerId.value = playerId
  event.dataTransfer.effectAllowed = "copy"
  event.dataTransfer.setData("text/plain", String(playerId))
}

function handleDrop(event) {
  const droppedId = Number(event.dataTransfer.getData("text/plain") || draggedPlayerId.value)
  isDropActive.value = false
  draggedPlayerId.value = null

  if (!Number.isNaN(droppedId)) {
    addInjuredPlayer(droppedId)
  }
}

function handleDragEnd() {
  draggedPlayerId.value = null
  isDropActive.value = false
}

function handleBackClick() {
  const confirmed = window.confirm("Return to Main Menu?")
  if (confirmed) {
    emit("switch-view", "landing")
  }
}
</script>

<template>
  <div class="h-screen flex flex-col bg-gray-100">
    <div class="shrink-0 shadow-xl bg-white">
      <div class="bg-[#144935] text-white px-4 h-16 flex justify-between items-center border-b border-[#0e3325] relative">
        <div class="flex items-center gap-3 z-10">
          <button
            @click="handleBackClick"
            class="flex items-center text-green-300 hover:text-white transition-colors"
            title="Back to Menu"
          >
            <span class="ml-1 text-xs font-bold uppercase">Menu</span>
          </button>

          <div>
            <h1 class="text-xl font-extrabold tracking-tight leading-none">
              DREW MBB
            </h1>
            <span class="text-[10px] font-bold text-red-200 uppercase tracking-widest">
              INJURY TRACKER
            </span>
            <div class="text-[9px] uppercase tracking-[0.24em] text-green-200 mt-0.5">
              {{ syncError || (isSyncing ? "Syncing injuries" : `${injuredPlayers.length} players listed`) }}
            </div>
          </div>
        </div>

        <div class="absolute left-1/2 -translate-x-1/2 hidden md:block pointer-events-none">
          <img
            src="/Background.jpg"
            alt="Logo"
            class="h-12 object-contain drop-shadow-md rounded"
          />
        </div>

        <button
          class="bg-red-700 text-white px-3 py-2 rounded font-semibold text-xs shadow-sm hover:bg-red-600 transition-colors z-10 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="injuredPlayers.length === 0"
          @click="emit('clear-injured-players')"
        >
          Clear
        </button>
      </div>
    </div>

    <div class="flex-1 flex flex-col md:flex-row overflow-hidden relative">
      <div class="w-full md:w-5/12 flex flex-col bg-gray-50 border-r border-gray-300">
        <div class="bg-[#7f1d1d] text-white px-4 py-2 font-extrabold text-sm tracking-wider flex justify-between items-center border-b-4 border-red-300">
          <span>INJURED PLAYERS</span>
          <span class="bg-red-900/50 text-white px-2 py-0.5 rounded text-sm">
            {{ injuredPlayers.length }}
          </span>
        </div>

        <div
          :class="[
            'flex-1 p-2 overflow-y-auto flex flex-col gap-2 transition-colors',
            isDropActive ? 'bg-red-50' : 'bg-gray-50'
          ]"
          @dragover.prevent="isDropActive = true"
          @dragleave="isDropActive = false"
          @drop.prevent="handleDrop"
        >
          <div
            v-if="injuredPlayers.length === 0"
            :class="[
              'min-h-64 rounded-lg border-2 border-dashed flex items-center justify-center text-center px-6 transition-colors',
              isDropActive
                ? 'border-red-500 bg-red-100 text-red-800'
                : 'border-gray-300 bg-white text-gray-400'
            ]"
          >
            <div>
              <div class="text-sm font-black uppercase tracking-widest">
                Drop Injured Players Here
              </div>
              <div class="mt-2 text-xs font-semibold">
                Drag a player from the roster list.
              </div>
            </div>
          </div>

          <div
            v-for="player in injuredPlayers"
            :key="player.id"
            class="bg-[#7f1d1d] text-white border-l-[6px] border-red-300 rounded-md flex items-center gap-2 p-2 shadow relative overflow-hidden"
          >
            <div class="w-12 h-16 sm:w-16 sm:h-20 rounded border-2 border-white shrink-0 relative bg-gray-200 overflow-hidden">
              <img
                :src="player.img"
                :alt="player.name"
                class="w-full h-full object-cover object-top"
              />
              <span class="absolute bottom-0 left-0 w-full text-center bg-black/70 text-white text-[9px] font-bold py-0.5">
                #{{ player.number }}
              </span>
            </div>

            <div class="flex-1 min-w-0">
              <h3 class="font-bold text-sm leading-tight text-white truncate">
                {{ player.name }}
              </h3>
              <div class="text-[10px] text-red-100 font-bold uppercase tracking-widest mt-1">
                {{ player.pos }}
              </div>
            </div>

            <button
              class="bg-white/10 hover:bg-white/20 border border-white/20 text-white px-3 py-2 rounded font-bold text-xs uppercase transition-colors"
              @click="removeInjuredPlayer(player.id)"
            >
              Remove
            </button>
          </div>
        </div>
      </div>

      <div class="w-full md:w-7/12 flex flex-col bg-white">
        <div class="bg-gray-100 text-gray-600 px-4 py-2 font-extrabold text-sm tracking-wider border-b border-gray-300 flex justify-between items-center h-10">
          <span>ALL PLAYERS</span>
          <span class="text-[10px] font-black uppercase tracking-widest text-gray-400">
            Drag to add
          </span>
        </div>

        <div class="flex-1 p-2 overflow-y-auto">
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
            <div
              v-for="player in availablePlayers"
              :key="player.id"
              :draggable="!injuredIdSet.has(player.id)"
              :class="[
                'bg-white text-gray-700 border rounded p-1 cursor-grab active:cursor-grabbing hover:border-red-400 shadow-sm flex flex-col items-center relative pb-2 transition-all',
                injuredIdSet.has(player.id)
                  ? 'opacity-50 border-red-200 bg-red-50 cursor-not-allowed'
                  : 'border-gray-200'
              ]"
              @dragstart="handleDragStart($event, player.id)"
              @dragend="handleDragEnd"
            >
              <div class="w-full rounded mb-1 relative border border-gray-100 overflow-hidden bg-gray-200 aspect-[3/4]">
                <img
                  :src="player.img"
                  :alt="player.name"
                  class="w-full h-full object-cover object-top"
                />
                <span class="absolute bottom-0 right-0 bg-gray-700 text-white text-[9px] px-1 font-bold shadow">
                  #{{ player.number }}
                </span>
                <span
                  v-if="injuredIdSet.has(player.id)"
                  class="absolute inset-x-1 top-1 bg-red-700 text-white text-[8px] text-center font-black tracking-widest rounded px-1 py-0.5"
                >
                  LISTED
                </span>
              </div>

              <h3 class="text-[9px] font-bold text-center truncate w-full leading-tight px-0.5 mb-1">
                {{ player.name }}
              </h3>

              <div class="flex justify-between w-full px-1 items-center bg-gray-50 rounded py-0.5">
                <span class="text-[9px] font-mono text-gray-500">
                  {{ player.pos }}
                </span>
                <button
                  class="text-[9px] font-black text-red-700 hover:text-red-500 disabled:text-gray-400 disabled:cursor-not-allowed"
                  :disabled="injuredIdSet.has(player.id)"
                  @click="addInjuredPlayer(player.id)"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          <div
            v-if="availablePlayers.length === 0"
            class="h-full flex items-center justify-center text-sm text-gray-400"
          >
            No players loaded
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
