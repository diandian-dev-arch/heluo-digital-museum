<script setup lang="ts">
import { computed } from 'vue'
import { AnimatePresence, motion } from 'motion-v'
import { Delete, Lock, Minus, Plus, ShoppingBag } from '@element-plus/icons-vue'
import { RouterLink } from 'vue-router'
import FluidButton from './FluidButton.vue'
import InlineStatus from './InlineStatus.vue'
import { fallbackProductCover, resolveProductPresentation } from '../lib/productPresentation'
import { useLocale } from '../stores/locale'

interface CartItem {
  id: number
  productId: number
  quantity: number
  name: string
  slug?: string
  price: string
  availableStock: number
  coverImageUrl: string
}

const props = defineProps<{
  loggedIn: boolean
  items: CartItem[]
  itemCount: number
  total: string
  email: string
  checkoutState: 'idle' | 'loading' | 'success' | 'error'
  pendingOrder?: { id: number; orderNo: string } | null
  pendingCheckout?: boolean
  message?: string
  error?: string
}>()
const { locale } = useLocale()
const copy = computed(() => locale.value === 'en-US' ? {
  visitorCart: 'VISITOR CART', signInTitle: 'Sign in to use your shopping bag', signInText: 'Save museum-store favorites and complete a mock order and payment.', signIn: 'Sign in', selection: 'YOUR SELECTION', pendingTitle: 'Payment still pending', order: 'Order', pendingOrderText: 'Continue the mock payment without creating another order.', checkingOrder: 'We are checking the previous order. Continue checkout without creating a duplicate.', retry: 'Continue mock payment', completed: 'Order completed', empty: 'Your shopping bag is empty', completedText: 'Choose another Heluo-inspired product whenever you are ready.', emptyText: 'Choose an object from the collection and bring it into everyday life.', browse: 'Continue browsing', quantity: 'quantity', decrease: 'Decrease quantity', increase: 'Increase quantity', remove: 'Remove', removeTitle: 'Remove item', email: 'Order notification email', emailHint: 'Used for the mock-payment result', subtotal: 'Subtotal', delivery: 'Delivery', deliveryText: 'Mock order · no physical delivery', total: 'Total', unit: 'items', paying: 'Completing mock payment', pay: 'Confirm and mock pay', paymentNote: 'This demonstration creates no real charge or delivery.'
} : {
  visitorCart: 'VISITOR CART', signInTitle: '登录后使用购物袋', signInText: '保存心仪文创，并完成模拟下单与支付。', signIn: '前往登录', selection: 'YOUR SELECTION', pendingTitle: '订单待完成支付', order: '订单号', pendingOrderText: '请继续模拟支付，不会重新创建订单。', checkingOrder: '正在确认先前提交的订单。请继续结算，不会创建重复订单。', retry: '继续模拟支付', completed: '订单已完成', empty: '购物袋还是空的', completedText: '可以继续挑选下一件河洛文创。', emptyText: '从左侧器物中选择一件，加入你的日常。', browse: '继续挑选', quantity: '数量', decrease: '减少数量', increase: '增加数量', remove: '移除', removeTitle: '移除商品', email: '订单通知邮箱', emailHint: '用于接收模拟支付结果', subtotal: '商品小计', delivery: '配送', deliveryText: '模拟订单，无实物物流', total: '合计', unit: '件', paying: '正在完成模拟支付', pay: '确认并模拟支付', paymentNote: '演示结算不会产生真实扣款或物流。'
})
const cartName = (name: string) => locale.value === 'en-US' ? ({ '河流纹茶杯套装': 'River-pattern Teacup Set', '河洛水系丝巾': 'Heluo River-system Scarf', '河图纹笔记本': 'River-map Pattern Notebook' }[name] ?? name) : name
const removeLabel = (name: string) => locale.value === 'en-US' ? `${copy.value.remove} ${cartName(name)}` : `${copy.value.remove}${cartName(name)}`
const cartImage = (item: CartItem) => resolveProductPresentation(item).coverImageUrl

function useFallbackImage(event: Event, item: CartItem) {
  const image = event.currentTarget as HTMLImageElement
  const fallback = fallbackProductCover(item)
  if (fallback && !image.src.endsWith(fallback)) image.src = fallback
}

const emit = defineEmits<{
  (event: 'update:email', value: string): void
  (event: 'change', item: CartItem, quantity: number): void
  (event: 'remove', item: CartItem): void
  (event: 'checkout'): void
}>()

