<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { motion } from 'motion-v'
import { useAuthStore } from '../stores/auth'
import InlineStatus from '../components/InlineStatus.vue'
import FluidButton from '../components/FluidButton.vue'
import { useLocale } from '../stores/locale'

const auth = useAuthStore()
const router = useRouter()
const { locale } = useLocale()
const copy = computed(() => locale.value === 'zh-CN' ? {
  storyAria: '个人中心导航', storyTitle: '你的河洛参观档案。', booking: '预约一次参观', orders: '查看文创与订单',
  context: '账户与参观信息', title: '个人中心', nickname: '昵称', email: '邮箱', phone: '手机号', save: '保存资料', logout: '退出登录',
  saved: '个人资料已保存。', saveError: '保存失败。',
} : {
  storyAria: 'Profile navigation', storyTitle: 'Your Heluo visitor file.', booking: 'Book a visit', orders: 'View store and orders',
  context: 'ACCOUNT & VISIT DETAILS', title: 'Profile', nickname: 'Display name', email: 'Email', phone: 'Phone', save: 'Save profile', logout: 'Sign out',
  saved: 'Your profile has been saved.', saveError: 'Unable to save your profile.',
})
const nickname = ref('')
const email = ref('')
const phone = ref('')
const message = ref('')
const error = ref('')

onMounted(async () => { await auth.initialize(); if (!auth.user) { await router.replace('/login') } else { nickname.value = auth.user.nickname; email.value = auth.user.email; phone.value = auth.user.phone } })
async function save() { try { await auth.updateProfile({ nickname: nickname.value, email: email.value || undefined, phone: phone.value || undefined }); message.value = copy.value.saved; error.value = '' } catch (reason) { error.value = reason instanceof Error ? reason.message : copy.value.saveError } }
async function logout() { await auth.logout(); await router.push('/') }
</script>

<template>
  <main class="auth-page profile-page">
    <aside class="auth-story profile-story" :aria-label="copy.storyAria"><div><p>VISITOR FILE</p><h2>{{ copy.storyTitle }}</h2><RouterLink to="/appointment">{{ copy.booking }} →</RouterLink><RouterLink to="/shop">{{ copy.orders }} →</RouterLink></div></aside>
    <motion.section class="auth-panel" data-glass="dark" data-glass-controls :initial="{ opacity: 0 }" :animate="{ opacity: 1 }" :transition="{ duration: 0.18 }"><p class="auth-context">{{ copy.context }}</p><h1>{{ copy.title }}</h1><p v-if="auth.user" class="profile-identity">{{ auth.user.username }} · {{ auth.user.roles.join(' / ') }}</p><InlineStatus v-if="message" kind="success" :message="message" /><InlineStatus v-if="error" kind="error" :message="error" /><form @submit.prevent="save"><label>{{ copy.nickname }}<input v-model.trim="nickname" required maxlength="50" /></label><label>{{ copy.email }}<input v-model.trim="email" type="email" /></label><label>{{ copy.phone }}<input v-model.trim="phone" maxlength="20" /></label><FluidButton type="submit" block>{{ copy.save }}</FluidButton></form><button class="secondary-button" data-glass="compact" data-glass-interactive type="button" @click="logout">{{ copy.logout }}</button></motion.section>
  </main>
</template>
