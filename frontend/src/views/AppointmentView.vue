<script setup lang="ts">
import '../assets/task-pages.css'
import '../assets/control-surface-polish.css'
import '../assets/appointment-workbench.css'
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { ArrowRight, Calendar, Check, CircleCheck, Clock, InfoFilled, Location, Minus, Plus, Refresh, Tickets, Timer, User } from '@element-plus/icons-vue'
import { ApiRequestError, apiGet, apiRequest } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import { clearAppointmentDraft, readAppointmentDraft, saveAppointmentDraft } from '../stores/appointmentDraft'
import { useLocale } from '../stores/locale'
import InlineStatus from '../components/InlineStatus.vue'
import FluidButton from '../components/FluidButton.vue'
import AppointmentContactFields from '../components/AppointmentContactFields.vue'
import PointerDotField from '../components/PointerDotField.vue'

interface Slot { id: number; visitDate: string; startTime: string; endTime: string; remainingPeople: number }
interface CalendarDay { iso: string; day: string; weekday: string; available: boolean; full: boolean }
interface CreatedAppointment { appointmentNo: string }

const auth = useAuthStore()
const router = useRouter()
const { t, locale } = useLocale()
const slots = ref<Slot[]>([])
const selectedDate = ref('')
const loading = ref(true)
const loadError = ref('')
const submitError = ref('')
const fieldErrors = reactive<Record<string, string>>({})
const message = ref('')
const bookingNo = ref('')
const submitting = ref(false)
const mobileSummaryOpen = ref(false)
const mobileSummarySnapPoint = ref<'medium' | 'full'>('full')
const mobileBookingTrigger = ref<InstanceType<typeof FluidButton> | null>(null)
const mobileDateQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(max-width: 760px)')
  : undefined
