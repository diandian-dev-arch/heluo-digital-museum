<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { motion } from 'motion-v'
import { ShoppingBag } from '@element-plus/icons-vue'
import { apiGet, apiRequest } from '../lib/api'
import { resolveProductPresentation } from '../lib/productPresentation'
import { useAuthStore } from '../stores/auth'
import { useLocale } from '../stores/locale'
import BottomSheet from '../components/BottomSheet.vue'
import CartPanelContent from '../components/CartPanelContent.vue'
import FluidButton from '../components/FluidButton.vue'
import InlineStatus from '../components/InlineStatus.vue'

interface Product { id:number; slug:string; name:string; summary:string; price:string; availableStock:number; coverImageUrl:string }
interface CartItem { id:number; productId:number; quantity:number; name:string; slug?:string; price:string; availableStock:number; coverImageUrl:string }
interface Order { id:number; orderNo:string; payableAmount:number }
interface PendingCheckout {
  userId: number
  cartItemIds: number[]
  notificationEmail: string
  checkoutKey: string
  paymentKey: string
  order?: Order
}

const auth = useAuthStore()
const router = useRouter()
const products = ref<Product[]>([])
type ProductCategory = 'all' | 'objects' | 'textiles' | 'paper'
const activeCategory = ref<ProductCategory>('all')
const productCategory = (product: Product): ProductCategory => product.slug === 'heluo-silk-scarf' ? 'textiles' : product.slug === 'river-map-notebook' ? 'paper' : 'objects'
const visibleProducts = computed(() => activeCategory.value === 'all' ? products.value : products.value.filter(product => productCategory(product) === activeCategory.value))
const cart = ref<CartItem[]>([])
const loading = ref(true)
const message = ref('')
const error = ref('')
const email = ref('')
const mobileCartOpen = ref(false)
const mobileCartSnapPoint = ref<'medium' | 'full'>('medium')
const checkoutState = ref<'idle' | 'loading' | 'success' | 'error'>('idle')
const addingProductId = ref<number | null>(null)
const pendingCheckout = ref<PendingCheckout | null>(null)
const total = computed(() => cart.value.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0).toFixed(2))
const itemCount = computed(() => cart.value.reduce((sum, item) => sum + item.quantity, 0))
const pendingOrder = computed(() => pendingCheckout.value?.order ?? null)
const hasPendingCheckout = computed(() => pendingCheckout.value !== null)
const { t, locale } = useLocale()
const shopTitle = computed(() => locale.value === 'zh-CN' ? '器物的纹样，\n进入每天的生活。' : 'Bring the patterns of objects into everyday life.')
const shopCopy = computed(() => locale.value === 'en-US' ? {
  categories: 'Product categories', all: 'All objects', category: 'Objects for daily life', apparel: 'Wearable textiles', paper: 'River-map stationery', unavailable: 'No products in this category yet', adding: 'Adding', pending: 'Finish pending order', openCart: 'Open cart', bag: 'Shopping bag', selection: 'YOUR SELECTION', unit: 'items'
} : {
  categories: '商品分类', all: '全部文创', category: '器物日用', apparel: '穿戴织物', paper: '纸上河图', unavailable: '当前版本暂无该分类商品', adding: '正在加入', pending: '待支付订单未完成', openCart: '打开购物车', bag: '购物袋', selection: 'YOUR SELECTION', unit: '件'
})
const productImageNotes = computed<Record<string, string>>(() => locale.value === 'en-US' ? {
  'river-line-teacup-set': 'Follow the river into a quieter tea ritual.',
  'heluo-silk-scarf': 'Flowing rivers translated into deep-jade textiles.',
  'river-map-notebook': 'Bring Heluo patterns into everyday notes and ideas.',
} : {
  'river-line-teacup-set': '以河流为线，盛装日常茶事，也盛放山水之思。',
  'heluo-silk-scarf': '以河流的流线和深墨绿为灵感的原创概念丝巾。',
  'river-map-notebook': '把河洛图纹带进每天的记录与灵感。',
})
const productEnglish: Record<string, { name: string; summary: string }> = {
  'river-line-teacup-set': { name: 'River-pattern Teacup Set', summary: 'Keep a sense of the river in the everyday ritual of tea.' },
  'heluo-silk-scarf': { name: 'Heluo River-system Scarf', summary: 'An original concept scarf inspired by flowing rivers and deep jade green.' },
  'river-map-notebook': { name: 'River-map Pattern Notebook', summary: 'Bring Heluo patterns into everyday notes and ideas.' },
}
const displayProduct = (product: Product) => {
  const normalized = resolveProductPresentation(product)
  return locale.value === 'en-US' && productEnglish[product.slug] ? { ...normalized, ...productEnglish[product.slug] } : normalized
}
const stockUnit = (stock: number) => locale.value === 'en-US' && stock === 1 ? 'item' : t.value.shopText.items

