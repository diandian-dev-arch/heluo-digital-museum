<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowLeft, ArrowRight, RefreshLeft } from '@element-plus/icons-vue'
import { apiGet, apiRequest, type ContentPage } from '../lib/api'
import InlineStatus from './InlineStatus.vue'
import StatusBadge from './StatusBadge.vue'
import { useLocale } from '../stores/locale'

interface Appointment {
  id: number
  appointmentNo: string
  status: string
  visitorCount: number
  contactName: string
  visitDate: string
  startTime: string
  endTime: string
  cancelReason: string
}

const props = defineProps<{ token: string }>()
const { locale } = useLocale()
const loading = ref(true)
const error = ref('')
const items = ref<Appointment[]>([])
const cancellingId = ref<number | null>(null)
const confirmId = ref<number | null>(null)
const page = ref(1)
const total = ref(0)
const totalPages = ref(1)
let requestVersion = 0
let controller: AbortController | undefined

async function load(targetPage = page.value) {
  const version = ++requestVersion
  controller?.abort()
  controller = new AbortController()
  loading.value = true
  error.value = ''
  try {
    const result = await apiGet<ContentPage<Appointment>>(`/appointments/me?page=${targetPage}&size=20`, props.token, { signal: controller.signal })
    if (version !== requestVersion) return
    items.value = result.items
    page.value = result.page
    total.value = result.total
    totalPages.value = Math.max(1, result.totalPages)
    confirmId.value = null
  } catch (reason) {
    if (version === requestVersion) error.value = reason instanceof Error ? reason.message : '预约记录加载失败。'
  } finally {
    if (version === requestVersion) loading.value = false
  }
}

async function cancel(item: Appointment) {
  if (cancellingId.value !== null) return
  if (confirmId.value !== item.id) {
    confirmId.value = item.id
    return
  }
  cancellingId.value = item.id
  error.value = ''
  try {
    await apiRequest(`/appointments/${item.id}/cancel`, 'POST', { reason: '用户在个人中心取消' }, props.token)
    confirmId.value = null
    await load()
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '预约取消失败。'
  } finally {
    cancellingId.value = null
  }
}

function canCancel(item: Appointment) {
  return new Date(`${item.visitDate}T${item.startTime}+08:00`).getTime() - Date.now() > 2 * 60 * 60 * 1000
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`)
  return new Intl.DateTimeFormat(locale.value === 'en-US' ? 'en-US' : 'zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(date)
}

function formatMonth(value: string) {
  return new Intl.DateTimeFormat(locale.value === 'en-US' ? 'en-US' : 'zh-CN', { month: 'short' }).format(new Date(`${value}T00:00:00`))
}

onMounted(load)
onBeforeUnmount(() => { requestVersion++; controller?.abort() })
</script>

<template>
  <section class="profile-record-section" data-glass="dark" aria-labelledby="profile-appointments-title">
    <header class="profile-record-heading"><div><p class="section-label">{{ locale === 'en-US' ? 'VISIT ARCHIVE' : 'VISIT ARCHIVE / 参观档案' }}</p><h2 id="profile-appointments-title">{{ locale === 'en-US' ? 'Visit bookings' : '预约记录' }}</h2><p>{{ locale === 'en-US' ? `${total} bookings` : `共 ${total} 条预约` }}</p></div><button class="profile-record-retry" type="button" :disabled="loading || cancellingId !== null" @click="load()" :aria-label="locale === 'en-US' ? 'Refresh visit bookings' : '刷新预约记录'"><RefreshLeft :size="15" aria-hidden="true" />{{ locale === 'en-US' ? 'Refresh' : '刷新' }}</button></header>
    <div v-if="loading" class="state-panel">{{ locale === 'en-US' ? 'Loading visit bookings…' : '正在加载预约记录…' }}</div>
    <div v-else-if="error" class="state-panel state-panel--action"><InlineStatus kind="error" :message="error" /><button type="button" @click="load()">{{ locale === 'en-US' ? 'Reload' : '重新加载' }}</button></div>
    <div v-else-if="!items.length" class="state-panel">{{ locale === 'en-US' ? 'No visit bookings yet. ' : '还没有预约记录。' }}<RouterLink class="profile-record-link" to="/appointment">{{ locale === 'en-US' ? 'Book a visit →' : '去预约参观 →' }}</RouterLink></div>
    <div v-else class="profile-record-list">
      <article v-for="item in items" :key="item.id" class="profile-record-card profile-record-card--appointment" data-glass="compact">
        <div class="profile-record-card__date"><strong>{{ item.visitDate.slice(8, 10) }}</strong><span>{{ formatMonth(item.visitDate) }}</span></div>
        <div class="profile-record-card__body"><span class="profile-record-kicker">{{ item.appointmentNo }}</span><h3>{{ formatDate(item.visitDate) }}</h3><p class="profile-record-time">{{ item.startTime.slice(0, 5) }}–{{ item.endTime.slice(0, 5) }} <i aria-hidden="true">·</i> {{ item.contactName }} · {{ item.visitorCount }} {{ locale === 'en-US' ? 'people' : '人' }}</p></div>
        <div class="profile-record-actions"><StatusBadge :status="item.status" /><template v-if="(item.status === 'PENDING' || item.status === 'CONFIRMED') && canCancel(item)"><button v-if="confirmId !== item.id" type="button" @click="cancel(item)">{{ locale === 'en-US' ? 'Cancel booking' : '取消预约' }}</button><button v-else type="button" :disabled="cancellingId === item.id" @click="cancel(item)">{{ cancellingId === item.id ? (locale === 'en-US' ? 'Working…' : '处理中…') : (locale === 'en-US' ? 'Click again to confirm' : '再次点击确认') }}</button></template></div>
      </article>
    </div>
    <nav v-if="totalPages > 1" class="collection-pagination profile-record-pagination" :aria-label="locale === 'en-US' ? 'Visit booking pages' : '预约记录分页'">
      <button type="button" :disabled="page <= 1 || loading || cancellingId !== null" :aria-label="locale === 'en-US' ? 'Previous booking page' : '上一页预约记录'" :title="locale === 'en-US' ? 'Previous page' : '上一页'" @click="load(page - 1)"><ArrowLeft aria-hidden="true" /></button>
      <span aria-current="page">{{ page }} / {{ totalPages }}</span>
      <button type="button" :disabled="page >= totalPages || loading || cancellingId !== null" :aria-label="locale === 'en-US' ? 'Next booking page' : '下一页预约记录'" :title="locale === 'en-US' ? 'Next page' : '下一页'" @click="load(page + 1)"><ArrowRight aria-hidden="true" /></button>
    </nav>
  </section>
</template>
