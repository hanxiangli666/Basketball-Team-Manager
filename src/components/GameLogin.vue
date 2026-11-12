<script setup>
import { onMounted, ref } from 'vue'
defineProps({ busy: Boolean, error: String })
const emit = defineEmits(['submit', 'back'])
const password = ref('')
const field = ref(null)
onMounted(() => field.value?.focus())
</script>

<template>
  <main class="login-view">
    <header><button :disabled="busy" @click="emit('back')">Back</button><span>DREW MBB</span></header>
    <form class="login-form" @submit.prevent="emit('submit', password)">
      <p class="login-eyebrow">TEAM ACCESS</p>
      <h1>请输入密码</h1>
      <p class="login-description">仅供球队工作人员使用</p>
      <label class="sr-only" for="game-password">密码</label>
      <input id="game-password" ref="field" v-model="password" type="password" inputmode="numeric" autocomplete="current-password" maxlength="4" required aria-describedby="login-error" :aria-invalid="Boolean(error)" :disabled="busy" />
      <p id="login-error" class="login-error" role="alert">{{ error }}</p>
      <button class="login-submit" type="submit" :disabled="busy || password.length !== 4">{{ busy ? '正在连接…' : '确认' }}</button>
    </form>
  </main>
</template>
