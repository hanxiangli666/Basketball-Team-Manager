<script setup>
import { computed, ref } from "vue"
import { practiceCategories } from "../data/players"

const props = defineProps({
  players: {
    type: Array,
    required: true,
  },
  sortMode: {
    type: String,
    default: "default",
  },

})

const emit = defineEmits([
  "switch-view",
  "update-practice-stat",
  "sort-practice",
  "reset-practice",
])

const currentChartMetric = ref("total")

const chartMetricLabels = practiceCategories.reduce(
  (acc, category) => ({ ...acc, [category.key]: category.label }),
  { total: "TOTAL SCORE" },
)

const maxScore = computed(() => {
  if (!props.players.length) return 0
  return Math.max(...props.players.map((player) => player.practiceTotal || 0))
})

const sortedChartPlayers = computed(() => {
  const metric = currentChartMetric.value

  return [...props.players].sort((a, b) => {
    const aValue =
      metric === "total" ? a.practiceTotal || 0 : a.practiceStats?.[metric] || 0
    const bValue =
      metric === "total" ? b.practiceTotal || 0 : b.practiceStats?.[metric] || 0

    if (bValue !== aValue) return bValue - aValue
    return a.id - b.id
  })
})

const chartMaxValue = computed(() => {
  if (!sortedChartPlayers.value.length) return 0

  return Math.max(
    ...sortedChartPlayers.value.map((player) =>
      currentChartMetric.value === "total"
        ? player.practiceTotal || 0
        : player.practiceStats?.[currentChartMetric.value] || 0,
    ),
  )
})

function getMetricValue(player, metric = currentChartMetric.value) {
  return metric === "total"
    ? player.practiceTotal || 0
    : player.practiceStats?.[metric] || 0
}

function handleAdd(playerId, key) {
  emit("update-practice-stat", playerId, key, 1)
}

function handleSort() {
  emit("sort-practice")
}

function handleReset() {
  const confirmed = window.confirm("Reset all practice stats?")
  if (confirmed) {
    emit("reset-practice")
  }
}

function switchChartMetric(metric) {
  currentChartMetric.value = metric
}

</script>

