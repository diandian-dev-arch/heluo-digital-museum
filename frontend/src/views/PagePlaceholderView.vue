<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, RouterLink } from 'vue-router'

const route = useRoute()
const title = computed(() => String(route.meta.title ?? '页面建设中'))
const description = computed(() => String(route.meta.description ?? '该模块将在后续任务中实现。'))
</script>

<template>
  <section class="placeholder-page">
    <p class="eyebrow">PROJECT FOUNDATION</p>
    <h1>{{ title }}</h1>
    <p>{{ description }}</p>
    <el-alert title="当前已完成工程骨架，业务接口与数据迁移将在后续模块中接入。" type="info" :closable="false" />
    <RouterLink to="/">返回首页</RouterLink>
  </section>
</template>
