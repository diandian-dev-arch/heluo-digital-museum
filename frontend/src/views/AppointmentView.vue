<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { motion } from 'motion-v'
import { ApiRequestError, apiGet, apiRequest } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import { useLocale } from '../stores/locale'
import InlineStatus from '../components/InlineStatus.vue'
import BottomSheet from '../components/BottomSheet.vue'
import FluidButton from '../components/FluidButton.vue'

interface Slot { id: number; visitDate: string; startTime: string; endTime: string; remainingPeople: number }
interface CalendarDay { iso: string; short: string; weekday: string; available: boolean }

const auth = useAuthStore()
const router = useRouter()
const { t, locale } = useLocale()
const slots = ref<Slot[]>([])
const selectedDate = ref('')
const loading = ref(true)
const error = ref('')
const message = ref('')
const submitting = ref(false)
const mobileSummaryOpen = ref(false)
const mobileSummarySnapPoint = ref<'medium' | 'full'>('medium')
const form = reactive({ slotId: 0, visitorCount: 1, contactName: '', contactPhone: '', contactEmail: '', notes: '' })
const bookingTitle = computed(() => locale.value === 'zh-CN' ? '把一天留给河洛文明。' : 'Give one day to Heluo civilization.')
const bookingIntro = computed(() => locale.value === 'zh-CN' ? '沿着预约路线，在一段可被安静期待的时间里相见。' : 'Follow a calm route from date selection to your visit.')
const pageCopy = computed(() => locale.value === 'zh-CN' ? {
  progress: '预约进度', steps: ['选择日期', '选择时段', '填写信息', '确认预约'], chooseDate: '选择日期', unavailable: '暂无可预约时段', full: '已约满', slotsNote: '* 每个时段有预约参观人数上限，约满将无法提交。', fill: '填写预约信息',
  museumAlt: '河洛数字博物馆建筑概念图', museum: '河洛数字博物馆', address: '⌖ 河南省洛阳市洛龙区开元大道与学府街交叉口', duration: '◷ 建议时长 60–90 分钟', arrival: '♙ 入馆建议 提前 15 分钟到达',
  details: '预约信息', mapTitle: '博物馆参观路线示意', mapDescription: '从入口广场经过核心展厅，到达文创空间。', rooms: [['入口广场', '集合 · 验票'], ['核心展厅', '主题参观'], ['文创空间', '休憩 · 选物']],
  date: '参观日期', time: '参观时段', visitors: '参与人数', peopleUnit: '人', namePlaceholder: '请输入联系人姓名', phonePlaceholder: '请输入联系人手机号', notesPlaceholder: '如有特殊需求，请留言说明', confirm: '确认预约', privacy: '♢ 信息仅用于预约联系，我们将严格保护您的隐私安全。',
  success: '预约已提交，管理员确认后会向联系人邮箱发送通知。',
} : {
  progress: 'Booking progress', steps: ['Choose date', 'Choose time', 'Your details', 'Confirm'], chooseDate: 'Choose a date', unavailable: 'No available times', full: 'Fully booked', slotsNote: '* Each time slot has limited capacity and closes when full.', fill: 'Enter booking details',
  museumAlt: 'Concept view of Heluo Digital Museum', museum: 'Heluo Digital Museum', address: '⌖ Kaiyuan Avenue & Xuefu Street, Luolong District, Luoyang', duration: '◷ Suggested visit: 60–90 minutes', arrival: '♙ Please arrive 15 minutes early',
  details: 'Booking details', mapTitle: 'Museum visitor route', mapDescription: 'From Entrance Plaza through the Main Gallery to the Museum Store.', rooms: [['Entrance Plaza', 'Meet · Check in'], ['Main Gallery', 'Curated visit'], ['Museum Store', 'Pause · Browse']],
  date: 'Visit date', time: 'Visit time', visitors: 'Visitors', peopleUnit: 'people', namePlaceholder: 'Enter the contact name', phonePlaceholder: 'Enter a contact phone number', notesPlaceholder: 'Tell us about any accessibility or visit needs', confirm: 'Confirm booking', privacy: '♢ Your details are used only to manage this booking and are kept private.',
  success: 'Your booking has been submitted. A confirmation will be sent to the contact email after review.',
})