async function loadProducts() { try { products.value = await apiGet<Product[]>('/products') } catch (reason) { error.value = reason instanceof Error ? reason.message : '商品加载失败。' } finally { loading.value = false } }
async function loadCart() {
  if (!auth.loggedIn) return
  try {
    cart.value = await apiGet<CartItem[]>('/cart', auth.token)
    email.value ||= auth.user?.email ?? ''
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '购物袋加载失败，请稍后重试。'
  }
}

function pendingCheckoutStorageKey(userId: number) { return `heluo.pending-checkout.${userId}` }
function restorePendingCheckout() {
  const userId = auth.user?.id
  if (!userId) return
  try {
    const saved = JSON.parse(localStorage.getItem(pendingCheckoutStorageKey(userId)) ?? 'null') as PendingCheckout | null
    if (saved?.userId === userId && saved.cartItemIds.length && saved.checkoutKey && saved.paymentKey) pendingCheckout.value = saved
  } catch {
    localStorage.removeItem(pendingCheckoutStorageKey(userId))
  }
}
function persistPendingCheckout(attempt: PendingCheckout) {
  pendingCheckout.value = attempt
  localStorage.setItem(pendingCheckoutStorageKey(attempt.userId), JSON.stringify(attempt))
}
function clearPendingCheckout() {
  const userId = auth.user?.id
  if (userId) localStorage.removeItem(pendingCheckoutStorageKey(userId))
  pendingCheckout.value = null
}
async function add(product: Product) {
  await auth.initialize()
  if (!auth.loggedIn) { await router.push('/login'); return }
  if (pendingCheckout.value) {
    error.value = locale.value === 'en-US' ? 'Finish the pending order before adding another product.' : '请先完成当前待支付订单，再继续添加商品。'
    return
  }
  if (addingProductId.value !== null) return
  addingProductId.value = product.id
  try {
    cart.value = await apiRequest<CartItem[]>('/cart/items', 'POST', { productId: product.id, quantity: 1 }, auth.token)
    message.value = locale.value === 'en-US' ? `${displayProduct(product).name} was added to your bag.` : `已将“${product.name}”加入购物袋。`
    error.value = ''
    checkoutState.value = 'idle'
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '加入购物车失败。'
  } finally {
    addingProductId.value = null
  }
}
async function change(item: CartItem, quantity: number) {
  try {
    cart.value = await apiRequest<CartItem[]>(`/cart/items/${item.id}`, 'PATCH', { quantity }, auth.token)
    message.value = ''
    error.value = ''
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '数量更新失败。' }
}
async function remove(item: CartItem) {
  try {
    cart.value = await apiRequest<CartItem[]>(`/cart/items/${item.id}`, 'DELETE', undefined, auth.token)
    message.value = locale.value === 'en-US' ? 'The item was removed.' : `已移除“${item.name}”。`
    error.value = ''
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '移除商品失败。' }
}
async function checkout() {
  if (!auth.user || checkoutState.value === 'loading') return
  let attempt = pendingCheckout.value
  if (!attempt) {
    if (!cart.value.length) return
    attempt = {
      userId: auth.user.id,
      cartItemIds: cart.value.map((item) => item.id),
      notificationEmail: email.value,
      checkoutKey: crypto.randomUUID(),
      paymentKey: crypto.randomUUID(),
    }
    persistPendingCheckout(attempt)
  }
  checkoutState.value = 'loading'; error.value = ''
  try {
    const order = attempt.order ?? await apiRequest<Order>('/orders', 'POST', {
      cartItemIds: attempt.cartItemIds,
      notificationEmail: attempt.notificationEmail,
    }, auth.token, { 'Idempotency-Key': attempt.checkoutKey })
    attempt = { ...attempt, order }
    persistPendingCheckout(attempt)
    cart.value = []
    await apiRequest(`/orders/${order.id}/mock-payment`, 'POST', undefined, auth.token, { 'Idempotency-Key': attempt.paymentKey })
    clearPendingCheckout()
    message.value = locale.value === 'en-US' ? `Mock payment completed. Order: ${order.orderNo}` : `模拟支付成功，订单号：${order.orderNo}`; checkoutState.value = 'success'; mobileCartSnapPoint.value = 'medium'
  } catch (reason) {
    const nonRetryable = reason instanceof Error && 'status' in reason
      && typeof (reason as { status?: unknown }).status === 'number'
      && (reason as { status: number }).status >= 400 && (reason as { status: number }).status < 500
      && (reason as { status: number }).status !== 408 && (reason as { status: number }).status !== 429
    if (nonRetryable) clearPendingCheckout()
    else if (attempt?.order) {
      cart.value = []
      message.value = locale.value === 'en-US' ? `Order ${attempt.order.orderNo} is still awaiting payment. You can retry.` : `订单号：${attempt.order.orderNo} 尚未完成支付，可继续重试。`
    }
    error.value = reason instanceof Error ? reason.message : '下单或支付失败。'; checkoutState.value = 'error'
  }
}
onMounted(async () => {
  await auth.initialize()
  restorePendingCheckout()
  await Promise.all([loadProducts(), loadCart()])
})
</script>