const mobileDatePicker = ref(mobileDateQuery?.matches ?? false)
let draftOwnerId = auth.user?.id ?? null
const draft = readAppointmentDraft(draftOwnerId)
const form = reactive(draft.form)
const creationKey = ref<string | null>(draft.creationKey)
const formLocked = computed(() => submitting.value || Boolean(creationKey.value) || Boolean(message.value))
watch(() => auth.user?.id, (userId, previousId) => {
  if (previousId && userId !== previousId) {
    if (auth.sessionExpired) saveAppointmentDraft(form, creationKey.value, previousId)
    Object.assign(form, readAppointmentDraft(userId ?? null).form)
    creationKey.value = null
    selectedDate.value = ''
    message.value = ''
    bookingNo.value = ''
  }
  draftOwnerId = userId ?? null
})
let loadController: AbortController | undefined
const BottomSheet = defineAsyncComponent(() => import('../components/BottomSheet.vue'))
const bookingTitle = computed(() => locale.value === 'zh-CN' ? '预约参观' : 'Book your visit')
const bookingIntro = computed(() => locale.value === 'zh-CN' ? '走进河洛，与千年文明相见。' : 'A moment with the stories of Heluo.')
const workbenchCopy = computed(() => locale.value === 'zh-CN' ? {
  myBookings: '我的预约', dateTitle: '选择参观日期', window: '未来 14 天', closed: '未开放', timeTitle: '选择入馆时段', noDate: '尚未选择参观日期', noTimes: '当日暂无可预约时段', partyNote: '每次预约 1–30 人',
  summary: '本次参观', pending: '待选择', selected: '已选择', submitted: '已提交', concept: '场馆建筑概念图', visitInfo: '参观须知', reviewNote: '提交后由管理员确认，请留意预约邮箱。', cancelNote: '如需取消，请至少提前 2 小时在个人中心办理。', shortage: '当前时段余量不足，请减少人数或选择其他时段。',
} : {
  myBookings: 'My bookings', dateTitle: 'Choose your visit date', window: 'Next 14 days', closed: 'Closed', timeTitle: 'Choose an entry time', noDate: 'No visit date selected', noTimes: 'No entry times for this date', partyNote: '1–30 visitors per booking',
  summary: 'Your visit', pending: 'Not selected', selected: 'Selected', submitted: 'Submitted', concept: 'Museum architectural concept', visitInfo: 'Before your visit', reviewNote: 'Bookings are reviewed by our team. Confirmation is sent to your booking email.', cancelNote: 'You can cancel from your account at least 2 hours before your visit starts.', shortage: 'This time has fewer places than your group needs. Reduce the group size or choose another time.',
})
const pageCopy = computed(() => locale.value === 'zh-CN' ? {
  progress: '预约进度', steps: ['选择日期', '选择时段', '填写信息', '确认预约'], mobileSteps: ['选择日期', '选择时段', '填写信息', '确认预约'], chooseDate: '选择日期', available: '可预约', unavailable: '暂无可预约时段', full: '已约满', retry: '重新加载', fill: '填写预约信息',
  museumAlt: '河洛数字博物馆建筑概念图', museum: '河洛数字博物馆', address: '河南省洛阳市洛龙区开元大道与学府街交叉口', duration: '建议时长 60–90 分钟', arrival: '提前 15 分钟到达',
  details: '预约信息',
  date: '参观日期', datePending: '请选择参观日期', time: '参观时段', timePending: '请选择参观时段', visitors: '参与人数', peopleUnit: '人', decreaseVisitors: '减少参与人数', increaseVisitors: '增加参与人数', contactDetails: '联系人信息', confirm: '确认预约', privacy: '信息仅用于预约联系，我们将严格保护您的隐私安全。',
  success: '预约已提交，管理员确认后会向联系人邮箱发送通知。',
} : {
  progress: 'Booking progress', steps: ['Choose date', 'Choose time', 'Your details', 'Confirm'], mobileSteps: ['Date', 'Time', 'Details', 'Confirm'], chooseDate: 'Choose a date', available: 'Available', unavailable: 'No available times', full: 'Fully booked', retry: 'Retry', fill: 'Enter booking details',
  museumAlt: 'Concept view of Heluo Digital Museum', museum: 'Heluo Digital Museum', address: 'Kaiyuan Avenue & Xuefu Street, Luolong District, Luoyang', duration: 'Suggested visit: 60–90 minutes', arrival: 'Please arrive 15 minutes early',
  details: 'Booking details',
  date: 'Visit date', datePending: 'Choose a visit date', time: 'Visit time', timePending: 'Choose a visit time', visitors: 'Visitors', peopleUnit: 'people', decreaseVisitors: 'Decrease visitor count', increaseVisitors: 'Increase visitor count', contactDetails: 'Contact details', confirm: 'Confirm booking', privacy: 'Your details are used only to manage this booking and are kept private.',
  success: 'Your booking has been submitted. A confirmation will be sent to the contact email after review.',
})

const selectedSlot = computed(() => slots.value.find((slot) => slot.id === form.slotId))
const filteredSlots = computed(() => slots.value.filter((slot) => slot.visitDate === selectedDate.value))
const minimumVisitorCount = 1
const maximumVisitorCount = 30
const bookingStep = computed(() => {
  if (message.value) return 4
  if (!form.slotId) return 1
  if (mobileSummaryOpen.value || form.contactPhone || form.notes) return 3
  if (form.slotId) return 2
  return 1
})
const dateDays = computed<CalendarDay[]>(() => {
  const available = new Set(slots.value.filter((slot) => slot.remainingPeople > 0).map((slot) => slot.visitDate))
  const scheduled = new Set(slots.value.map((slot) => slot.visitDate))
  const now = new Date()
  const shanghaiDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const base = new Date(`${shanghaiDate}T00:00:00Z`)
  const weekdaysZh = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return Array.from({ length: 14 }, (_, index) => {
    const value = new Date(base)
    value.setUTCDate(base.getUTCDate() + index)
    const iso = value.toISOString().slice(0, 10)
    return {
      iso,
      day: String(value.getUTCDate()).padStart(2, '0'),
      weekday: locale.value === 'en-US' ? value.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }) : weekdaysZh[value.getUTCDay()],
      available: available.has(iso),
      full: scheduled.has(iso) && !available.has(iso),
    }
  })
})

function selectDate(date: string) {
  if (formLocked.value) return
  const first = slots.value.find((slot) => slot.visitDate === date && slot.remainingPeople > 0)
  if (!first) return
  selectedDate.value = date
  form.slotId = first.id
  fieldErrors.slotId = ''
  creationKey.value = null
  message.value = ''
  bookingNo.value = ''
}