const selectedSlot = computed(() => slots.value.find((slot) => slot.id === form.slotId))
const filteredSlots = computed(() => slots.value.filter((slot) => slot.visitDate === selectedDate.value))
const bookingStep = computed(() => {
  if (message.value) return 4
  if (form.contactName || form.contactPhone || form.contactEmail || form.notes) return 3
  if (form.slotId) return 2
  return 1
})
const dateDays = computed<CalendarDay[]>(() => {
  const source = slots.value[0]?.visitDate
  if (!source) return []
  const available = new Set(slots.value.map((slot) => slot.visitDate))
  const [year, month, day] = source.split('-').map(Number)
  const base = new Date(Date.UTC(year, month - 1, day))
  const weekdaysZh = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return Array.from({ length: 7 }, (_, index) => {
    const value = new Date(base)
    value.setUTCDate(base.getUTCDate() + index)
    const iso = value.toISOString().slice(0, 10)
    return {
      iso,
      short: `${String(value.getUTCMonth() + 1).padStart(2, '0')}/${String(value.getUTCDate()).padStart(2, '0')}`,
      weekday: locale.value === 'en-US' ? value.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }) : weekdaysZh[value.getUTCDay()],
      available: available.has(iso),
    }
  })
})

function selectDate(date: string) {
  const first = slots.value.find((slot) => slot.visitDate === date)
  if (!first) return
  selectedDate.value = date
  form.slotId = first.id
}

function bookingError(reason: unknown, type: 'load' | 'submit') {
  if (!(reason instanceof ApiRequestError)) return type === 'load' ? t.value.booking.loadError : t.value.booking.submitError
  if (reason.status === 401) return t.value.booking.loginRequired
  if (reason.status === 409) {
    if (reason.message.includes('日期')) return t.value.booking.pastDate
    if (reason.message.includes('名额')) return t.value.booking.noCapacity
    if (reason.message.includes('时段')) return t.value.booking.slotUnavailable
  }
  if (reason.status === 422) return t.value.booking.invalidForm
  return type === 'load' ? t.value.booking.loadError : t.value.booking.submitError
}

async function load() {
  loading.value = true
  try {
    slots.value = await apiGet<Slot[]>('/appointment-slots')
    if (slots.value[0]) {
      selectedDate.value = slots.value[0].visitDate
      form.slotId = slots.value[0].id
    }
  } catch (reason) {
    error.value = bookingError(reason, 'load')
  } finally { loading.value = false }
}

async function submit() {
  if (submitting.value) return
  error.value = ''
  message.value = ''
  await auth.initialize()
  if (!auth.loggedIn) { await router.push('/login'); return }
  submitting.value = true
  try {
    await apiRequest('/appointments', 'POST', form, auth.token)
    message.value = pageCopy.value.success
  } catch (reason) { error.value = bookingError(reason, 'submit') } finally { submitting.value = false }
}

onMounted(async () => {
  await load()
  await auth.initialize()
  if (auth.user) { form.contactName = auth.user.nickname; form.contactEmail = auth.user.email }
})
</script>

