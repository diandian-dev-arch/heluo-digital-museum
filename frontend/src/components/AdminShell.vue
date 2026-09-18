<script setup lang="ts">
import { RouterLink } from 'vue-router'
import MuseumBrandSeal from './MuseumBrandSeal.vue'
import { useTheme } from '../stores/theme'

defineProps<{ title: string; description: string; section: 'content' | 'operations' }>()
const { isDark, toggle } = useTheme()
</script>

<template>
  <section class="admin-workspace" :class="`admin-workspace--${section}`">
    <aside class="admin-sidebar" :data-glass="isDark ? 'dark' : 'light'" aria-label="后台管理导航">
      <RouterLink class="admin-sidebar__brand" to="/">
        <MuseumBrandSeal class="admin-sidebar__seal" />
        <span><b>河洛数字博物馆</b><small>管理工作台</small></span>
      </RouterLink>
      <nav>
        <RouterLink to="/admin" :class="{ active: section === 'content' }" :data-glass="isDark ? 'dark' : 'light'" data-glass-interactive>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.5h9.5L19 8v11.5H6zM15 4.5V8h4M9 11h7M9 14.5h7M9 18h4" /></svg>
          <span>内容</span><small>文物与文章</small>
        </RouterLink>
        <RouterLink to="/admin/operations" :class="{ active: section === 'operations' }" :data-glass="isDark ? 'dark' : 'light'" data-glass-interactive>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7.5h14v11H5zM8 4.5v3M16 4.5v3M5 11h14M9 14h2M13 14h2M9 17h2" /></svg>
          <span>运营</span><small>用户与交易</small>
        </RouterLink>
      </nav>
      <RouterLink class="admin-sidebar__exit" to="/"><span aria-hidden="true">←</span> 返回博物馆前台</RouterLink>
    </aside>
    <section class="admin-main">
      <div class="admin-context-rail"><span>HELUO MUSEUM · ADMIN</span><i></i><b>{{ section === 'content' ? '内容系统' : '运营系统' }}</b></div>
      <header class="admin-page-header" data-glass="light">
        <div class="admin-title-lockup"><p>{{ section === 'content' ? 'COLLECTION DESK' : 'OPERATIONS DESK' }}</p><h1>{{ title }}</h1><span>{{ description }}</span></div>
        <div class="admin-header-actions">
          <button class="theme-toggle" data-glass="compact" data-glass-interactive type="button" :aria-label="isDark ? '切换到浅色模式' : '切换到深色模式'" :aria-pressed="isDark" @click="toggle">
            <svg v-if="isDark" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" /></svg>
            <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z" /></svg>
            <span>{{ isDark ? '浅色' : '深色' }}</span>
          </button>
          <slot name="header-actions" />
        </div>
      </header>
      <slot />
    </section>
  </section>
</template>