function syncMobileDatePicker(event: MediaQueryListEvent) {
  mobileDatePicker.value = event.matches
  if (!event.matches) mobileSummaryOpen.value = false
}

async function closeMobileSummary() {
  mobileSummaryOpen.value = false
  await nextTick()
  mobileBookingTrigger.value?.$el?.focus({ preventScroll: true })
}

function selectSlot(slotId: number) {
  if (formLocked.value) return
  if (form.slotId !== slotId) creationKey.value = null
  form.slotId = slotId
  fieldErrors.slotId = ''
  message.value = ''
  bookingNo.value = ''
}

function clampVisitorCount(value: number) {
  if (!Number.isFinite(value)) return minimumVisitorCount
  return Math.min(maximumVisitorCount, Math.max(minimumVisitorCount, Math.trunc(value)))
}

function normalizeVisitorCount() {
  form.visitorCount = clampVisitorCount(form.visitorCount)
}

function adjustVisitorCount(amount: number) {
  if (formLocked.value) return
  form.visitorCount = clampVisitorCount(form.visitorCount + amount)
}

function bookingError(reason: unknown, type: 'load' | 'submit') {
  if (!(reason instanceof ApiRequestError)) return type === 'load' ? t.value.booking.loadError : t.value.booking.submitError
  if (reason.status === 401) return t.value.booking.loginRequired
  if (reason.status === 409) {
    if (reason.code === 'APPOINTMENT_OUTSIDE_OPEN_WINDOW') return locale.value === 'en-US' ? 'Bookings are open for the next 14 days only.' : '预约仅开放未来 14 天内的时段。'
    if (reason.code === 'DUPLICATE_ACTIVE_APPOINTMENT') return locale.value === 'en-US' ? 'You already have this time slot booked.' : '你已经预约过这个参观时段。'
    if (reason.message.includes('日期')) return t.value.booking.pastDate
    if (reason.message.includes('名额')) return t.value.booking.noCapacity
    if (reason.message.includes('时段')) return t.value.booking.slotUnavailable
    if (reason.message.includes('已预约')) return locale.value === 'en-US' ? 'You already have this time slot booked.' : '你已经预约过这个参观时段。'
  }
  if (reason.status === 422) return t.value.booking.invalidForm
  return type === 'load' ? t.value.booking.loadError : t.value.booking.submitError
}

async function load() {
  loadController?.abort()
  const controller = new AbortController()
  loadController = controller
  loading.value = true
  loadError.value = ''
  try {
    const result = await apiGet<Slot[]>('/appointment-slots', undefined, { signal: controller.signal })
    if (controller.signal.aborted) return
    slots.value = result
    const selected = slots.value.find((slot) => slot.id === form.slotId)
    if (selected && (creationKey.value || selected.remainingPeople >= form.visitorCount)) selectedDate.value = selected.visitDate
    else if (creationKey.value) selectedDate.value = ''
    else {
      if (form.slotId) fieldErrors.slotId = locale.value === 'en-US' ? 'This time is no longer available. Choose another time.' : '原时段已不可用或名额不足，请重新选择。'
      selectedDate.value = selected?.visitDate ?? ''
      form.slotId = 0
    }
  } catch (reason) {
    if (!controller.signal.aborted) loadError.value = bookingError(reason, 'load')
  } finally { if (loadController === controller) loading.value = false }
}

