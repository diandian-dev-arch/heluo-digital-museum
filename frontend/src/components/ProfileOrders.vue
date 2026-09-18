<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { ArrowLeft, ArrowRight, RefreshLeft } from '@element-plus/icons-vue'
import { apiGet, apiRequest, type ContentPage } from '../lib/api'
import InlineStatus from './InlineStatus.vue'
import FluidButton from './FluidButton.vue'
import StatusBadge from './StatusBadge.vue'
import { useLocale } from '../stores/locale'

interface OrderItem { productId: number; name: string; quantity: number; subtotalAmount: string }
interface Order { id: number; orderNo: string; status: string; payableAmount: string; notificationEmail: string; expiresAt: string; items: OrderItem[] }

const props = defineProps<{ token: string }>()
const { locale } = useLocale()
const loading = ref(true)
const error = ref('')
const message = ref('')
const items = ref<Order[]>([])
const payingId = ref<number | null>(null)
const page = ref(1)
const total = ref(0)
const totalPages = ref(1)
let requestVersion = 0
let controller: AbortController | undefined

function paymentKey(orderId: number) {
  const storageKey = `heluo.payment-key.${orderId}`
  const existing = localStorage.getItem(storageKey)
  if (existing) return existing
  const next = crypto.randomUUID()
  localStorage.setItem(storageKey, next)
  return next
}

async function load(targetPage = page.value) {
  const version = ++requestVersion
  controller?.abort()
  controller = new AbortController()
  loading.value = true
  error.value = ''
  try {
    const result = await apiGet<ContentPage<Order>>(`/orders?page=${targetPage}&size=20`, props.token, { signal: controller.signal })
    if (version !== requestVersion) return
    items.value = result.items
    page.value = result.page
    total.value = result.total
    totalPages.value = Math.max(1, result.totalPages)
  } catch (reason) {
    if (version === requestVersion) error.value = reason instanceof Error ? reason.message : '订单记录加载失败。'
  } finally {
    if (version === requestVersion) loading.value = false
  }
}

async function reconcile(orderId: number) {
  const server = await apiGet<Order>(`/orders/${orderId}`, props.token)
  const index = items.value.findIndex((item) => item.id === orderId)
  if (index >= 0) items.value[index] = server
  return server
}

async function pay(order: Order) {
  if (payingId.value !== null) return
  payingId.value = order.id
  message.value = ''
  error.value = ''
  try {
    const updated = await apiRequest<Order>(`/orders/${order.id}/mock-payment`, 'POST', undefined, props.token, { 'Idempotency-Key': paymentKey(order.id) })
    const index = items.value.findIndex((item) => item.id === order.id)
    if (index >= 0) items.value[index] = updated
    localStorage.removeItem(`heluo.payment-key.${order.id}`)
    message.value = locale.value === 'en-US' ? `Mock payment completed for ${updated.orderNo}.` : `订单 ${updated.orderNo} 已完成模拟支付。`
  } catch (reason) {
    try {
      const server = await reconcile(order.id)
      if (['PAID', 'COMPLETED'].includes(server.status)) {
        localStorage.removeItem(`heluo.payment-key.${order.id}`)
        message.value = locale.value === 'en-US' ? `Payment confirmed for ${server.orderNo}.` : `已确认订单 ${server.orderNo} 支付成功。`
        return
      }
    } catch { /* keep the original recoverable message */ }
    error.value = reason instanceof Error ? reason.message : '支付未完成，请稍后重试。'
  } finally {
    payingId.value = null
  }
}

onMounted(load)
onBeforeUnmount(() => { requestVersion++; controller?.abort() })

function formatDeadline(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale.value === 'en-US' ? 'en-US' : 'zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
}
</script>

<template>
  <section class="profile-record-section" data-glass="dark" aria-labelledby="profile-orders-title">
    <header class="profile-record-heading"><div><p class="section-label">{{ locale === 'en-US' ? 'STORE LEDGER' : 'STORE LEDGER / 文创账簿' }}</p><h2 id="profile-orders-title">{{ locale === 'en-US' ? 'Store orders' : '订单记录' }}</h2><p>{{ locale === 'en-US' ? `${total} orders` : `共 ${total} 条订单` }}</p></div><button class="profile-record-retry" type="button" :disabled="loading || payingId !== null" @click="load()" :aria-label="locale === 'en-US' ? 'Refresh store orders' : '刷新订单记录'"><RefreshLeft :size="15" aria-hidden="true" />{{ locale === 'en-US' ? 'Refresh' : '刷新' }}</button></header>
    <InlineStatus v-if="message" kind="success" :message="message" /><InlineStatus v-if="error" kind="error" :message="error" />
    <div v-if="loading" class="state-panel">{{ locale === 'en-US' ? 'Loading store orders…' : '正在加载订单记录…' }}</div>
    <div v-else-if="!items.length && !error" class="state-panel">{{ locale === 'en-US' ? 'No store orders yet. ' : '还没有订单记录。' }}<RouterLink class="profile-record-link" to="/shop">{{ locale === 'en-US' ? 'Browse the store →' : '去文创商城 →' }}</RouterLink></div>
    <div v-else class="profile-record-list">
      <article v-for="item in items" :key="item.id" class="profile-record-card profile-record-card--order" data-glass="compact">
        <div class="profile-record-card__body"><span class="profile-record-kicker">{{ item.orderNo }}</span><h3><span>{{ locale === 'en-US' ? 'Total' : '订单金额' }}</span>¥ {{ item.payableAmount }}</h3><p class="profile-order-items">{{ item.items.map((line) => `${line.name} × ${line.quantity}`).join(locale === 'en-US' ? ', ' : '、') }}</p><small>{{ item.notificationEmail }}</small></div>
        <div class="profile-record-actions"><StatusBadge :status="item.status" /><template v-if="item.status === 'PENDING_PAYMENT'"><small v-if="item.expiresAt">{{ locale === 'en-US' ? 'Pay by (Shanghai)' : '支付截止（北京时间）' }} <time :datetime="item.expiresAt">{{ formatDeadline(item.expiresAt) }}</time></small><FluidButton size="sm" :disabled="payingId !== null && payingId !== item.id" :loading="payingId === item.id" @click="pay(item)">{{ locale === 'en-US' ? 'Continue payment' : '继续支付' }}</FluidButton></template></div>
      </article>
    </div>
    <nav v-if="totalPages > 1" class="collection-pagination profile-record-pagination" :aria-label="locale === 'en-US' ? 'Order pages' : '订单记录分页'">
      <button type="button" :disabled="page <= 1 || loading || payingId !== null" :aria-label="locale === 'en-US' ? 'Previous order page' : '上一页订单记录'" :title="locale === 'en-US' ? 'Previous page' : '上一页'" @click="load(page - 1)"><ArrowLeft aria-hidden="true" /></button>
      <span aria-current="page">{{ page }} / {{ totalPages }}</span>
      <button type="button" :disabled="page >= totalPages || loading || payingId !== null" :aria-label="locale === 'en-US' ? 'Next order page' : '下一页订单记录'" :title="locale === 'en-US' ? 'Next page' : '下一页'" @click="load(page + 1)"><ArrowRight aria-hidden="true" /></button>
    </nav>
  </section>
</template>
