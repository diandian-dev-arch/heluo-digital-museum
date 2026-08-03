<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ status: string }>()
const labelMap: Record<string, string> = {
  ACTIVE: '启用', DISABLED: '禁用', OPEN: '开放', CLOSED: '关闭', CANCELLED: '已取消',
  PENDING: '待处理', CONFIRMED: '已确认', COMPLETED: '已完成', PAID: '已支付',
  DRAFT: '草稿', PUBLISHED: '已发布', WITHDRAWN: '已撤回', EXPIRED: '已过期',
}
const tone = computed(() => {
  if (['ACTIVE', 'OPEN', 'PUBLISHED', 'PAID', 'COMPLETED', 'CONFIRMED'].includes(props.status)) return 'positive'
  if (['DISABLED', 'CANCELLED', 'EXPIRED'].includes(props.status)) return 'negative'
  if (['PENDING', 'DRAFT'].includes(props.status)) return 'warning'
  return 'neutral'
})
</script>

<template><span class="status-badge" :class="`status-badge--${tone}`"><i aria-hidden="true"></i>{{ labelMap[status] || status }}</span></template>
