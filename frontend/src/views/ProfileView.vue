<script setup lang="ts">
import '../assets/task-pages.css'
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import InlineStatus from '../components/InlineStatus.vue'
import FluidButton from '../components/FluidButton.vue'
import { useLocale } from '../stores/locale'

const ProfileAppointments = defineAsyncComponent(() => import('../components/ProfileAppointments.vue'))
const ProfileOrders = defineAsyncComponent(() => import('../components/ProfileOrders.vue'))

const auth = useAuthStore()
const router = useRouter()
const { locale } = useLocale()
const copy = computed(() => locale.value === 'zh-CN' ? {
  storyAria: '个人中心导航', storyTitle: '你的河洛参观档案。', booking: '预约一次参观', orders: '查看文创与订单',
  storyEyebrow: 'VISITOR FILE / 个人档案', storyIntro: '记录你的线上探索、线下相见，以及从馆藏延伸出的日常选择。', quickLinksAria: '个人中心快捷入口',
  context: '账户与参观信息', title: '个人中心', nickname: '昵称', email: '邮箱', phone: '手机号', save: '保存资料', logout: '退出登录',
  fieldsTitle: '资料字段', fieldsHint: '用于预约通知与订单联系，请保持信息准确。',
  saved: '个人资料已保存。', saveError: '保存失败。',
} : {
  storyAria: 'Profile navigation', storyTitle: 'Your Heluo visitor file.', booking: 'Book a visit', orders: 'View store and orders',
  storyEyebrow: 'VISITOR FILE / PROFILE', storyIntro: 'Keep a quiet record of what you explored, where you went, and what you brought into daily life.', quickLinksAria: 'Profile shortcuts',
  context: 'ACCOUNT & VISIT DETAILS', title: 'Profile', nickname: 'Display name', email: 'Email', phone: 'Phone', save: 'Save profile', logout: 'Sign out',
  fieldsTitle: 'Contact details', fieldsHint: 'Used for visit notifications and order contact. Keep them current.',
  saved: 'Your profile has been saved.', saveError: 'Unable to save your profile.',
})
const nickname = ref('')
const email = ref('')
const phone = ref('')
const message = ref('')
const error = ref('')
const saving = ref(false)
const recordsSentinel = ref<HTMLElement | null>(null)
const recordsReady = ref(false)
let recordsObserver: IntersectionObserver | undefined

function observeRecords() {
  if (typeof IntersectionObserver === 'undefined' || !recordsSentinel.value) {
    recordsReady.value = true
    return
  }
  recordsObserver = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return
    recordsReady.value = true
    recordsObserver?.disconnect()
    recordsObserver = undefined
  })
  recordsObserver.observe(recordsSentinel.value)
}

async function loadProfile() {
  await auth.initialize()
  if (!auth.user) {
    if (auth.token && auth.initializationError) return
    await router.replace({ path: '/login', query: { returnTo: '/profile' } })
    return
  }
  nickname.value = auth.user.nickname
  email.value = auth.user.email
  phone.value = auth.user.phone
  await nextTick()
  observeRecords()
}
onMounted(loadProfile)
onBeforeUnmount(() => recordsObserver?.disconnect())
async function save() {
  if (saving.value) return
  saving.value = true
  message.value = ''
  error.value = ''
  try { await auth.updateProfile({ nickname: nickname.value, email: email.value || undefined, phone: phone.value || undefined }); message.value = copy.value.saved }
  catch (reason) { error.value = reason instanceof Error ? reason.message : copy.value.saveError }
  finally { saving.value = false }
}
async function logout() { await auth.logout(); await router.push('/') }
</script>

<template>
  <section class="auth-page profile-page">
    <aside class="profile-story" :aria-label="copy.storyAria">
      <div class="profile-story__media" aria-hidden="true"><img src="/media/editorial/museum-exterior-watercolor.webp" alt="" /><span>HELUO / 01</span></div>
      <div class="profile-story__copy">
        <p class="profile-story__eyebrow">{{ copy.storyEyebrow }}</p>
        <h2>{{ copy.storyTitle }}</h2>
        <p class="profile-story__intro">{{ copy.storyIntro }}</p>
        <nav class="profile-story__links" :aria-label="copy.quickLinksAria">
          <RouterLink to="/appointment"><span>01</span>{{ copy.booking }} <b aria-hidden="true">↗</b></RouterLink>
          <RouterLink to="/shop"><span>02</span>{{ copy.orders }} <b aria-hidden="true">↗</b></RouterLink>
        </nav>
      </div>
    </aside>
    <div v-if="auth.user" class="profile-main">
      <section class="auth-panel profile-account-panel" data-glass="dark" data-glass-controls>
        <header class="profile-account-heading">
          <div>
            <p class="auth-context">{{ copy.context }}</p>
            <h1>{{ copy.title }}</h1>
          </div>
          <span class="profile-account-mark" aria-hidden="true">{{ (auth.user.nickname || auth.user.username).slice(0, 1) }}</span>
        </header>
        <p class="profile-identity"><strong>{{ auth.user.nickname || auth.user.username }}</strong><span>{{ auth.user.username }} · {{ auth.user.roles.join(' / ') }}</span></p>
        <InlineStatus v-if="message" kind="success" :message="message" /><InlineStatus v-if="error" kind="error" :message="error" />
        <div class="profile-form-intro"><strong>{{ copy.fieldsTitle }}</strong><span>{{ copy.fieldsHint }}</span></div>
        <form class="profile-form" @submit.prevent="save"><label>{{ copy.nickname }}<input v-model.trim="nickname" required maxlength="50" /></label><label>{{ copy.email }}<input v-model.trim="email" type="email" /></label><label>{{ copy.phone }}<input v-model.trim="phone" maxlength="20" /></label><FluidButton type="submit" block :loading="saving" :disabled="saving">{{ copy.save }}</FluidButton></form>
        <button class="secondary-button" data-glass="compact" data-glass-interactive type="button" @click="logout">{{ copy.logout }}</button>
      </section>
      <div class="profile-records">
        <span v-if="!recordsReady" ref="recordsSentinel" class="profile-records__sentinel" aria-hidden="true"></span>
        <template v-else><ProfileAppointments :token="auth.token" /><ProfileOrders :token="auth.token" /></template>
      </div>
    </div>
    <div v-else-if="auth.initializationError" class="profile-main state-panel state-panel--action"><InlineStatus kind="error" :message="auth.initializationError" /><button type="button" @click="loadProfile">{{ locale === 'en-US' ? 'Retry account loading' : '重新加载账户' }}</button></div>
  </section>
</template>