async function submit() {
  if (submitting.value || message.value) return
  normalizeVisitorCount()
  submitError.value = ''
  message.value = ''
  submitting.value = true
  await auth.initialize()
  if (!auth.loggedIn) {
    submitting.value = false
    saveAppointmentDraft(form, creationKey.value, draftOwnerId)
    if (auth.token && auth.initializationError) { submitError.value = auth.initializationError; return }
    await router.push({ path: '/login', query: { returnTo: '/appointment' } })
    return
  }
  fieldErrors.slotId = !creationKey.value && (!selectedSlot.value || selectedSlot.value.remainingPeople < form.visitorCount) ? (locale.value === 'en-US' ? 'Choose an available time.' : '请选择名额充足的参观时段。') : ''
  fieldErrors.contactName = !form.contactName.trim() ? (locale.value === 'en-US' ? 'Enter the contact name.' : '请填写联系人姓名。') : ''
  fieldErrors.contactPhone = !/^[+\d][\d\s()-]{5,19}$/.test(form.contactPhone) ? (locale.value === 'en-US' ? 'Enter a valid contact number.' : '请填写有效的联系电话。') : ''
  fieldErrors.contactEmail = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail) ? (locale.value === 'en-US' ? 'Enter a valid email address.' : '请填写有效的邮箱地址。') : ''
  if (Object.values(fieldErrors).some(Boolean)) { submitting.value = false; return }
  try {
    const key = creationKey.value ?? crypto.randomUUID()
    creationKey.value = key
    const token = auth.token
    const payload = { ...form }
    const created = await apiRequest<CreatedAppointment>('/appointments', 'POST', payload, token, { 'Idempotency-Key': key })
    if (auth.token !== token) return
    Object.assign(form, payload)
    message.value = pageCopy.value.success
    bookingNo.value = created.appointmentNo
    creationKey.value = null
    clearAppointmentDraft()
  } catch (reason) {
    submitError.value = bookingError(reason, 'submit')
    if (reason instanceof ApiRequestError && reason.status >= 400 && reason.status < 500 && reason.status !== 408) {
      creationKey.value = null
      if (reason.status === 409) await load()
    } else {
      submitError.value = locale.value === 'en-US' ? 'The booking result is not confirmed. Retry to check the same booking before changing its details.' : '暂未确认预约结果。请重试核对本次预约，再修改预约信息。'
    }
  } finally { submitting.value = false }
}

onMounted(async () => {
  mobileDateQuery?.addEventListener('change', syncMobileDatePicker)
  await load()
  await auth.initialize()
  if (auth.user) { form.contactName ||= auth.user.nickname; form.contactEmail ||= auth.user.email }
})

