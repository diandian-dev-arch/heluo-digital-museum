<script setup lang="ts">
import { AnimatePresence, motion } from 'motion-v'
import { Delete, Lock, Minus, Plus, ShoppingBag } from '@element-plus/icons-vue'
import { RouterLink } from 'vue-router'
import FluidButton from './FluidButton.vue'
import InlineStatus from './InlineStatus.vue'

interface CartItem {
  id: number
  productId: number
  quantity: number
  name: string
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
      <h3>登录后使用购物袋</h3>
      <p>保存心仪文创，并完成模拟下单与支付。</p>
      <RouterLink to="/login">前往登录</RouterLink>
    </div>

    <div v-else-if="!items.length" class="cart-empty-state">
      <span class="cart-empty-state__icon" aria-hidden="true"><ShoppingBag /></span>
      <template v-if="pendingCheckout">
        <h3>订单待完成支付</h3>
        <p v-if="pendingOrder">订单号：{{ pendingOrder.orderNo }}。请继续模拟支付，不会重新创建订单。</p>
        <p v-else>正在确认先前提交的订单。请继续结算，不会创建重复订单。</p>
        <FluidButton type="button" block :loading="checkoutState === 'loading'" :state="checkoutState === 'error' ? 'error' : 'idle'" @click="emit('checkout')">继续模拟支付</FluidButton>
      </template>
      <template v-else>
        <h3>{{ checkoutState === 'success' ? '订单已完成' : '购物袋还是空的' }}</h3>
        <p>{{ checkoutState === 'success' ? '可以继续挑选下一件河洛文创。' : '从左侧器物中选择一件，加入你的日常。' }}</p>
        <a href="#shop-products">继续挑选</a>
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
            <img :src="item.coverImageUrl" :alt="item.name" loading="lazy" decoding="async" />
            <div class="cart-item__body">
              <span>{{ item.name }}</span>
              <strong>¥ {{ item.price }}</strong>
              <div class="quantity" role="group" :aria-label="`${item.name}数量`">
                <motion.button type="button" :disabled="item.quantity <= 1" aria-label="减少数量" :while-press="{ scale: 0.9 }" @click="emit('change', item, item.quantity - 1)"><Minus /></motion.button>
                <b aria-live="polite">{{ item.quantity }}</b>
                <motion.button type="button" :disabled="item.quantity >= Math.min(10, item.availableStock)" aria-label="增加数量" :while-press="{ scale: 0.9 }" @click="emit('change', item, item.quantity + 1)"><Plus /></motion.button>
              </div>
            </div>
            <motion.button class="remove-cart-item" type="button" :aria-label="`移除${item.name}`" title="移除商品" :while-press="{ scale: 0.9 }" @click="emit('remove', item)"><Delete /></motion.button>
          </motion.article>
        </AnimatePresence>
      </div>

      <form class="cart-order-form" @submit.prevent="emit('checkout')">
        <label class="cart-email-field" for="cart-notification-email">
          <span>订单通知邮箱 <small>用于接收模拟支付结果</small></span>
          <input id="cart-notification-email" :value="email" type="email" autocomplete="email" placeholder="name@example.com" required @input="updateEmail" />
        </label>
        <dl class="cart-order-summary">
          <div><dt>商品小计</dt><dd>¥ {{ total }}</dd></div>
          <div><dt>配送</dt><dd>模拟订单，无实物物流</dd></div>
          <div class="cart-order-total"><dt>合计 <small>{{ itemCount }} 件</small></dt><dd>¥ {{ total }}</dd></div>
        </dl>
        <FluidButton type="submit" block size="lg" :loading="checkoutState === 'loading'" :state="checkoutState === 'success' ? 'success' : checkoutState === 'error' ? 'error' : 'idle'">
          {{ checkoutState === 'loading' ? '正在完成模拟支付' : '确认并模拟支付' }}
        </FluidButton>
        <p class="cart-payment-note"><Lock aria-hidden="true" />演示结算不会产生真实扣款或物流。</p>
      </form>
    </template>
  </div>
</template>
