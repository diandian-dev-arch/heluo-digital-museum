<script setup lang="ts">
import { computed, nextTick, onMounted, watch, watchEffect } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { setUnauthorizedHandler } from './lib/api'
import { User } from '@element-plus/icons-vue'
import { useAuthStore } from './stores/auth'
import { useLocale } from './stores/locale'
import { useTheme } from './stores/theme'
import LoadingSkeleton from './components/LoadingSkeleton.vue'
import MuseumBrandSeal from './components/MuseumBrandSeal.vue'
import PointerCursor from './components/PointerCursor.vue'

const auth = useAuthStore()
const { locale, t, toggle } = useLocale()
const { isDark, toggle: toggleTheme } = useTheme()
const route = useRoute()
const router = useRouter()
setUnauthorizedHandler((token) => {
  if (token !== auth.token) return
  auth.expireSession(token)
  // The public landing page remains accessible when a saved session expires.
  if (route.path !== '/' && route.name !== 'login' && route.name !== 'reset-password') {
    void router.push({ name: 'login', query: { returnTo: route.fullPath, reason: 'expired' } })
  }
})
const shellCopy = computed(() => locale.value === 'zh-CN' ? {
  museum: '河洛数字博物馆', brandSubtitle: 'HELUO DIGITAL MUSEUM', skip: '跳到主要内容', nav: '主导航', loading: '正在打开页面', mobileNav: '移动端主导航',
  mobile: ['首页', '馆藏', '展厅', '预约', '文创'],
} : {
  museum: 'Heluo Digital Museum', brandSubtitle: '河洛数字博物馆', skip: 'Skip to main content', nav: 'Primary navigation', loading: 'Opening page', mobileNav: 'Mobile navigation',
  mobile: ['Home', 'Collection', 'Gallery', 'Booking', 'Store'],
})
const pageTitles: Record<string, [string, string]> = {
  home: ['首页', 'Home'], explore: ['探索馆藏', 'Explore Collection'], 'artifact-detail': ['文物故事', 'Artifact Story'], 'article-detail': ['文化专题', 'Cultural Feature'],
  exhibits: ['数字展厅', '3D Gallery'], 'exhibit-detail': ['3D 数字展项', '3D Exhibit'], appointment: ['预约参观', 'Visit Booking'], shop: ['河洛文创', 'Museum Store'],
  login: ['账户登录', 'Sign In'], 'reset-password': ['重置密码', 'Reset Password'], profile: ['个人中心', 'Profile'],
  'not-found': ['页面不存在', 'Page not found'],
}
const accountLabel = computed(() => locale.value === 'en-US' && auth.user?.nickname === '博物馆管理员' ? 'Museum Administrator' : auth.user?.nickname)
const mobileAccountLabel = computed(() => locale.value === 'zh-CN' ? (auth.loggedIn ? '我的' : '登录') : (auth.loggedIn ? 'Account' : 'Sign in'))
const isAdminRoute = computed(() => route.path.startsWith('/admin'))
const showMobileTabs = computed(() => !isAdminRoute.value && !route.path.startsWith('/login') && !route.path.startsWith('/reset-password'))
const shellRouteClass = computed(() => `app-shell--${String(route.name ?? 'unknown')}`)
const showSiteFooter = computed(() => !isAdminRoute.value && route.name !== 'appointment' && route.name !== 'shop')
onMounted(auth.initialize)
watch(() => route.path, async (_, previousPath) => {
  if (!previousPath) return
  await nextTick()
  document.querySelector<HTMLElement>('#main-content')?.focus({ preventScroll: true })
})
watchEffect(() => {
  const routeName = String(route.name ?? '')
  const localizedTitle = pageTitles[routeName]?.[locale.value === 'zh-CN' ? 0 : 1] ?? (typeof route.meta.title === 'string' ? route.meta.title : '')
  document.title = localizedTitle ? `${localizedTitle} | ${shellCopy.value.museum}` : shellCopy.value.museum
  document.querySelector('meta[name="description"]')?.setAttribute('content', locale.value === 'en-US'
    ? 'Explore Heluo collection stories, digital 3D exhibits and visit bookings.'
    : '河洛数字博物馆：在线探索馆藏故事、3D 数字展项并预约线下参观。')
  document.documentElement.lang = locale.value
})
</script>