<template>
  <div class="practice-view min-h-[100dvh] flex flex-col bg-gray-100">
    <div class="practice-header z-30 shrink-0 shadow-md bg-[#144935] text-white min-h-14 flex flex-wrap md:flex-nowrap justify-between items-center px-4 pt-[max(0.5rem,env(safe-area-inset-top))] md:py-0 border-b border-[#0e3325] relative">
      <div class="flex min-h-12 items-center gap-3 z-10">
        <button
          @click="emit('switch-view', 'landing')"
          class="flex items-center text-green-300 hover:text-white transition-colors"
        >
          <span class="ml-1 text-xs font-bold uppercase">Menu</span>
        </button>

        <div>
          <h1 class="text-sm sm:text-lg font-extrabold tracking-tight leading-none">
            PRACTICE MODE
          </h1>
          <div class="text-[9px] uppercase tracking-[0.24em] text-green-200 mt-0.5">
            Saved on this device
          </div>
        </div>
      </div>

      <div class="w-[calc(100%+2rem)] -mx-4 px-4 py-2 md:w-auto md:mx-0 md:px-0 md:py-0 grid grid-cols-2 md:flex items-center gap-2 z-10 bg-[#0e3325]/80 md:bg-transparent">
        <button
          @click="handleSort"
          class="min-h-10 md:min-h-0 bg-yellow-500 hover:bg-yellow-400 text-black text-[10px] sm:text-xs px-2 sm:px-3 py-1.5 rounded shadow transition-colors font-bold uppercase tracking-wide sm:tracking-wider"
        >
          {{ sortMode === "score-desc" ? "Sorted" : "Sort" }}
        </button>

        <button
          @click="handleReset"
          class="min-h-10 md:min-h-0 bg-red-700/80 hover:bg-red-600 text-white text-[10px] sm:text-xs px-2 sm:px-3 py-1.5 rounded shadow transition-colors font-bold uppercase tracking-wide sm:tracking-wider"
        >
          Reset
        </button>
      </div>
    </div>

    <div class="flex-1 min-h-0 overflow-hidden flex flex-col p-1 md:p-2">
      <div class="mobile-scroll flex-1 min-h-0 overflow-y-auto practice-grid grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1 md:gap-2 content-start pb-1 md:pb-2">
        <div
          v-for="player in players"
          :key="player.id"
          :class="[
            'practice-card flex flex-col min-w-0 p-1 md:p-1.5 rounded-md md:rounded-lg shadow-sm border transition-all',
            maxScore > 0 && (player.practiceTotal || 0) === maxScore
              ? 'ring-2 ring-yellow-400 bg-yellow-50 border-yellow-200'
              : 'border-gray-200 bg-white'
          ]"
        >
          <div class="practice-player-heading flex items-center gap-1 md:gap-2 mb-1 md:mb-1.5 border-b border-gray-100 pb-1 md:pb-1.5">
            <div class="practice-photo relative w-5 h-6 md:w-8 md:h-10 shrink-0">
              <img
                :src="player.img"
                :alt="player.name"
                class="w-full h-full object-cover rounded bg-gray-200" loading="lazy" decoding="async"
              />
              <div
                v-if="maxScore > 0 && (player.practiceTotal || 0) === maxScore"
                class="absolute -top-1 -left-1 text-[5px] md:text-[8px] font-black tracking-widest bg-yellow-400 text-black px-0.5 md:px-1 py-px md:py-0.5 rounded shadow"
              >
                LEAD
              </div>
            </div>

            <div class="flex-1 min-w-0">
              <div class="practice-player-name text-[7px] md:text-[10px] font-bold text-gray-900 truncate">
                {{ player.name }}
              </div>
              <div class="practice-player-position text-[6px] md:text-[8px] text-gray-400 truncate">
                {{ player.pos }}
              </div>
            </div>

            <div
              :class="[
                'text-xs md:text-lg font-black leading-none',
                maxScore > 0 && (player.practiceTotal || 0) === maxScore
                  ? 'text-green-600'
                  : 'text-gray-800'
              ]"
            >
              {{ player.practiceTotal || 0 }}
            </div>
          </div>

          <div class="practice-stats grid grid-cols-3 gap-0.5 md:gap-1">
            <div
              v-for="category in practiceCategories"
              :key="category.key"
              class="flex min-w-0 flex-col items-center justify-center gap-px md:gap-1"
            >
              <span class="practice-stat-label text-[5px] md:text-[7px] text-gray-400 font-bold uppercase leading-none">
                {{ category.label }}
              </span>

              <button
                @click="handleAdd(player.id, category.key)"
                class="practice-stat-button w-full h-3.5 md:h-5 bg-white border border-gray-200 rounded-sm md:rounded text-[7px] md:text-[10px] font-bold text-gray-700 hover:bg-green-50 hover:border-green-300 hover:text-green-700 active:bg-green-600 active:text-white transition-colors shadow-sm leading-none"
                :title="category.title"
                :aria-label="`Add ${category.title} for ${player.name}`"
              >
                {{ player.practiceStats?.[category.key] || 0 }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="practice-leaderboard mt-1 md:mt-0 h-40 md:h-48 bg-white p-1.5 md:p-2 rounded-lg md:rounded-xl shadow-sm border border-gray-200 shrink-0 flex flex-col">
        <div class="flex justify-between items-center mb-1">
          <h3 class="font-bold text-gray-800 text-[10px] uppercase flex items-center gap-2">
            Stats Leaderboard
          </h3>
          <span class="text-[9px] font-black text-green-600 bg-green-50 px-2 py-0.5 rounded">
            {{ chartMetricLabels[currentChartMetric] }}
          </span>
        </div>

        <div class="flex gap-1 overflow-x-auto pb-1 mb-1 scrollbar-hide">
          <button
            @click="switchChartMetric('total')"
            :class="[
              'px-2 py-0.5 rounded text-[9px] font-bold uppercase transition-colors shrink-0 border',
              currentChartMetric === 'total'
                ? 'bg-green-600 text-white border-green-600'
                : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
            ]"
          >
            Total
          </button>

          <button
            v-for="category in practiceCategories"
            :key="category.key"
            @click="switchChartMetric(category.key)"
            :class="[
              'px-2 py-0.5 rounded text-[9px] font-bold uppercase transition-colors shrink-0 border',
              currentChartMetric === category.key
                ? 'bg-green-600 text-white border-green-600'
                : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
            ]"
          >
            {{ category.label }}
          </button>
        </div>

        <div class="mobile-scroll flex-1 overflow-y-auto pr-1">
          <div
            v-if="sortedChartPlayers.length"
            class="grid gap-1.5"
          >
            <div
              v-for="(player, index) in sortedChartPlayers"
              :key="`${currentChartMetric}-${player.id}`"
              class="grid grid-cols-[minmax(0,92px)_1fr_34px] items-center gap-2"
            >
              <div class="truncate text-[9px] font-bold text-gray-700">
                {{ player.name }}
              </div>

              <div class="h-5 rounded bg-gray-100 overflow-hidden border border-gray-200">
                <div
                  :class="[
                    'h-full flex items-center justify-end pr-1 text-[9px] font-black transition-all duration-300',
                    index === 0 && getMetricValue(player) > 0
                      ? 'bg-yellow-400 text-black'
                      : 'bg-[#144935] text-white'
                  ]"
                  :style="{
                    width: `${chartMaxValue > 0 ? Math.max((getMetricValue(player) / chartMaxValue) * 100, getMetricValue(player) > 0 ? 12 : 0) : 0}%`
                  }"
                >
                  <span v-if="getMetricValue(player) > 0">
                    {{ getMetricValue(player) }}
                  </span>
                </div>
              </div>

              <div class="text-right text-[9px] font-black text-gray-600">
                {{ getMetricValue(player) }}
              </div>
            </div>
          </div>

          <div
            v-else
            class="h-full flex items-center justify-center text-xs text-gray-400"
          >
            No practice data yet
          </div>
        </div>
      </div>
    </div>

  </div>
</template>
