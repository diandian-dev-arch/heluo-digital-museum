<script setup lang="ts">
import { computed, nextTick, onMounted, watch, watchEffect } from 'vue'
import { AnimatePresence, MotionConfig, motion } from 'motion-v'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { useAuthStore } from './stores/auth'
import { useLocale } from './stores/locale'
import LoadingSkeleton from './components/LoadingSkeleton.vue'
import PointerCursor from './components/PointerCursor.vue'

const auth = useAuthStore()
const { locale, t, toggle } = useLocale()
const route = useRoute()
const isAdminRoute = computed(() => route.path.startsWith('/admin'))
const showMobileTabs = computed(() => !isAdminRoute.value && !route.path.startsWith('/login') && !route.path.startsWith('/reset-password'))
onMounted(auth.initialize)
watch(() => route.fullPath, async (_, previousPath) => {
  if (!previousPath) return
  await nextTick()
  document.querySelector<HTMLElement>('#main-content')?.focus({ preventScroll: true })
})
watchEffect(() => {
  const pageTitle = typeof route.meta.title === 'string' ? route.meta.title : ''
  document.title = pageTitle ? `${pageTitle}｜河洛数字博物馆` : '河洛数字博物馆'
  document.documentElement.lang = locale.value
})
</script>

<template>
  <MotionConfig reduced-motion="user">
    <div class="app-shell">
      <PointerCursor :disabled="isAdminRoute" />
      <a class="skip-link" href="#main-content">跳到主要内容</a>
      <header v-if="!isAdminRoute" class="site-header">
        <RouterLink class="brand" to="/">
        <svg class="brand-seal" viewBox="0 0 44 44" aria-hidden="true">
          <circle cx="22" cy="22" r="19.25" />
          <path d="M14 13.5h16M16.5 10v7.5h11V10M14.5 18.5h15v13h-15zM18.2 22.3h7.6M18.2 26h7.6M22 18.5v13" />
        </svg>
        <span class="brand-copy"><b>河洛数字博物馆</b><small>HELUO DIGITAL MUSEUM</small></span>
        </RouterLink>
        <nav aria-label="主导航">
          <RouterLink to="/explore">{{ t.explore }}</RouterLink>
          <RouterLink to="/exhibits">{{ t.exhibits }}</RouterLink>
          <RouterLink to="/appointment">{{ t.appointment }}</RouterLink>
          <RouterLink to="/shop">{{ t.shop }}</RouterLink>
          <RouterLink v-if="auth.isAdmin" to="/admin">{{ t.admin }}</RouterLink>
        </nav>
        <div class="site-utilities">
          <button class="locale-toggle" type="button" @click="toggle">{{ t.language }}</button>
          <RouterLink v-if="auth.loggedIn" class="login-link" to="/profile">{{ auth.user?.nickname }}</RouterLink>
          <RouterLink v-else class="login-link" to="/login">{{ t.login }}</RouterLink>
        </div>
      </header>
      <main id="main-content" class="site-main" :class="{ 'site-main--admin': isAdminRoute }" tabindex="-1">
        <AnimatePresence mode="sync" :initial="false">
          <motion.div v-if="route.fullPath" :key="route.fullPath" class="route-frame" :initial="{ opacity: 0, y: 8 }" :animate="{ opacity: 1, y: 0 }" :exit="{ opacity: 0 }" :transition="{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }">
            <RouterView v-slot="{ Component }"><Suspense><div class="route-view"><component :is="Component" /></div><template #fallback><LoadingSkeleton class="route-loading" :lines="4" label="正在打开页面" /></template></Suspense></RouterView>
          </motion.div>
        </AnimatePresence>
      </main>
      <footer v-if="!isAdminRoute" class="site-footer"><span>HELUO CIVILIZATION</span><span>{{ t.footer }}</span><i aria-hidden="true"></i></footer>
      <nav v-if="showMobileTabs" class="mobile-tab-bar" aria-label="移动端主导航">
        <RouterLink to="/" exact-active-class="is-active"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 10 8-6 8 6v9H4zM9 19v-5h6v5" /></svg><span>首页</span></RouterLink>
        <RouterLink to="/explore"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg><span>馆藏</span></RouterLink>
        <RouterLink to="/exhibits"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4zM8 9h8M8 13h5" /></svg><span>展厅</span></RouterLink>
        <RouterLink to="/appointment"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></svg><span>预约</span></RouterLink>
        <RouterLink to="/shop"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1 12H6zM8 9V7a4 4 0 0 1 8 0v2" /></svg><span>文创</span></RouterLink>
      </nav>
    </div>
  </MotionConfig>
</template>
