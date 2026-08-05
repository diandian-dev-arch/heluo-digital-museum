<script setup lang="ts">
import { RouterLink } from 'vue-router'
import MuseumBrandSeal from './MuseumBrandSeal.vue'

defineProps<{ title: string; description: string; section: 'content' | 'operations' }>()
</script>

<template>
  <main class="admin-workspace" :class="`admin-workspace--${section}`">
    <aside class="admin-sidebar" data-glass="dark" aria-label="后台管理导航">
      <RouterLink class="admin-sidebar__brand" to="/">
        <MuseumBrandSeal class="admin-sidebar__seal" />
        <span><b>河洛数字博物馆</b><small>管理工作台</small></span>
      </RouterLink>
      <nav>
        <RouterLink to="/admin" :class="{ active: section === 'content' }">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.5h9.5L19 8v11.5H6zM15 4.5V8h4M9 11h7M9 14.5h7M9 18h4" /></svg>
          <span>内容</span><small>文物与文章</small>
        </RouterLink>
        <RouterLink to="/admin/operations" :class="{ active: section === 'operations' }">
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
        <div class="admin-header-actions"><slot name="header-actions" /></div>
      </header>
      <slot />
    </section>
  </main>
</template>
