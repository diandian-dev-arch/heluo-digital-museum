<script lang="ts">
// Keep writes ordered when a pending request outlives a route instance.
let cartQueue = Promise.resolve()
</script>

<script setup lang="ts">
import '../assets/control-surface-polish.css'
import '../assets/public-responsive-polish.css'
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { motion } from 'motion-v'
import { ShoppingBag } from '@element-plus/icons-vue'
import { apiGet, apiRequest } from '../lib/api'
import { resolveProductPresentation } from '../lib/productPresentation'
import { mediaSizes, mediaSrcset } from '../lib/responsiveMedia'
import { useAuthStore } from '../stores/auth'
import { useLocale } from '../stores/locale'
import BottomSheet from '../components/BottomSheet.vue'
import CartPanelContent from '../components/CartPanelContent.vue'
import FluidButton from '../components/FluidButton.vue'
import InlineStatus from '../components/InlineStatus.vue'

interface Product { id:number; slug:string; name:string; summary:string; price:string; availableStock:number; coverImageUrl:string }
interface CartItem { id:number; productId:number; quantity:number; name:string; slug?:string; price:string; availableStock:number; coverImageUrl:string }
interface Order { id:number; orderNo:string; payableAmount:string; status?: string; expiresAt?: string }
interface PendingCheckout {
  userId: number
  cartItemIds: number[]
  notificationEmail: string
  checkoutKey: string
  paymentKey: string
  order?: Order
}

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const products = ref<Product[]>([])
type ProductCategory = 'all' | 'objects' | 'textiles' | 'paper'
const activeCategory = ref<ProductCategory>('all')
const productCategory = (product: Product): ProductCategory => product.slug === 'heluo-silk-scarf' ? 'textiles' : product.slug === 'river-map-notebook' ? 'paper' : 'objects'
const visibleProducts = computed(() => activeCategory.value === 'all' ? products.value : products.value.filter(product => productCategory(product) === activeCategory.value))
const cart = ref<CartItem[]>([])
const loading = ref(true)
const productError = ref('')
const cartError = ref('')
const cartLoading = ref(true)
const actionError = ref('')
const message = ref('')
const email = ref('')
const mobileCartOpen = ref(false)
const mobileCartSnapPoint = ref<'medium' | 'full'>('medium')
const checkoutState = ref<'idle' | 'loading' | 'success' | 'error'>('idle')
const addingProductId = ref<number | null>(null)
const pendingCheckout = ref<PendingCheckout | null>(null)
const pendingAddResumeHandled = ref(false)
const pendingCartActions = ref<number[]>([])
let cartMutationFailed = false
const cartBusy = computed(() => pendingCartActions.value.length > 0 || addingProductId.value !== null)
const total = computed(() => cart.value.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0).toFixed(2))
const itemCount = computed(() => cart.value.reduce((sum, item) => sum + item.quantity, 0))
const pendingOrder = computed(() => pendingCheckout.value?.order ?? null)
const hasPendingCheckout = computed(() => pendingCheckout.value !== null)
const cartPanelError = computed(() => actionError.value || cartError.value)
const { t, locale } = useLocale()
const shopTitle = computed(() => locale.value === 'zh-CN' ? '器物的纹样，\n进入每天的生活。' : 'Bring the patterns of objects into everyday life.')
const shopCopy = computed(() => locale.value === 'en-US' ? {
  categories: 'Product categories', all: 'All objects', category: 'Objects for daily life', apparel: 'Wearable textiles', paper: 'River-map stationery', unavailable: 'No products in this category yet', loadFailed: 'The collection could not be loaded', retryProducts: 'Try again', adding: 'Adding', pending: 'Finish pending order', openCart: 'Open cart', bag: 'Shopping bag', selection: 'YOUR SELECTION', unit: 'items'
} : {
  categories: '商品分类', all: '全部文创', category: '器物日用', apparel: '穿戴织物', paper: '纸上河图', unavailable: '当前版本暂无该分类商品', loadFailed: '文创商品暂时无法加载', retryProducts: '重新加载', adding: '正在加入', pending: '待支付订单未完成', openCart: '打开购物车', bag: '购物袋', selection: 'YOUR SELECTION', unit: '件'
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
function useFallbackProductImage(event: Event, product: Product) {
  const image = event.currentTarget as HTMLImageElement
  const fallback = resolveProductPresentation({ slug: product.slug, name: product.name }).coverImageUrl
  if (fallback && image.src !== new URL(fallback, window.location.href).href) image.src = fallback
}
const stockUnit = (stock: number) => locale.value === 'en-US' && stock === 1 ? 'item' : t.value.shopText.items

let productRequestId = 0

async function loadProducts() {
  const requestId = ++productRequestId
  loading.value = true
  productError.value = ''
  try {
    const result = await apiGet<Product[]>('/products')
    if (requestId === productRequestId) products.value = result
  } catch (reason) {
    if (requestId === productRequestId) productError.value = reason instanceof Error ? reason.message : '商品加载失败。'
  } finally {
    if (requestId === productRequestId) loading.value = false
  }
}
async function retryProducts() { await loadProducts() }
async function closeCartForBrowsing() {
  mobileCartOpen.value = false
  await nextTick()
  document.getElementById('shop-products')?.focus({ preventScroll: true })
}
async function loadCart() {
  if (!auth.loggedIn) { cartLoading.value = false; return }
  cartLoading.value = true
  cartError.value = ''
  const token = auth.token
  try {
    await queueCartMutation(async () => {
      const result = await apiGet<CartItem[]>('/cart', token)
      if (auth.token !== token) return
      cart.value = result
      email.value ||= auth.user?.email ?? ''
    })
  } catch (reason) {
    cartError.value = reason instanceof Error ? reason.message : '购物袋加载失败，请稍后重试。'
  } finally {
    cartLoading.value = false
  }
}

function queueCartMutation(operation: () => Promise<void>) {
  const token = auth.token
  const next = cartQueue.then(async () => {
    if (auth.token !== token) throw new Error(locale.value === 'en-US' ? 'Your account changed. Reload the shopping bag.' : '账户已变更，请重新加载购物袋。')
    await operation()
  })
  cartQueue = next.catch(() => undefined)
  return next
}

function resetActionFeedback() {
  message.value = ''
  actionError.value = ''
}

function checkoutInProgress() { return checkoutState.value === 'loading' }

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
  if (!auth.loggedIn) {
    const returnTo = router.resolve({ name: 'shop', query: { intent: 'add-to-cart', productId: String(product.id) } }).fullPath
    await router.push({ name: 'login', query: { returnTo, intent: 'add-to-cart', productId: String(product.id) } })
    return
  }
  if (pendingCheckout.value || checkoutState.value === 'loading') {
    resetActionFeedback()
    actionError.value = locale.value === 'en-US' ? 'Finish the pending order before adding another product.' : '请先完成当前待支付订单，再继续添加商品。'
    return
  }
  if (addingProductId.value !== null) return
  if (!cartBusy.value) cartMutationFailed = false
  resetActionFeedback()
  addingProductId.value = product.id
  try {
    await queueCartMutation(async () => {
      cart.value = await apiRequest<CartItem[]>('/cart/items', 'POST', { productId: product.id, quantity: 1 }, auth.token)
    })
    cartError.value = ''
    message.value = locale.value === 'en-US' ? `${displayProduct(product).name} was added to your bag.` : `已将“${product.name}”加入购物袋。`
    if (!checkoutInProgress()) checkoutState.value = 'idle'
  } catch (reason) {
    cartMutationFailed = true
    actionError.value = reason instanceof Error ? reason.message : '加入购物车失败。'
  } finally {
    addingProductId.value = null
  }
}
async function resumePendingAdd() {
  if (pendingAddResumeHandled.value || !auth.loggedIn || route?.query?.intent !== 'add-to-cart') return
  const productId = String(route?.query?.productId ?? '')
  if (!/^\d+$/.test(productId)) return
  const product = products.value.find((item) => String(item.id) === productId)
  if (!product) return
  pendingAddResumeHandled.value = true
  await add(product)
  await router.replace({ name: 'shop' })
}
async function change(item: CartItem, quantity: number) {
  if (pendingCheckout.value || checkoutState.value === 'loading' || pendingCartActions.value.includes(item.id)) return
  if (!cartBusy.value) cartMutationFailed = false
  pendingCartActions.value = [...pendingCartActions.value, item.id]
  resetActionFeedback()
  try {
    await queueCartMutation(async () => {
      cart.value = await apiRequest<CartItem[]>(`/cart/items/${item.id}`, 'PATCH', { quantity }, auth.token)
    })
    cartError.value = ''
  } catch (reason) { cartMutationFailed = true; actionError.value = reason instanceof Error ? reason.message : '数量更新失败。' }
  finally { pendingCartActions.value = pendingCartActions.value.filter((id) => id !== item.id) }
}
async function remove(item: CartItem) {
  if (pendingCheckout.value || checkoutState.value === 'loading' || pendingCartActions.value.includes(item.id)) return
  if (!cartBusy.value) cartMutationFailed = false
  pendingCartActions.value = [...pendingCartActions.value, item.id]
  resetActionFeedback()
  try {
    await queueCartMutation(async () => {
      cart.value = await apiRequest<CartItem[]>(`/cart/items/${item.id}`, 'DELETE', undefined, auth.token)
    })
    cartError.value = ''
    message.value = locale.value === 'en-US' ? 'The item was removed.' : `已移除“${item.name}”。`
  } catch (reason) { cartMutationFailed = true; actionError.value = reason instanceof Error ? reason.message : '移除商品失败。' }
  finally { pendingCartActions.value = pendingCartActions.value.filter((id) => id !== item.id) }
}
async function checkout() {
  if (!auth.user || checkoutState.value === 'loading') return
  checkoutState.value = 'loading'
  await cartQueue
  if (!pendingCheckout.value && (cartMutationFailed || cartError.value)) {
    await loadCart()
    cartMutationFailed = false
    actionError.value = locale.value === 'en-US' ? 'Review the updated bag before checking out again.' : '请核对更新后的购物袋，再重新确认结算。'
    checkoutState.value = 'error'
    return
  }
  let attempt = pendingCheckout.value
  if (!attempt) {
    if (!cart.value.length) { checkoutState.value = 'idle'; return }
    attempt = {
      userId: auth.user.id,
      cartItemIds: cart.value.map((item) => item.id),
      notificationEmail: email.value,
      checkoutKey: crypto.randomUUID(),
      paymentKey: crypto.randomUUID(),
    }
    persistPendingCheckout(attempt)
  }
  resetActionFeedback()
  checkoutState.value = 'loading'
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
    cartError.value = ''
    message.value = locale.value === 'en-US' ? `Mock payment completed. Order: ${order.orderNo}` : `模拟支付成功，订单号：${order.orderNo}`; checkoutState.value = 'success'; mobileCartSnapPoint.value = 'medium'
  } catch (reason) {
    if (attempt?.order) {
      try {
        const serverOrder = await apiGet<Order>(`/orders/${attempt.order.id}`, auth.token)
        if (serverOrder.status === 'PAID' || serverOrder.status === 'COMPLETED') {
          clearPendingCheckout()
          cart.value = []
          cartError.value = ''
          message.value = locale.value === 'en-US' ? `Mock payment completed. Order: ${serverOrder.orderNo}` : `模拟支付成功，订单号：${serverOrder.orderNo}`
          checkoutState.value = 'success'
          mobileCartSnapPoint.value = 'medium'
          return
        } else if (serverOrder.status === 'CANCELLED') {
          clearPendingCheckout()
        } else {
          attempt = { ...attempt, order: serverOrder }
          persistPendingCheckout(attempt)
        }
      } catch { /* keep the recovery key when the reconciliation request also fails */ }
    }
    const nonRetryable = reason instanceof Error && 'status' in reason
      && typeof (reason as { status?: unknown }).status === 'number'
      && (reason as { status: number }).status >= 400 && (reason as { status: number }).status < 500
      && ![401, 403, 408, 429].includes((reason as { status: number }).status)
    if (nonRetryable) clearPendingCheckout()
    else if (attempt?.order) {
      cart.value = []
    }
    actionError.value = reason instanceof Error ? reason.message : '下单或支付失败。'; checkoutState.value = 'error'
  }
}
onMounted(async () => {
  await auth.initialize()
  restorePendingCheckout()
  await Promise.all([loadProducts(), loadCart()])
  await resumePendingAdd()
})
</script>