<template>
  <div class="app-shell" :class="shellRouteClass">
      <PointerCursor :disabled="isAdminRoute || ['shop', 'profile', 'login', 'reset-password'].includes(String(route.name))" />
      <a class="skip-link" href="#main-content">{{ shellCopy.skip }}</a>
      <header v-if="!isAdminRoute" class="site-header" data-glass="light">
        <RouterLink class="brand" to="/">
        <MuseumBrandSeal class="brand-seal" />
        <span class="brand-copy"><b>{{ shellCopy.museum }}</b><small>{{ shellCopy.brandSubtitle }}</small></span>
        </RouterLink>
        <nav :aria-label="shellCopy.nav">
          <RouterLink to="/explore">{{ t.explore }}</RouterLink>
          <RouterLink to="/exhibits">{{ t.exhibits }}</RouterLink>
          <RouterLink to="/appointment">{{ t.appointment }}</RouterLink>
          <RouterLink to="/shop">{{ t.shop }}</RouterLink>
          <RouterLink v-if="auth.isAdmin" to="/admin">{{ t.admin }}</RouterLink>
        </nav>
        <div class="site-utilities">
          <button class="theme-toggle" data-glass="compact" data-glass-interactive type="button" :aria-label="isDark ? (locale === 'zh-CN' ? '切换到浅色模式' : 'Switch to light mode') : (locale === 'zh-CN' ? '切换到深色模式' : 'Switch to dark mode')" :aria-pressed="isDark" @click="toggleTheme">
            <svg v-if="isDark" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" /></svg>
            <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" /></svg>
            <span>{{ isDark ? (locale === 'zh-CN' ? '浅色' : 'Light') : (locale === 'zh-CN' ? '深色' : 'Dark') }}</span>
          </button>
          <button class="locale-toggle" data-glass="compact" data-glass-interactive type="button" @click="toggle">{{ t.language }}</button>
          <RouterLink v-if="auth.loggedIn" class="login-link" data-glass="compact" data-glass-interactive to="/profile" :aria-label="accountLabel || mobileAccountLabel">
            <User class="account-icon" aria-hidden="true" /><span class="account-label--desktop">{{ accountLabel || mobileAccountLabel }}</span><span class="account-label--mobile">{{ mobileAccountLabel }}</span>
          </RouterLink>
          <RouterLink v-else class="login-link" data-glass="compact" data-glass-interactive to="/login" :aria-label="t.login">
            <User class="account-icon" aria-hidden="true" /><span class="account-label--desktop">{{ t.login }}</span><span class="account-label--mobile">{{ mobileAccountLabel }}</span>
          </RouterLink>
        </div>
      </header>
      <main id="main-content" class="site-main" :class="{ 'site-main--admin': isAdminRoute }" tabindex="-1">
        <div class="route-frame">
          <RouterView v-slot="{ Component }"><Suspense><div class="route-view"><component :is="Component" :key="route.path" /></div><template #fallback><LoadingSkeleton class="route-loading" :lines="4" :label="shellCopy.loading" /></template></Suspense></RouterView>
        </div>
      </main>
      <footer v-if="showSiteFooter" class="site-footer"><span>HELUO CIVILIZATION</span><span>{{ t.footer }}</span><i aria-hidden="true"></i></footer>
      <nav v-if="showMobileTabs" class="mobile-tab-bar" data-glass="light" :aria-label="shellCopy.mobileNav">
        <RouterLink to="/" exact-active-class="is-active"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 10 8-6 8 6v9H4zM9 19v-5h6v5" /></svg><span>{{ shellCopy.mobile[0] }}</span></RouterLink>
        <RouterLink to="/explore"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg><span>{{ shellCopy.mobile[1] }}</span></RouterLink>
        <RouterLink to="/exhibits"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4zM8 9h8M8 13h5" /></svg><span>{{ shellCopy.mobile[2] }}</span></RouterLink>
        <RouterLink to="/appointment"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></svg><span>{{ shellCopy.mobile[3] }}</span></RouterLink>
        <RouterLink to="/shop"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1 12H6zM8 9V7a4 4 0 0 1 8 0v2" /></svg><span>{{ shellCopy.mobile[4] }}</span></RouterLink>
      </nav>
  </div>
</template>