<template>
  <main class="booking-page">
    <section class="booking-main" data-glass="light">
      <svg class="booking-wash" viewBox="0 0 1000 760" preserveAspectRatio="none" aria-hidden="true"><path d="M-40 423c145-48 190 72 320 32s121-93 235-63 133 85 248 31 141-56 286-19"/><path d="M-40 438c149-50 191 70 326 29s118-85 231-57 136 80 251 28 142-54 288-19"/></svg>
      <motion.header class="booking-intro" :initial="{ opacity: 0, y: 8 }" :animate="{ opacity: 1, y: 0 }" :transition="{ duration: 0.3 }">
        <p class="eyebrow">VISIT BOOKING</p>
        <h1>{{ bookingTitle }}</h1>
        <p>{{ bookingIntro }}</p>
      </motion.header>

      <ol class="booking-steps" :aria-label="pageCopy.progress">
        <li :class="{ active: bookingStep >= 1, current: bookingStep === 1 }" :aria-current="bookingStep === 1 ? 'step' : undefined"><b>01</b><span>{{ pageCopy.steps[0] }}<strong>{{ selectedDate }}</strong></span></li>
        <li :class="{ active: bookingStep >= 2, current: bookingStep === 2 }" :aria-current="bookingStep === 2 ? 'step' : undefined"><b>02</b><span>{{ pageCopy.steps[1] }}<strong v-if="selectedSlot">{{ selectedSlot.startTime.slice(0,5) }} – {{ selectedSlot.endTime.slice(0,5) }}</strong></span></li>
        <li :class="{ active: bookingStep >= 3, current: bookingStep === 3 }" :aria-current="bookingStep === 3 ? 'step' : undefined"><b>03</b><span>{{ pageCopy.steps[2] }}</span></li>
        <li :class="{ active: bookingStep >= 4, current: bookingStep === 4 }" :aria-current="bookingStep === 4 ? 'step' : undefined"><b>04</b><span>{{ pageCopy.steps[3] }}</span></li>
      </ol>

      <div v-if="loading" class="state-panel">{{ t.booking.loading }}</div>
      <div v-else-if="slots.length === 0" class="state-panel">{{ t.booking.empty }}</div>
      <template v-else>
        <div class="date-strip" data-glass="compact" :aria-label="pageCopy.chooseDate">
          <span class="calendar-symbol" aria-hidden="true">▣</span><button class="date-arrow" type="button" disabled>‹</button>
          <button v-for="day in dateDays" :key="day.iso" :class="{ active: selectedDate === day.iso }" :disabled="!day.available" :aria-pressed="selectedDate === day.iso" :title="day.available ? `${pageCopy.chooseDate}: ${day.iso}` : `${day.iso}: ${pageCopy.unavailable}`" type="button" @click="selectDate(day.iso)"><strong>{{ day.short }}</strong><span>{{ day.weekday }}</span></button>
          <button class="date-arrow" type="button" disabled>›</button>
        </div>

        <motion.div class="slot-list" layout>
          <motion.button v-for="slot in filteredSlots" :key="slot.id" layout data-glass="compact" data-glass-interactive :class="{ active: form.slotId === slot.id }" type="button" :disabled="slot.remainingPeople <= 0" :aria-pressed="form.slotId === slot.id" :aria-label="`${slot.startTime.slice(0,5)} – ${slot.endTime.slice(0,5)}, ${slot.remainingPeople > 0 ? `${t.booking.remaining} ${slot.remainingPeople} ${t.booking.people}` : pageCopy.full}`" :while-press="{ scale: 0.98 }" @click="form.slotId = slot.id"><i></i><span>{{ slot.startTime.slice(0,5) }} – {{ slot.endTime.slice(0,5) }}</span><small>{{ slot.remainingPeople > 0 ? `${t.booking.remaining} ${slot.remainingPeople} ${t.booking.people}` : pageCopy.full }}</small></motion.button>
        </motion.div>
        <p class="slot-note">{{ pageCopy.slotsNote }}</p>
        <button class="mobile-booking-trigger" type="button" @click="mobileSummaryOpen = true">{{ pageCopy.fill }}</button>

        <motion.aside class="visit-card" data-glass="light" :initial="{ opacity: 0, y: 8 }" :animate="{ opacity: 1, y: 0 }" :transition="{ duration: 0.3, delay: 0.08 }">
          <img src="/media/editorial/museum-exterior-watercolor.webp" :alt="pageCopy.museumAlt" loading="lazy" decoding="async" />
          <div><h2>{{ pageCopy.museum }}</h2><p>{{ pageCopy.address }}</p><footer><span>{{ pageCopy.duration }}</span><span>{{ pageCopy.arrival }}</span></footer></div>
        </motion.aside>
      </template>
    </section>

    <aside class="booking-side booking-side-desktop" data-glass="light">
      <form class="appointment-form" data-glass-controls @submit.prevent="submit">
          <p class="section-label">VISIT TICKET</p>
        <h2>{{ pageCopy.details }}</h2>
        <svg class="booking-site-plan" viewBox="0 0 360 150" role="img" aria-labelledby="booking-map-title booking-map-description">
          <title id="booking-map-title">{{ pageCopy.mapTitle }}</title>
          <desc id="booking-map-description">{{ pageCopy.mapDescription }}</desc>
          <path class="booking-site-plan__river" d="M-12 132c74-28 126 19 190-8s115-35 194-8" />
          <path class="booking-site-plan__route-shadow" d="M54 68C100 68 125 45 180 45s80 23 126 23" />
          <path class="booking-site-plan__route" d="M54 68C100 68 125 45 180 45s80 23 126 23" />
          <g class="booking-site-plan__room booking-site-plan__room--entry">
            <circle cx="54" cy="68" r="18" />
            <text class="booking-site-plan__index" x="54" y="72" text-anchor="middle">01</text>
            <text x="54" y="105" text-anchor="middle">{{ pageCopy.rooms[0][0] }}</text>
            <text class="booking-site-plan__hint" x="54" y="120" text-anchor="middle">{{ pageCopy.rooms[0][1] }}</text>
          </g>
          <g class="booking-site-plan__room booking-site-plan__room--gallery">
            <circle cx="180" cy="45" r="22" />
            <text class="booking-site-plan__index" x="180" y="49" text-anchor="middle">02</text>
            <text x="180" y="92" text-anchor="middle">{{ pageCopy.rooms[1][0] }}</text>
            <text class="booking-site-plan__hint" x="180" y="107" text-anchor="middle">{{ pageCopy.rooms[1][1] }}</text>
          </g>
          <g class="booking-site-plan__room booking-site-plan__room--shop">
            <circle cx="306" cy="68" r="18" />
            <text class="booking-site-plan__index" x="306" y="72" text-anchor="middle">03</text>
            <text x="306" y="105" text-anchor="middle">{{ pageCopy.rooms[2][0] }}</text>
            <text class="booking-site-plan__hint" x="306" y="120" text-anchor="middle">{{ pageCopy.rooms[2][1] }}</text>
          </g>
        </svg>
        <InlineStatus v-if="message" kind="success" :message="message" />
        <InlineStatus v-if="error" kind="error" :message="error" />
        <dl v-if="selectedSlot" class="booking-summary" data-glass="compact">
          <div><dt>▦　{{ pageCopy.date }}</dt><dd>{{ selectedSlot.visitDate }} ({{ dateDays.find(day => day.iso === selectedSlot?.visitDate)?.weekday }})</dd></div>
          <div><dt>◷　{{ pageCopy.time }}</dt><dd>{{ selectedSlot.startTime.slice(0,5) }} – {{ selectedSlot.endTime.slice(0,5) }}</dd></div>
          <div><dt>♙　{{ pageCopy.visitors }}</dt><dd class="visitor-count"><input v-model.number="form.visitorCount" type="number" min="1" max="30" :aria-label="pageCopy.visitors" required /> {{ pageCopy.peopleUnit }}</dd></div>
        </dl>
        <label class="form-field"><span>{{ t.booking.name }}</span><input v-model.trim="form.contactName" maxlength="50" autocomplete="name" :placeholder="pageCopy.namePlaceholder" required /></label>
        <label class="form-field"><span>{{ t.booking.phone }}</span><input v-model.trim="form.contactPhone" maxlength="20" autocomplete="tel" inputmode="tel" :placeholder="pageCopy.phonePlaceholder" required /></label>
        <label class="form-field"><span>{{ t.booking.email }}</span><input v-model.trim="form.contactEmail" type="email" autocomplete="email" inputmode="email" placeholder="name@example.com" required /></label>
        <label class="form-field"><span>{{ t.booking.notes }} <small>{{ form.notes.length }}/500</small></span><textarea v-model.trim="form.notes" maxlength="500" rows="3" :placeholder="pageCopy.notesPlaceholder" /></label>
        <FluidButton type="submit" block :disabled="!form.slotId || loading || submitting" :loading="submitting">{{ pageCopy.confirm }}</FluidButton>
        <p class="form-note">{{ t.booking.note }}</p>
        <p class="privacy-note">{{ pageCopy.privacy }}</p>
      </form>
    </aside>

    <BottomSheet :open="mobileSummaryOpen" :title="pageCopy.details" :snap-point="mobileSummarySnapPoint" @close="mobileSummaryOpen = false" @update:snap-point="mobileSummarySnapPoint = $event">
      <InlineStatus v-if="message" kind="success" :message="message" />
      <InlineStatus v-if="error" kind="error" :message="error" />
      <dl v-if="selectedSlot" class="booking-summary" data-glass="compact">
        <div><dt>{{ pageCopy.date }}</dt><dd>{{ selectedSlot.visitDate }} ({{ dateDays.find(day => day.iso === selectedSlot?.visitDate)?.weekday }})</dd></div>
        <div><dt>{{ pageCopy.time }}</dt><dd>{{ selectedSlot.startTime.slice(0,5) }} – {{ selectedSlot.endTime.slice(0,5) }}</dd></div>
        <div><dt>{{ pageCopy.visitors }}</dt><dd class="visitor-count"><input v-model.number="form.visitorCount" type="number" min="1" max="30" :aria-label="pageCopy.visitors" required /> {{ pageCopy.peopleUnit }}</dd></div>
      </dl>
      <form class="mobile-booking-form" data-glass-controls @submit.prevent="submit">
        <label class="form-field"><span>{{ t.booking.name }}</span><input v-model.trim="form.contactName" maxlength="50" autocomplete="name" :placeholder="pageCopy.namePlaceholder" required /></label>
        <label class="form-field"><span>{{ t.booking.phone }}</span><input v-model.trim="form.contactPhone" maxlength="20" autocomplete="tel" inputmode="tel" :placeholder="pageCopy.phonePlaceholder" required /></label>
        <label class="form-field"><span>{{ t.booking.email }}</span><input v-model.trim="form.contactEmail" type="email" autocomplete="email" inputmode="email" placeholder="name@example.com" required /></label>
        <label class="form-field"><span>{{ t.booking.notes }} <small>{{ form.notes.length }}/500</small></span><textarea v-model.trim="form.notes" maxlength="500" rows="3" :placeholder="pageCopy.notesPlaceholder" /></label>
        <FluidButton type="submit" block :disabled="!form.slotId || loading || submitting" :loading="submitting">{{ pageCopy.confirm }}</FluidButton>
      </form>
    </BottomSheet>
  </main>
</template>