<template>
  <section class="shop-page">
    <section class="shop-content">
      <div
        v-pointer-surface="{ kind: 'product', maxTilt: 0, lift: 0 }"
        class="shop-object-studio-surface"
        aria-hidden="true"
      ></div>
      <header class="shop-intro" data-glass="light">
        <p class="eyebrow">HELUO CULTURAL STORE</p>
        <h1>{{ shopTitle }}</h1>
        <div class="shop-category-nav" data-galaxy-segmented data-glass="compact" role="group" :aria-label="shopCopy.categories"><button type="button" :class="{ active: activeCategory === 'all' }" :aria-pressed="activeCategory === 'all'" @click="activeCategory = 'all'">{{ shopCopy.all }}</button><button type="button" :class="{ active: activeCategory === 'objects' }" :aria-pressed="activeCategory === 'objects'" @click="activeCategory = 'objects'">{{ shopCopy.category }}</button><button type="button" :class="{ active: activeCategory === 'textiles' }" :aria-pressed="activeCategory === 'textiles'" @click="activeCategory = 'textiles'">{{ shopCopy.apparel }}</button><button type="button" :class="{ active: activeCategory === 'paper' }" :aria-pressed="activeCategory === 'paper'" @click="activeCategory = 'paper'">{{ shopCopy.paper }}</button></div>
        <p>{{ t.shopText.intro }}</p>
      </header>

      <svg class="shop-river" viewBox="0 0 1320 150" preserveAspectRatio="none" aria-hidden="true"><path d="M0 77c112 1 160 1 251 2 84 1 97 48 181 32 86-17 143 8 215-17 90-31 116-86 209-43 90 42 123-33 221-8 98 25 132-3 243-25"/><path d="M0 80c112 1 160 1 251 2 84 1 98 43 181 29 86-14 143 6 215-18 89-29 117-78 209-39 90 39 124-31 221-7 99 23 132-3 243-25"/><circle cx="1269" cy="29" r="7"/><circle cx="1269" cy="29" r="13"/></svg>

      <InlineStatus v-if="message" kind="success" :message="message" :announce="!mobileCartOpen" />
      <InlineStatus v-else-if="cartPanelError" kind="error" :message="cartPanelError" :announce="!mobileCartOpen" />
      <div v-if="loading" class="state-panel">{{ t.shopText.loading }}</div>
      <section v-else-if="productError" class="state-panel state-panel--action shop-products-state"><h2>{{ shopCopy.loadFailed }}</h2><p>{{ productError }}</p><button type="button" @click="retryProducts">{{ shopCopy.retryProducts }}</button></section>
      <section v-else-if="visibleProducts.length === 0" class="state-panel state-panel--action shop-products-state"><h2>{{ shopCopy.unavailable }}</h2></section>
      <div v-else id="shop-products" class="product-grid" tabindex="-1" :class="{ 'product-grid--single': visibleProducts.length === 1 }">
        <motion.article v-for="(product,index) in visibleProducts" :key="product.id" :class="{ featured: index === 0 }" :initial="{ opacity: 0, y: 10 }" :animate="{ opacity: 1, y: 0 }" :transition="{ duration: 0.28, delay: index * 0.04 }">
          <div v-pointer-surface="{ kind: 'product', maxTilt: 0.8 }" class="product-image"><img :src="displayProduct(product).coverImageUrl" :srcset="mediaSrcset(displayProduct(product).coverImageUrl)" :sizes="mediaSizes" :alt="displayProduct(product).name" :loading="index === 0 ? 'eager' : 'lazy'" :fetchpriority="index === 0 ? 'high' : 'auto'" decoding="async" @error="useFallbackProductImage($event, product)" /><p>{{ productImageNotes[product.slug] }}</p></div>
        <div class="product-copy" data-glass="light" data-galaxy-card data-tactile-card data-glass-interactive><span class="product-number">0{{ index + 1 }}</span><h2>{{ displayProduct(product).name }}</h2><p>{{ displayProduct(product).summary }}</p><div class="product-meta"><small>{{ t.shopText.remaining }} {{ product.availableStock }} {{ stockUnit(product.availableStock) }}</small><strong>¥ {{ product.price }}</strong></div><FluidButton block :disabled="product.availableStock === 0 || pendingCheckout !== null || (addingProductId !== null && addingProductId !== product.id)" :loading="addingProductId === product.id" @click="add(product)">{{ addingProductId === product.id ? shopCopy.adding : pendingCheckout ? shopCopy.pending : t.shopText.add }}</FluidButton></div>
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
         :error="cartPanelError"
         input-id="cart-notification-email-desktop"
        :announce-feedback="!mobileCartOpen"
        :cart-loading="cartLoading"
        :cart-load-error="cartError"
        @reload="loadCart"
         :pending-item-ids="pendingCartActions"
        :mutating="cartBusy"
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
         :error="cartPanelError"
         input-id="cart-notification-email-mobile"
        @browse="closeCartForBrowsing"
        :cart-loading="cartLoading"
        :cart-load-error="cartError"
        :announce-feedback="true"
        @reload="loadCart"
         :pending-item-ids="pendingCartActions"
        :mutating="cartBusy"
        @update:email="email = $event"
        @change="change"
        @remove="remove"
        @checkout="checkout"
      />
    </BottomSheet>
  </section>
</template>
