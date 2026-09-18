<script setup lang="ts">
import { computed, useId } from 'vue'
import { useLocale } from '../stores/locale'

defineProps<{ locked: boolean; errors: Record<string, string> }>()
const contactName = defineModel<string>('contactName', { required: true })
const contactPhone = defineModel<string>('contactPhone', { required: true })
const contactEmail = defineModel<string>('contactEmail', { required: true })
const notes = defineModel<string>('notes', { required: true })
const { t, locale } = useLocale()
const id = useId()
const copy = computed(() => locale.value === 'zh-CN' ? {
  name: '联系人姓名', phone: '联系人手机号', notes: '无障碍需求或其他参观安排',
} : { name: 'Contact name', phone: 'Contact phone number', notes: 'Accessibility needs or other visit arrangements' })
</script>

<template>
  <div class="appointment-contact-fields">
    <label class="appointment-field">
      <span>{{ t.booking.name }}</span>
      <input v-model.trim="contactName" maxlength="50" autocomplete="name" :disabled="locked" :aria-invalid="Boolean(errors.contactName)" :aria-describedby="errors.contactName ? `${id}-name-error` : undefined" :placeholder="copy.name" required />
      <small v-if="errors.contactName" :id="`${id}-name-error`" class="appointment-field-error">{{ errors.contactName }}</small>
    </label>
    <label class="appointment-field">
      <span>{{ t.booking.phone }}</span>
      <input v-model.trim="contactPhone" type="tel" maxlength="20" autocomplete="tel" inputmode="tel" :disabled="locked" :aria-invalid="Boolean(errors.contactPhone)" :aria-describedby="errors.contactPhone ? `${id}-phone-error` : undefined" :placeholder="copy.phone" required />
      <small v-if="errors.contactPhone" :id="`${id}-phone-error`" class="appointment-field-error">{{ errors.contactPhone }}</small>
    </label>
    <label class="appointment-field appointment-field--wide">
      <span>{{ t.booking.email }}</span>
      <input v-model.trim="contactEmail" type="email" maxlength="160" autocomplete="email" inputmode="email" :disabled="locked" :aria-invalid="Boolean(errors.contactEmail)" :aria-describedby="errors.contactEmail ? `${id}-email-error` : undefined" placeholder="name@example.com" required />
      <small v-if="errors.contactEmail" :id="`${id}-email-error`" class="appointment-field-error">{{ errors.contactEmail }}</small>
    </label>
    <label class="appointment-field appointment-field--wide">
      <span>{{ t.booking.notes }} <small>{{ notes.length }}/500</small></span>
      <textarea v-model.trim="notes" :disabled="locked" maxlength="500" rows="3" :placeholder="copy.notes" />
    </label>
  </div>
</template>