function updateEmail(event: Event) {
  emit('update:email', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <div class="cart-experience">
    <InlineStatus v-if="message" kind="success" :message="message" :announce="false" />
    <InlineStatus v-if="error" kind="error" :message="error" :announce="false" />

    <div v-if="!loggedIn" class="cart-empty-state">
      <span class="cart-empty-state__icon" aria-hidden="true"><ShoppingBag /></span>
      <small>{{ copy.visitorCart }}</small>
      <h3>{{ copy.signInTitle }}</h3>
      <p>{{ copy.signInText }}</p>
      <RouterLink to="/login">{{ copy.signIn }}</RouterLink>
    </div>

    <div v-else-if="!items.length" class="cart-empty-state">
      <span class="cart-empty-state__icon" aria-hidden="true"><ShoppingBag /></span>
      <small>{{ copy.selection }}</small>
      <template v-if="pendingCheckout">
        <h3>{{ copy.pendingTitle }}</h3>
        <p v-if="pendingOrder">{{ copy.order }}: {{ pendingOrder.orderNo }}. {{ copy.pendingOrderText }}</p>
        <p v-else>{{ copy.checkingOrder }}</p>
        <FluidButton type="button" block :loading="checkoutState === 'loading'" :state="checkoutState === 'error' ? 'error' : 'idle'" @click="emit('checkout')">{{ copy.retry }}</FluidButton>
      </template>
      <template v-else>
        <h3>{{ checkoutState === 'success' ? copy.completed : copy.empty }}</h3>
        <p>{{ checkoutState === 'success' ? copy.completedText : copy.emptyText }}</p>
        <a href="#shop-products">{{ copy.browse }}</a>
      </template>
    </div>

    <template v-else>
      <div class="cart-items" aria-live="polite">
        <AnimatePresence :initial="false">
          <motion.article
            v-for="item in items"
            :key="item.id"
            class="cart-item"
            layout
            :initial="{ opacity: 0, y: 8 }"
            :animate="{ opacity: 1, y: 0 }"
            :exit="{ opacity: 0, x: 18 }"
            :transition="{ type: 'spring', stiffness: 440, damping: 38, mass: 0.82 }"
          >
            <img :src="cartImage(item)" :alt="item.name" loading="lazy" decoding="async" @error="useFallbackImage($event, item)" />
            <div class="cart-item__body">
              <span>{{ cartName(item.name) }}</span>
              <strong>¥ {{ item.price }}</strong>
              <div class="quantity" role="group" :aria-label="`${cartName(item.name)} ${copy.quantity}`">
                <motion.button type="button" :disabled="item.quantity <= 1" :aria-label="copy.decrease" :while-press="{ scale: 0.9 }" @click="emit('change', item, item.quantity - 1)"><Minus /></motion.button>
                <b aria-live="polite">{{ item.quantity }}</b>
                <motion.button type="button" :disabled="item.quantity >= Math.min(10, item.availableStock)" :aria-label="copy.increase" :while-press="{ scale: 0.9 }" @click="emit('change', item, item.quantity + 1)"><Plus /></motion.button>
              </div>
            </div>
            <motion.button class="remove-cart-item" type="button" :aria-label="removeLabel(item.name)" :title="copy.removeTitle" :while-press="{ scale: 0.9 }" @click="emit('remove', item)"><Delete /></motion.button>
          </motion.article>
        </AnimatePresence>
      </div>

      <form class="cart-order-form" @submit.prevent="emit('checkout')">
        <label class="cart-email-field" for="cart-notification-email">
          <span>{{ copy.email }} <small>{{ copy.emailHint }}</small></span>
          <input id="cart-notification-email" :value="email" type="email" autocomplete="email" placeholder="name@example.com" required @input="updateEmail" />
        </label>
        <dl class="cart-order-summary">
          <div><dt>{{ copy.subtotal }}</dt><dd>¥ {{ total }}</dd></div>
          <div><dt>{{ copy.delivery }}</dt><dd>{{ copy.deliveryText }}</dd></div>
          <div class="cart-order-total"><dt>{{ copy.total }} <small>{{ itemCount }} {{ copy.unit }}</small></dt><dd>¥ {{ total }}</dd></div>
        </dl>
        <FluidButton type="submit" block size="lg" :loading="checkoutState === 'loading'" :state="checkoutState === 'success' ? 'success' : checkoutState === 'error' ? 'error' : 'idle'">
          {{ checkoutState === 'loading' ? copy.paying : copy.pay }}
        </FluidButton>
        <p class="cart-payment-note"><Lock aria-hidden="true" />{{ copy.paymentNote }}</p>
      </form>
    </template>
  </div>
</template>
