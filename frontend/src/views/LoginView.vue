<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { motion } from 'motion-v'
import { apiRequest } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import { useLocale } from '../stores/locale'
import InlineStatus from '../components/InlineStatus.vue'
import FluidButton from '../components/FluidButton.vue'

const auth = useAuthStore()
const { t, locale } = useLocale()
const route = useRoute()
const router = useRouter()
const mode = ref<'login' | 'register' | 'forgot' | 'reset'>(route.query.token ? 'reset' : 'login')
const username = ref('')
const password = ref('')
const nickname = ref('')
const email = ref('')
const phone = ref('')
const resetToken = ref(String(route.query.token ?? ''))
const message = ref('')
const error = ref('')
const submitting = ref(false)
const title = computed(() => ({ login: t.value.auth.login, register: t.value.auth.register, forgot: t.value.auth.forgot, reset: t.value.auth.reset })[mode.value])
const story = computed(() => locale.value === 'en-US' ? {
  aria: 'Account features', alt: 'Concept view of Heluo Digital Museum', title: 'Connect your online journey with your next visit.', items: ['Save your visitor profile', 'Submit and track visit bookings', 'Manage store orders and mock payments'], context: 'Heluo Digital Museum account'
} : {
  aria: '账户功能说明', alt: '河洛数字博物馆建筑概念图', title: '把线上探索，接到下一次相见。', items: ['保存个人参观信息', '提交并查看预约状态', '管理文创订单与模拟支付'], context: '河洛数字博物馆账户'
})

function switchMode(next: typeof mode.value) {
  mode.value = next
  message.value = ''
  error.value = ''
}

async function submit() {
  submitting.value = true
  message.value = ''
  error.value = ''
  try {
    if (mode.value === 'login') {
      await auth.login(username.value, password.value)
      await router.push(auth.isAdmin ? '/admin' : '/profile')
    } else if (mode.value === 'register') {
      await auth.register({ username: username.value, password: password.value, nickname: nickname.value, email: email.value || undefined, phone: phone.value || undefined })
      message.value = locale.value === 'en-US' ? 'Account created. Sign in with your username and password.' : '账号创建成功，请使用用户名和密码登录。'
      mode.value = 'login'
    } else if (mode.value === 'forgot') {
      await apiRequest('/auth/password-reset/request', 'POST', { username: username.value, email: email.value })
      message.value = locale.value === 'en-US' ? 'If the account and email match, a reset link has been sent. In development, check the Mailpit inbox.' : '若账号与已绑定邮箱匹配，重置链接已发送。开发环境请在 Mailpit 测试收件箱查看邮件。'
    } else {
      await apiRequest('/auth/password-reset/confirm', 'POST', { resetToken: resetToken.value, newPassword: password.value })
      message.value = locale.value === 'en-US' ? 'Password updated. Please sign in again.' : '密码已更新，请重新登录。'
      mode.value = 'login'
    }
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : (locale.value === 'en-US' ? 'Submission failed. Please try again.' : '提交失败，请稍后重试。')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="auth-page">
    <aside class="auth-story" :aria-label="story.aria"><img src="/media/editorial/museum-exterior-watercolor.webp" :alt="story.alt" /><div><p>VISITOR ACCOUNT</p><h2>{{ story.title }}</h2><ul><li v-for="item in story.items" :key="item">{{ item }}</li></ul></div></aside>
    <motion.section class="auth-panel" data-glass="dark" data-glass-controls :initial="{ opacity: 0 }" :animate="{ opacity: 1 }" :transition="{ duration: 0.18 }"><p class="auth-context">{{ story.context }}</p><h1>{{ title }}</h1><p class="auth-intro">{{ t.auth.intro }}</p>
    <InlineStatus v-if="message" kind="success" :message="message" />
    <InlineStatus v-if="error" kind="error" :message="error" />
    <form @submit.prevent="submit">
      <label v-if="mode !== 'reset'">{{ t.auth.username }}<input v-model.trim="username" minlength="3" maxlength="32" pattern="[A-Za-z0-9_]+" required autocomplete="username" /></label>
      <label v-if="mode === 'register'">{{ t.auth.nickname }}<input v-model.trim="nickname" maxlength="50" required autocomplete="nickname" /></label>
      <label v-if="mode === 'register' || mode === 'forgot'">{{ t.auth.email }}<span v-if="mode === 'register'">{{ t.auth.emailOptional }}</span><input v-model.trim="email" type="email" :required="mode === 'forgot'" autocomplete="email" /></label>
      <label v-if="mode === 'register'">{{ t.auth.phoneOptional }}<input v-model.trim="phone" maxlength="20" autocomplete="tel" /></label>
      <label v-if="mode === 'reset'">{{ t.auth.token }}<input v-model.trim="resetToken" required /></label>
      <label v-if="mode === 'login' || mode === 'register' || mode === 'reset'">{{ t.auth.password }}<input v-model="password" type="password" minlength="8" maxlength="72" required :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" /></label>
      <FluidButton type="submit" block :loading="submitting">{{ submitting ? t.auth.submitting : title }}</FluidButton>
    </form>
    <div class="auth-switch"><button v-if="mode !== 'login'" type="button" @click="switchMode('login')">{{ t.auth.back }}</button><button v-if="mode === 'login'" type="button" @click="switchMode('register')">{{ t.auth.create }}</button><button v-if="mode === 'login'" type="button" @click="switchMode('forgot')">{{ t.auth.forgotAction }}</button></div>
    </motion.section>
  </main>
</template>