const calendarRange = computed(() => {
  const dates = dateDays.value
  if (!dates.length) return ''
  const formatter = new Intl.DateTimeFormat(locale.value, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
  return formatter.formatRange(new Date(`${dates[0]!.iso}T00:00:00Z`), new Date(`${dates[dates.length - 1]!.iso}T00:00:00Z`))
})
const insufficientCapacity = computed(() => Boolean(selectedSlot.value && selectedSlot.value.remainingPeople < form.visitorCount && !formLocked.value))

onBeforeUnmount(() => {
  mobileDateQuery?.removeEventListener('change', syncMobileDatePicker)
  loadController?.abort()
  if (!message.value && !auth.sessionExpired && (auth.user?.id ?? null) === draftOwnerId) saveAppointmentDraft(form, creationKey.value, draftOwnerId)
})
</script>

<template>
  <section class="booking-page appointment-workbench">
    <header class="appointment-heading">
      <PointerDotField variant="heading" />
      <div>
        <h1>{{ bookingTitle }}</h1>
        <p class="appointment-heading__intro">{{ bookingIntro }}</p>
      </div>
      <RouterLink class="appointment-account-link" to="/profile"><Tickets aria-hidden="true" />{{ workbenchCopy.myBookings }}<ArrowRight aria-hidden="true" /></RouterLink>
    </header>

    <div class="appointment-layout">
      <section class="appointment-main">
        <ol class="appointment-progress" :aria-label="pageCopy.progress">
          <li v-for="(label, index) in (mobileDatePicker ? pageCopy.mobileSteps : pageCopy.steps)" :key="index" :class="{ active: bookingStep >= index + 1, current: bookingStep === index + 1 }" :aria-current="bookingStep === index + 1 ? 'step' : undefined">
            <span class="appointment-progress__number"><Check v-if="bookingStep > index + 1" aria-hidden="true" /><template v-else>{{ index + 1 }}</template></span>
            <span>{{ label }}</span>
          </li>
        </ol>

        <div v-if="message" class="appointment-result" role="status">
          <CircleCheck aria-hidden="true" />
          <div><h2>{{ workbenchCopy.submitted }}</h2><p>{{ message }}</p><p>{{ locale === 'en-US' ? 'Booking' : '预约编号' }} {{ bookingNo }}</p><RouterLink to="/profile">{{ locale === 'en-US' ? 'View my bookings' : '查看我的预约' }}<ArrowRight aria-hidden="true" /></RouterLink></div>
        </div>
        <InlineStatus v-if="fieldErrors.slotId" id="booking-slot-error" kind="error" :message="fieldErrors.slotId" />
        <FluidButton v-if="creationKey" data-recover-booking block :disabled="submitting" :loading="submitting" @click="submit()"><Refresh aria-hidden="true" />{{ locale === 'en-US' ? 'Check booking result' : '核对预约结果' }}</FluidButton>
        <InlineStatus v-if="submitError && !mobileSummaryOpen" data-submit-error kind="error" :message="submitError" />

        <section class="appointment-section" aria-labelledby="appointment-date-title" :aria-busy="loading">
          <header class="appointment-section__heading">
            <h2 id="appointment-date-title"><span>01</span>{{ workbenchCopy.dateTitle }}</h2>
            <span class="appointment-window">{{ workbenchCopy.window }}</span>
          </header>
          <div class="appointment-calendar-heading">
            <span><Calendar aria-hidden="true" />{{ calendarRange }}</span>
            <span class="appointment-legend"><i aria-hidden="true"></i>{{ pageCopy.available }}</span>
          </div>
          <div v-if="loading" class="appointment-calendar-loading" role="status" :aria-label="t.booking.loading"><span v-for="day in 14" :key="day"></span></div>
          <div v-else-if="loadError" class="appointment-empty" role="alert"><InfoFilled aria-hidden="true" /><p>{{ loadError }}</p><FluidButton variant="secondary" @click="load"><Refresh aria-hidden="true" />{{ pageCopy.retry }}</FluidButton></div>
          <template v-else>
            <div class="appointment-dates" role="group" :aria-label="pageCopy.chooseDate">
              <button v-for="day in dateDays" :key="day.iso" class="appointment-day" :class="{ active: selectedDate === day.iso, 'is-full': day.full }" :disabled="formLocked || !day.available" :aria-pressed="selectedDate === day.iso" :aria-label="`${pageCopy.chooseDate}: ${day.iso}, ${day.available ? pageCopy.available : day.full ? pageCopy.full : workbenchCopy.closed}`" :title="day.available ? `${pageCopy.chooseDate}: ${day.iso}` : `${day.iso}: ${day.full ? pageCopy.full : pageCopy.unavailable}`" type="button" @click="selectDate(day.iso)">
                <span class="appointment-day__weekday">{{ day.weekday }}</span>
                <strong>{{ day.day }}</strong>
                <span class="appointment-day__status">{{ day.available ? pageCopy.available : day.full ? pageCopy.full : workbenchCopy.closed }}</span>
                <Check v-if="selectedDate === day.iso" class="appointment-day__check" aria-hidden="true" />
              </button>
            </div>
            <p v-if="!slots.length" class="appointment-inline-note">{{ t.booking.empty }}</p>
          </template>
        </section>

        <section class="appointment-section appointment-time-section" aria-labelledby="appointment-time-title">
          <header class="appointment-section__heading"><h2 id="appointment-time-title"><span>02</span>{{ workbenchCopy.timeTitle }}</h2><span v-if="selectedDate" class="appointment-selected-date">{{ selectedDate }}</span></header>
          <div v-if="selectedDate && filteredSlots.length" class="appointment-times" role="group" :aria-label="workbenchCopy.timeTitle">
            <button v-for="slot in filteredSlots" :key="slot.id" class="appointment-time" :class="{ active: form.slotId === slot.id }" type="button" :disabled="formLocked || slot.remainingPeople <= 0" :aria-pressed="form.slotId === slot.id" :aria-label="`${slot.startTime.slice(0,5)} – ${slot.endTime.slice(0,5)}, ${slot.remainingPeople > 0 ? `${t.booking.remaining} ${slot.remainingPeople} ${t.booking.people}` : pageCopy.full}`" @click="selectSlot(slot.id)">
              <span class="appointment-time__radio" aria-hidden="true"><Check v-if="form.slotId === slot.id" /></span>
              <span><strong>{{ slot.startTime.slice(0,5) }} – {{ slot.endTime.slice(0,5) }}</strong><small>{{ slot.remainingPeople > 0 ? `${t.booking.remaining} ${slot.remainingPeople} ${t.booking.people}` : pageCopy.full }}</small></span>
            </button>
          </div>
          <div v-else class="appointment-time-empty"><Clock aria-hidden="true" /><span>{{ selectedDate ? workbenchCopy.noTimes : workbenchCopy.noDate }}</span></div>
        </section>

        <form v-if="!mobileDatePicker" class="appointment-details" @submit.prevent="submit">
          <section class="appointment-section" aria-labelledby="appointment-contact-title">
            <header class="appointment-section__heading"><h2 id="appointment-contact-title"><span>03</span>{{ pageCopy.contactDetails }}</h2></header>
            <div class="appointment-party">
              <div><label for="appointment-visitors">{{ pageCopy.visitors }}</label><p>{{ workbenchCopy.partyNote }}</p></div>
              <div class="appointment-quantity">
                <button type="button" :aria-label="pageCopy.decreaseVisitors" :disabled="formLocked || form.visitorCount <= minimumVisitorCount" @click="adjustVisitorCount(-1)"><Minus aria-hidden="true" /></button>
                <input id="appointment-visitors" class="visitor-stepper__input" v-model.number="form.visitorCount" :disabled="formLocked" type="number" :min="minimumVisitorCount" :max="maximumVisitorCount" :aria-label="pageCopy.visitors" required @blur="normalizeVisitorCount" />
                <button type="button" :aria-label="pageCopy.increaseVisitors" :disabled="formLocked || form.visitorCount >= maximumVisitorCount" @click="adjustVisitorCount(1)"><Plus aria-hidden="true" /></button>
              </div>
            </div>
            <p v-if="insufficientCapacity" class="appointment-field-error" role="status">{{ workbenchCopy.shortage }}</p>
            <AppointmentContactFields v-model:contact-name="form.contactName" v-model:contact-phone="form.contactPhone" v-model:contact-email="form.contactEmail" v-model:notes="form.notes" :locked="formLocked" :errors="fieldErrors" />
          </section>
          <div class="appointment-submit">
            <p><InfoFilled aria-hidden="true" />{{ workbenchCopy.reviewNote }}</p>
            <FluidButton type="submit" :disabled="!form.slotId || loading || submitting || Boolean(message)" :loading="submitting">{{ pageCopy.confirm }}<ArrowRight aria-hidden="true" /></FluidButton>
          </div>
          <p class="appointment-privacy">{{ pageCopy.privacy }}</p>
        </form>

        <div v-else class="appointment-mobile-action">
          <p v-if="selectedSlot">{{ selectedSlot.visitDate }}<span>{{ selectedSlot.startTime.slice(0,5) }} – {{ selectedSlot.endTime.slice(0,5) }}</span></p>
          <FluidButton ref="mobileBookingTrigger" block :disabled="!selectedSlot || Boolean(message)" @click="mobileSummarySnapPoint = 'full'; mobileSummaryOpen = true">{{ pageCopy.fill }}<ArrowRight aria-hidden="true" /></FluidButton>
        </div>
      </section>

      <aside class="appointment-aside" :aria-label="workbenchCopy.summary">
        <figure class="appointment-venue">
          <img src="/media/editorial/museum-exterior-watercolor.webp" srcset="/media/editorial/museum-exterior-watercolor-480w-v1.webp 480w, /media/editorial/museum-exterior-watercolor-960w-v1.webp 960w, /media/editorial/museum-exterior-watercolor-1280w-v1.webp 1280w, /media/editorial/museum-exterior-watercolor.webp 1896w" sizes="(max-width: 760px) calc(100vw - 2rem), 360px" :alt="pageCopy.museumAlt" width="1896" height="830" loading="lazy" decoding="async" fetchpriority="low" />
          <figcaption>{{ workbenchCopy.concept }}</figcaption>
        </figure>
        <div class="appointment-venue-info">
          <h2>{{ pageCopy.museum }}</h2>
          <p><Location aria-hidden="true" /><span>{{ pageCopy.address }}</span></p>
          <p><Timer aria-hidden="true" /><span>{{ pageCopy.duration }}</span></p>
          <p><Clock aria-hidden="true" /><span>{{ pageCopy.arrival }}</span></p>
        </div>
        <section class="appointment-summary" :class="{ 'has-selection': selectedSlot }" aria-labelledby="appointment-summary-title">
          <header><h2 id="appointment-summary-title">{{ workbenchCopy.summary }}</h2><span :class="{ 'is-selected': selectedSlot }">{{ message ? workbenchCopy.submitted : selectedSlot ? workbenchCopy.selected : workbenchCopy.pending }}</span></header>
          <dl>
            <div><dt><Calendar aria-hidden="true" />{{ pageCopy.date }}</dt><dd>{{ selectedSlot?.visitDate || pageCopy.datePending }}</dd></div>
            <div><dt><Clock aria-hidden="true" />{{ pageCopy.time }}</dt><dd>{{ selectedSlot ? `${selectedSlot.startTime.slice(0,5)} – ${selectedSlot.endTime.slice(0,5)}` : pageCopy.timePending }}</dd></div>
            <div><dt><User aria-hidden="true" />{{ pageCopy.visitors }}</dt><dd>{{ form.visitorCount }} {{ pageCopy.peopleUnit }}</dd></div>
          </dl>
        </section>
        <section class="appointment-notice" aria-labelledby="appointment-notice-title"><h2 id="appointment-notice-title">{{ workbenchCopy.visitInfo }}</h2><p>{{ workbenchCopy.reviewNote }}</p><p>{{ workbenchCopy.cancelNote }}</p></section>
      </aside>
    </div>

    <BottomSheet v-if="mobileSummaryOpen" :open="mobileSummaryOpen" :title="pageCopy.details" panel-class="appointment-bottom-sheet appointment-refined-sheet" :snap-point="mobileSummarySnapPoint" @close="closeMobileSummary" @update:snap-point="mobileSummarySnapPoint = $event">
      <div v-if="message" class="appointment-result" role="status"><CircleCheck aria-hidden="true" /><div><h2>{{ workbenchCopy.submitted }}</h2><p>{{ message }}</p><p>{{ bookingNo }}</p><RouterLink to="/profile">{{ locale === 'en-US' ? 'View my bookings' : '查看我的预约' }}<ArrowRight aria-hidden="true" /></RouterLink></div></div>
      <InlineStatus v-if="submitError" data-submit-error kind="error" :message="submitError" />
      <form class="appointment-details" @submit.prevent="submit">
        <p v-if="selectedSlot" class="appointment-sheet-date"><Calendar aria-hidden="true" />{{ selectedSlot.visitDate }}<span>{{ selectedSlot.startTime.slice(0,5) }} – {{ selectedSlot.endTime.slice(0,5) }}</span></p>
        <div class="appointment-party">
          <div><label for="appointment-mobile-visitors">{{ pageCopy.visitors }}</label><p>{{ workbenchCopy.partyNote }}</p></div>
          <div class="appointment-quantity">
            <button type="button" :aria-label="pageCopy.decreaseVisitors" :disabled="formLocked || form.visitorCount <= minimumVisitorCount" @click="adjustVisitorCount(-1)"><Minus aria-hidden="true" /></button>
            <input id="appointment-mobile-visitors" class="visitor-stepper__input" v-model.number="form.visitorCount" :disabled="formLocked" type="number" :min="minimumVisitorCount" :max="maximumVisitorCount" :aria-label="pageCopy.visitors" required @blur="normalizeVisitorCount" />
            <button type="button" :aria-label="pageCopy.increaseVisitors" :disabled="formLocked || form.visitorCount >= maximumVisitorCount" @click="adjustVisitorCount(1)"><Plus aria-hidden="true" /></button>
          </div>
        </div>
        <p v-if="insufficientCapacity" class="appointment-field-error" role="status">{{ workbenchCopy.shortage }}</p>
        <AppointmentContactFields v-model:contact-name="form.contactName" v-model:contact-phone="form.contactPhone" v-model:contact-email="form.contactEmail" v-model:notes="form.notes" :locked="formLocked" :errors="fieldErrors" />
        <p class="appointment-inline-note">{{ workbenchCopy.reviewNote }}</p>
        <FluidButton type="submit" block :disabled="!form.slotId || loading || submitting || Boolean(message)" :loading="submitting">{{ pageCopy.confirm }}<ArrowRight aria-hidden="true" /></FluidButton>
        <p class="appointment-privacy">{{ pageCopy.privacy }}</p>
      </form>
    </BottomSheet>
  </section>
</template>