<template>
  <main class="shop-page">
    <section class="shop-content">
      <div
        v-pointer-surface="{ kind: 'product', maxTilt: 0, lift: 0 }"
        class="shop-object-studio-surface"
        aria-hidden="true"
      ></div>
      <header class="shop-intro" data-glass="light">
        <p class="eyebrow">HELUO CULTURAL STORE</p>
        <h1>{{ shopTitle }}</h1>
        <div class="shop-category-nav" data-glass="compact" role="group" :aria-label="shopCopy.categories"><button type="button" :class="{ active: activeCategory === 'all' }" :aria-pressed="activeCategory === 'all'" @click="activeCategory = 'all'">{{ shopCopy.all }}</button><button type="button" :class="{ active: activeCategory === 'objects' }" :aria-pressed="activeCategory === 'objects'" @click="activeCategory = 'objects'">{{ shopCopy.category }}</button><button type="button" :class="{ active: activeCategory === 'textiles' }" :aria-pressed="activeCategory === 'textiles'" @click="activeCategory = 'textiles'">{{ shopCopy.apparel }}</button><button type="button" :class="{ active: activeCategory === 'paper' }" :aria-pressed="activeCategory === 'paper'" @click="activeCategory = 'paper'">{{ shopCopy.paper }}</button></div>
        <p>{{ t.shopText.intro }}</p>
      </header>

      <svg class="shop-river" viewBox="0 0 1320 150" preserveAspectRatio="none" aria-hidden="true"><path d="M0 77c112 1 160 1 251 2 84 1 97 48 181 32 86-17 143 8 215-17 90-31 116-86 209-43 90 42 123-33 221-8 98 25 132-3 243-25"/><path d="M0 80c112 1 160 1 251 2 84 1 98 43 181 29 86-14 143 6 215-18 89-29 117-78 209-39 90 39 124-31 221-7 99 23 132-3 243-25"/><circle cx="1269" cy="29" r="7"/><circle cx="1269" cy="29" r="13"/></svg>

      <InlineStatus v-if="message" kind="success" :message="message" />
      <InlineStatus v-if="error" kind="error" :message="error" />
      <div v-if="loading" class="state-panel">{{ t.shopText.loading }}</div>
      <div v-else id="shop-products" class="product-grid">
        <motion.article v-for="(product,index) in visibleProducts" :key="product.id" :class="{ featured: index === 0 }" :initial="{ opacity: 0, y: 10 }" :animate="{ opacity: 1, y: 0 }" :transition="{ duration: 0.28, delay: index * 0.04 }">
          <div v-pointer-surface="{ kind: 'product', maxTilt: 0.8 }" class="product-image"><img :src="displayProduct(product).coverImageUrl" :alt="displayProduct(product).name" loading="lazy" decoding="async" /><p>{{ productImageNotes[product.slug] }}</p></div>
        <div class="product-copy" data-glass="light" data-glass-interactive><span class="product-number">0{{ index + 1 }}</span><h2>{{ displayProduct(product).name }}</h2><p>{{ displayProduct(product).summary }}</p><div class="product-meta"><small>{{ t.shopText.remaining }} {{ product.availableStock }} {{ stockUnit(product.availableStock) }}</small><strong>¥ {{ product.price }}</strong></div><FluidButton block :disabled="product.availableStock === 0 || pendingCheckout !== null || (addingProductId !== null && addingProductId !== product.id)" :loading="addingProductId === product.id" @click="add(product)">{{ addingProductId === product.id ? shopCopy.adding : pendingCheckout ? shopCopy.pending : t.shopText.add }}</FluidButton></div>
        </motion.article>
      </div>
    </section>

    <motion.button class="mobile-cart-trigger" type="button" :aria-label="`${shopCopy.openCart}, ${itemCount} ${shopCopy.unit}`" :while-press="{ scale: 0.96 }" :transition="{ type: 'spring', stiffness: 500, damping: 42 }" @click="mobileCartOpen = true">
      <ShoppingBag aria-hidden="true" /><span>{{ shopCopy.bag }}</span><motion.sup :key="itemCount" :initial="{ scale: 0.75 }" :animate="{ scale: 1 }">{{ itemCount }}</motion.sup>
    </motion.button>

    <aside class="cart-panel" data-glass="light" data-glass-controls :aria-label="shopCopy.bag">
      <header class="cart-heading"><span class="cart-heading__icon" aria-hidden="true"><ShoppingBag /></span><div><p>{{ shopCopy.selection }}</p><h2>{{ shopCopy.bag }}</h2></div><motion.span :key="itemCount" class="cart-count" :initial="{ scale: 0.78 }" :animate="{ scale: 1 }">{{ itemCount }} {{ shopCopy.unit }}</motion.span></header>
      <CartPanelContent
        :logged-in="auth.loggedIn"
        :items="cart"
        :item-count="itemCount"
        :total="total"
        :email="email"
        :checkout-state="checkoutState"
        :pending-order="pendingOrder"
        :pending-checkout="hasPendingCheckout"
        :message="message"
        :error="error"
        @update:email="email = $event"
        @change="change"
        @remove="remove"
        @checkout="checkout"
      />
    </aside>

    <BottomSheet :open="mobileCartOpen" :title="`${shopCopy.bag} · ${itemCount} ${shopCopy.unit}`" :snap-point="mobileCartSnapPoint" @close="mobileCartOpen = false" @update:snap-point="mobileCartSnapPoint = $event">
      <CartPanelContent
        :logged-in="auth.loggedIn"
        :items="cart"
        :item-count="itemCount"
        :total="total"
        :email="email"
        :checkout-state="checkoutState"
        :pending-order="pendingOrder"
        :pending-checkout="hasPendingCheckout"
        :message="message"
        :error="error"
        @update:email="email = $event"
        @change="change"
        @remove="remove"
        @checkout="checkout"
      />
    </BottomSheet>
  </main>
</template>
