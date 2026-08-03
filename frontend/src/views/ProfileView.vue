<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { motion } from 'motion-v'
import { useAuthStore } from '../stores/auth'
import InlineStatus from '../components/InlineStatus.vue'
import FluidButton from '../components/FluidButton.vue'

const auth = useAuthStore()
const router = useRouter()
const nickname = ref('')
const email = ref('')
const phone = ref('')
const message = ref('')
const error = ref('')

onMounted(async () => { await auth.initialize(); if (!auth.user) { await router.replace('/login') } else { nickname.value = auth.user.nickname; email.value = auth.user.email; phone.value = auth.user.phone } })
async function save() { try { await auth.updateProfile({ nickname: nickname.value, email: email.value || undefined, phone: phone.value || undefined }); message.value = '个人资料已保存。'; error.value = '' } catch (reason) { error.value = reason instanceof Error ? reason.message : '保存失败。' } }
async function logout() { await auth.logout(); await router.push('/') }
</script>

<template>
  <main class="auth-page profile-page">
    <aside class="auth-story profile-story" aria-label="个人中心导航"><div><p>VISITOR FILE</p><h2>你的河洛参观档案。</h2><RouterLink to="/appointment">预约一次参观 →</RouterLink><RouterLink to="/shop">查看文创与订单 →</RouterLink></div></aside>
    <motion.section class="auth-panel" :initial="{ opacity: 0 }" :animate="{ opacity: 1 }" :transition="{ duration: 0.18 }"><p class="auth-context">账户与参观信息</p><h1>个人中心</h1><p v-if="auth.user" class="profile-identity">{{ auth.user.username }} · {{ auth.user.roles.join('、') }}</p><InlineStatus v-if="message" kind="success" :message="message" /><InlineStatus v-if="error" kind="error" :message="error" /><form @submit.prevent="save"><label>昵称<input v-model.trim="nickname" required maxlength="50" /></label><label>邮箱<input v-model.trim="email" type="email" /></label><label>手机号<input v-model.trim="phone" maxlength="20" /></label><FluidButton type="submit" block>保存资料</FluidButton></form><button class="secondary-button" type="button" @click="logout">退出登录</button></motion.section>
  </main>
</template>
