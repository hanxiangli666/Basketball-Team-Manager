<script setup>
defineProps({ prefix: String, invalid: Boolean })
const minutes = defineModel('minutes')
const seconds = defineModel('seconds')
</script>

<template>
  <div class="time-fields">
    <label :for="`${prefix}-minutes`">Minutes<input :id="`${prefix}-minutes`" v-model="minutes" class="clock-input" inputmode="numeric" pattern="[0-9]*" autocomplete="off" :aria-invalid="invalid" :aria-describedby="`${prefix}-error`" @focus="$event.target.select()" /></label>
    <span aria-hidden="true">:</span>
    <label :for="`${prefix}-seconds`">Seconds<input :id="`${prefix}-seconds`" v-model="seconds" class="clock-input" inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="2" :aria-invalid="invalid" :aria-describedby="`${prefix}-error`" @focus="$event.target.select()" /></label>
  </div>
</template>
