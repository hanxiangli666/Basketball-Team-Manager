<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
defineProps({ title: String, confirmLabel: { type: String, default: 'Confirm' }, danger: Boolean, disabled: Boolean })
const emit = defineEmits(['cancel', 'confirm'])
const dialog = ref(null)
let previousFocus
function handleCancel(event) { event.preventDefault(); emit('cancel') }
onMounted(() => {
  previousFocus = document.activeElement
  dialog.value.showModal()
  dialog.value.querySelector('[data-cancel]')?.focus()
})
onBeforeUnmount(() => { dialog.value?.close(); previousFocus?.focus() })
</script>

<template>
  <dialog ref="dialog" class="confirm-dialog" aria-labelledby="confirm-dialog-title" @cancel="handleCancel">
    <form @submit.prevent="emit('confirm')">
      <div class="dialog-heading"><span class="eyebrow">DREW BASKETBALL</span><h2 id="confirm-dialog-title">{{ title }}</h2></div>
      <div class="dialog-body"><slot /></div>
      <div class="dialog-actions">
        <button data-cancel type="button" class="button button-quiet" @click="emit('cancel')">Cancel</button>
        <button type="submit" class="button" :class="danger ? 'button-danger' : 'button-green'" :disabled="disabled">{{ confirmLabel }}</button>
      </div>
    </form>
  </dialog>
</template>
