<script setup lang="ts">
import { computed, nextTick, onMounted, watch, watchEffect } from 'vue'
import { AnimatePresence, MotionConfig, motion } from 'motion-v'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { useAuthStore } from './stores/auth'
import { useLocale } from './stores/locale'
import LoadingSkeleton from './components/LoadingSkeleton.vue'
import MuseumBrandSeal from './components/MuseumBrandSeal.vue'
import PointerCursor from './components/PointerCursor.vue'

const auth = useAuthStore()
const { locale, t, toggle } = useLocale()
const route = useRoute()
const shellCopy = computed(() => locale.value === 'zh-CN' ? {
  museum: '河洛数字博物馆', skip: '跳到主要内容', nav: '主导航', loading: '正在打开页面', mobileNav: '移动端主导航',
  mobile: ['首页', '馆藏', '展厅', '预约', '文创'],
} : {
  museum: 'Heluo Digital Museum', skip: 'Skip to main content', nav: 'Primary navigation', loading: 'Opening page', mobileNav: 'Mobile navigation',
  mobile: ['Home', 'Collection', 'Gallery', 'Booking', 'Store'],
})
const pageTitles: Record<string, [string, string]> = {
  home: ['首页', 'Home'], explore: ['探索馆藏', 'Explore Collection'], 'artifact-detail': ['文物故事', 'Artifact Story'], 'article-detail': ['文化专题', 'Cultural Feature'],
  exhibits: ['数字展厅', '3D Gallery'], 'exhibit-detail': ['3D 数字展项', '3D Exhibit'], appointment: ['预约参观', 'Visit Booking'], shop: ['河洛文创', 'Museum Store'],
  login: ['账户登录', 'Sign In'], 'reset-password': ['重置密码', 'Reset Password'], profile: ['个人中心', 'Profile'],
}
const accountLabel = computed(() => locale.value === 'en-US' && auth.user?.nickname === '博物馆管理员' ? 'Museum Administrator' : auth.user?.nickname)
const isAdminRoute = computed(() => route.path.startsWith('/admin'))
const showMobileTabs = computed(() => !isAdminRoute.value && !route.path.startsWith('/login') && !route.path.startsWith('/reset-password'))
onMounted(auth.initialize)
watch(() => route.fullPath, async (_, previousPath) => {
  if (!previousPath) return
  await nextTick()
  document.querySelector<HTMLElement>('#main-content')?.focus({ preventScroll: true })
})
watchEffect(() => {
  const routeName = String(route.name ?? '')
  const localizedTitle = pageTitles[routeName]?.[locale.value === 'zh-CN' ? 0 : 1] ?? (typeof route.meta.title === 'string' ? route.meta.title : '')
  document.title = localizedTitle ? `${localizedTitle} | ${shellCopy.value.museum}` : shellCopy.value.museum
  document.documentElement.lang = locale.value
})
</script>

<template>
  <MotionConfig reduced-motion="user">
    <div class="app-shell">
      <PointerCursor :disabled="isAdminRoute" />
      <a class="skip-link" href="#main-content">{{ shellCopy.skip }}</a>
      <header v-if="!isAdminRoute" class="site-header" data-glass="light">
        <RouterLink class="brand" to="/">
        <MuseumBrandSeal class="brand-seal" />
        <span class="brand-copy"><b>{{ shellCopy.museum }}</b><small>HELUO DIGITAL MUSEUM</small></span>
        </RouterLink>
        <nav :aria-label="shellCopy.nav">
          <RouterLink to="/explore">{{ t.explore }}</RouterLink>
          <RouterLink to="/exhibits">{{ t.exhibits }}</RouterLink>
          <RouterLink to="/appointment">{{ t.appointment }}</RouterLink>
          <RouterLink to="/shop">{{ t.shop }}</RouterLink>
          <RouterLink v-if="auth.isAdmin" to="/admin">{{ t.admin }}</RouterLink>
        </nav>
        <div class="site-utilities">
          <button class="locale-toggle" data-glass="compact" data-glass-interactive type="button" @click="toggle">{{ t.language }}</button>
          <RouterLink v-if="auth.loggedIn" class="login-link" data-glass="compact" data-glass-interactive to="/profile">{{ accountLabel }}</RouterLink>
          <RouterLink v-else class="login-link" data-glass="compact" data-glass-interactive to="/login">{{ t.login }}</RouterLink>
        </div>
      </header>
      <main id="main-content" class="site-main" :class="{ 'site-main--admin': isAdminRoute }" tabindex="-1">
        <AnimatePresence mode="sync" :initial="false">
          <motion.div v-if="route.fullPath" :key="route.fullPath" class="route-frame" :initial="{ opacity: 0, y: 8 }" :animate="{ opacity: 1, y: 0 }" :exit="{ opacity: 0 }" :transition="{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }">
            <RouterView v-slot="{ Component }"><Suspense><div class="route-view"><component :is="Component" /></div><template #fallback><LoadingSkeleton class="route-loading" :lines="4" :label="shellCopy.loading" /></template></Suspense></RouterView>
          </motion.div>
        </AnimatePresence>
      </main>
      <footer v-if="!isAdminRoute" class="site-footer"><span>HELUO CIVILIZATION</span><span>{{ t.footer }}</span><i aria-hidden="true"></i></footer>
      <nav v-if="showMobileTabs" class="mobile-tab-bar" data-glass="light" :aria-label="shellCopy.mobileNav">
        <RouterLink to="/" exact-active-class="is-active"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 10 8-6 8 6v9H4zM9 19v-5h6v5" /></svg><span>{{ shellCopy.mobile[0] }}</span></RouterLink>
        <RouterLink to="/explore"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg><span>{{ shellCopy.mobile[1] }}</span></RouterLink>
        <RouterLink to="/exhibits"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4zM8 9h8M8 13h5" /></svg><span>{{ shellCopy.mobile[2] }}</span></RouterLink>
        <RouterLink to="/appointment"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></svg><span>{{ shellCopy.mobile[3] }}</span></RouterLink>
        <RouterLink to="/shop"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1 12H6zM8 9V7a4 4 0 0 1 8 0v2" /></svg><span>{{ shellCopy.mobile[4] }}</span></RouterLink>
      </nav>
    </div>
  </MotionConfig>
</template>
