<script setup lang="ts">
import '../assets/route-admin-legacy.css'
import '../assets/task-pages.css'
import '../assets/control-surface-polish.css'
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { ElOption, ElSelect } from 'element-plus'
import 'element-plus/es/components/select/style/css'
import 'element-plus/es/components/option/style/css'
import { apiGet, apiRequest, type ContentPage } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import AdminShell from '../components/AdminShell.vue'
import FluidButton from '../components/FluidButton.vue'
import InlineStatus from '../components/InlineStatus.vue'
import StatusBadge from '../components/StatusBadge.vue'
import AdminTabs from '../components/AdminTabs.vue'
import AdminActionButton from '../components/AdminActionButton.vue'
import AdminConfirmDialog from '../components/AdminConfirmDialog.vue'
import { useUnsavedChanges } from '../composables/useUnsavedChanges'

type Tab = 'users' | 'slots' | 'appointments' | 'products' | 'orders' | 'exhibits' | 'logs'
interface User { id:number; username:string; nickname:string; email:string; status:string; roles:string[] }
interface Appointment { id:number; status:string; contactName:string; contactPhone:string; visitDate:string; startTime:string; endTime:string; visitorCount:number }
interface Product { id:number; name:string; sku:string; slug:string; summary:string; description:string; price:string; stockQuantity:number; lockedStock:number; coverImageUrl:string; status:string; deleted:boolean }
interface Order { id:number; orderNo:string; status:string; payableAmount:string; notificationEmail:string; createdAt:string }
interface Exhibit { id:number; title:string; slug:string; artifactTitle:string; status:string; deleted:boolean; artifactPublished:boolean; displayNo:string; sourceCredit:string; sourceUrl:string; licenseLabel:string; collectionLocation:string }
interface Slot { id:number; visitDate:string; startTime:string; endTime:string; capacity:number; reservedPeople:number; status:string }
interface Artifact { id:number; title:string; status:string; deleted:boolean }
interface OperationLog { id:number; actorUsername:string; module:string; action:string; targetType:string; targetId:string; createdAt:string }

const auth = useAuthStore(); const router = useRouter(); const tab = ref<Tab>('users')
const operationTabs = [
  { value: 'users', label: '用户' },
  { value: 'slots', label: '预约时段' },
  { value: 'appointments', label: '预约' },
  { value: 'products', label: '商品' },
  { value: 'orders', label: '订单' },
  { value: 'exhibits', label: '3D 展项' },
  { value: 'logs', label: '操作日志' },
]
const listState = reactive(Object.fromEntries(operationTabs.map(item => [item.value,
  { page: 1, totalPages: 1, total: 0, keyword: '', status: '', loading: false, error: '', sequence: 0 },
])) as Record<Tab, { page: number; totalPages: number; total: number; keyword: string; status: string; loading: boolean; error: string; sequence: number }>)
const loading = computed(() => listState[tab.value].loading); const error = ref(''); const message = ref('')
const page = computed({ get: () => listState[tab.value].page, set: value => { listState[tab.value].page = value } })
const totalPages = computed(() => listState[tab.value].totalPages)
const keyword = computed({ get: () => listState[tab.value].keyword, set: value => { listState[tab.value].keyword = value } })
const statusFilter = computed({ get: () => listState[tab.value].status, set: value => { listState[tab.value].status = value } })
const editingProductId = ref<number | null>(null)
const editingProduct = ref<Product | null>(null)
const editProductBaseline = ref('')
const createFormElement = ref<HTMLFormElement | null>(null)
const editFormElement = ref<HTMLFormElement | HTMLFormElement[] | null>(null)
const pendingActions = ref<string[]>([])
const confirmationPending = ref(false)
const confirmation = ref<{ title: string; message: string; confirmLabel: string; run: () => void | Promise<void> } | null>(null)
const summary = ref<{ userCount: number; appointmentCount: number; orderCount: number; salesAmount: string } | null>(null)
const users = ref<User[]>([]); const slots = ref<Slot[]>([]); const appointments = ref<Appointment[]>([]); const products = ref<Product[]>([]); const orders = ref<Order[]>([]); const exhibits = ref<Exhibit[]>([]); const artifacts=ref<Artifact[]>([]); const logs=ref<OperationLog[]>([])
const userForm=reactive({username:'',password:'',nickname:'',email:'',phone:''}); const slotForm=reactive({visitDate:'',startTime:'09:00',endTime:'11:00',capacity:30,status:'OPEN'})
const createProductForm=reactive({sku:'',name:'',slug:'',summary:'',description:'',price:'',stockQuantity:0,coverImageUrl:''}); const editProductForm=reactive({sku:'',name:'',slug:'',summary:'',description:'',price:'',stockQuantity:0,coverImageUrl:''}); const exhibitForm=reactive({artifactId:undefined as number|undefined,title:'',slug:'',summary:'',description:'',modelUrl:'',modelSourceRef:'',modelFormat:'GLB',modelSizeBytes:1,mobileModelUrl:'',mobileModelSizeBytes:null as number|null,coverImageUrl:'',coverAssetRef:'',displayNo:'',sourceCredit:'',sourceUrl:'',licenseLabel:'',collectionLocation:''})
const activeItems = computed(() => ({ users:users.value, slots:slots.value, appointments:appointments.value, products:products.value, orders:orders.value, exhibits:exhibits.value, logs:logs.value })[tab.value])
const defaults = { users: { ...userForm }, slots: { ...slotForm }, products: { ...createProductForm }, exhibits: { ...exhibitForm } }
const activeDraft = computed(() => ({
  create: ({ users: userForm, slots: slotForm, products: createProductForm, exhibits: exhibitForm } as Partial<Record<Tab, unknown>>)[tab.value] ?? null,
  edit: tab.value === 'products' && editingProductId.value !== null ? editProductForm : null,
}))
const unsaved = useUnsavedChanges({
  value: () => activeDraft.value,
  dirty: () => {
    const initial = (defaults as Partial<Record<Tab, unknown>>)[tab.value] ?? null
    return JSON.stringify(activeDraft.value.create) !== JSON.stringify(initial)
      || (tab.value === 'products' && editingProductId.value !== null && JSON.stringify(editProductForm) !== editProductBaseline.value)
  },
  save: saveActiveDraft, discard: resetActiveDraft, blocked: () => pendingActions.value.length > 0,
})
let loadSequence = 0
let loadController: AbortController | undefined

function queryString(target: Tab) {
  const state = listState[target]
  const query = new URLSearchParams({ page: String(state.page), size: '20' })
  if (target === 'users' && state.keyword.trim()) query.set('keyword', state.keyword.trim())
  if (['appointments', 'products', 'orders'].includes(target) && state.status) query.set('status', state.status)
  if (target === 'products') query.set('deleted', 'all')
  if (target === 'exhibits') query.set('deleted', 'false')
  return query.toString()
}

async function load() {
  const target = tab.value
  const query = queryString(target)
  const state = listState[target]
  const sequence = ++loadSequence
  state.sequence = sequence
  state.loading = true; state.error = ''
  loadController?.abort()
  const controller = new AbortController()
  loadController = controller
  try {
    await auth.initialize()
    if (sequence !== loadSequence) return
    if (!auth.isAdmin) { await router.replace('/login'); return }
    const token = auth.token
    const options = { signal: controller.signal }
    const endpoint = target === 'slots' ? 'appointment-slots' : target === 'logs' ? 'operation-logs' : target
    const [data, overview, artifactData] = await Promise.all([
      apiGet<ContentPage<User | Slot | Appointment | Product | Order | Exhibit | OperationLog>>(`/admin/${endpoint}?${query}`, token, options),
      apiGet<NonNullable<typeof summary.value>>('/admin/dashboard/summary', token, options),
      target === 'exhibits' ? apiGet<ContentPage<Artifact>>('/admin/artifacts?page=1&size=100&deleted=false', token, options) : Promise.resolve(null),
    ])
    if (sequence !== loadSequence) return
    if (state.page > Math.max(1, data.totalPages)) { state.page = Math.max(1, data.totalPages); await load(); return }
    if (target === 'users') users.value = data.items as User[]
    else if (target === 'slots') slots.value = data.items as Slot[]
    else if (target === 'appointments') appointments.value = data.items as Appointment[]
    else if (target === 'products') products.value = data.items as Product[]
    else if (target === 'orders') orders.value = data.items as Order[]
    else if (target === 'exhibits') exhibits.value = data.items as Exhibit[]
    else logs.value = data.items as OperationLog[]
    if (artifactData) artifacts.value = artifactData.items
    state.totalPages = Math.max(1, data.totalPages); state.total = data.total
    summary.value = overview
  } catch (reason) {
    if (sequence === loadSequence) state.error = reason instanceof Error ? reason.message : '后台运营数据加载失败。'
  } finally { if (state.sequence === sequence) state.loading = false }
}
function mutationKey(path: string, method: string) {
  const resource = path.match(/^\/admin\/(users|appointments|products|orders|exhibits)\/(\d+)/)
  return resource ? `${resource[1]}:${resource[2]}` : `${method}:${path}`
}
function requiresConfirmation(path: string, method: string, body?: unknown) {
  const disableUser = method === 'PATCH' && /^\/admin\/users\/\d+\/status$/.test(path) && (body as { status?: string } | undefined)?.status === 'DISABLED'
  return method === 'DELETE' || disableUser || /\/withdraw$|\/cancel$|\/complete$|\/off-shelf$/.test(path)
}
async function action(path:string, method:'POST'|'PATCH'|'DELETE'='POST', body?:unknown, success='操作已完成。', confirmed = false): Promise<boolean> {
  const key = mutationKey(path, method)
  if (pendingActions.value.includes(key)) return false
  if (!confirmed && requiresConfirmation(path, method, body)) {
    confirmation.value = { title: '确认这项后台操作？', message: describeAction(path, method), confirmLabel: '确认操作', run: () => action(path, method, body, success, true).then(() => undefined) }
    return false
  }
  pendingActions.value = [...pendingActions.value, key]
  error.value=''; message.value=''
  try { await apiRequest(path, method, body, auth.token); message.value=success; await load(); return true }
  catch (reason) { error.value=reason instanceof Error ? reason.message : '操作失败。'; return false }
  finally { pendingActions.value = pendingActions.value.filter((item) => item !== key) }
}
function isPending(path: string, method:'POST'|'PATCH'|'DELETE'='POST') { return pendingActions.value.includes(mutationKey(path, method)) }
function switchTab(next:Tab) {
  if (next === tab.value) return
  void unsaved.attempt(async () => {
    resetActiveDraft(); tab.value = next; error.value = ''; message.value = ''; unsaved.markClean(); await load()
  })
}
function refreshList() { page.value = 1; void load() }
function clearFilters() { keyword.value = ''; statusFilter.value = ''; refreshList() }
function goToPage(next: number) { if (loading.value || next < 1 || next > totalPages.value || next === page.value) return; void unsaved.attempt(async () => { page.value = next; await load() }) }
async function createUser(): Promise<boolean> {
  if (!validateCreateForm()) return false
  if (!await action('/admin/users','POST',{...userForm},'普通用户账号已创建。')) return false
  Object.assign(userForm, defaults.users); unsaved.markClean(); return true
}
async function createSlot(): Promise<boolean> {
  if (!validateCreateForm()) return false
  if (!await action('/admin/appointment-slots','POST',{...slotForm,capacity:Number(slotForm.capacity)},'预约时段已创建。')) return false
  Object.assign(slotForm, defaults.slots); unsaved.markClean(); return true
}
async function createProduct(): Promise<boolean> {
  if (!validateCreateForm()) return false
  if (!await action('/admin/products','POST',{...createProductForm,price:Number(createProductForm.price),stockQuantity:Number(createProductForm.stockQuantity)},'商品草稿已创建。')) return false
  Object.assign(createProductForm, defaults.products); return true
}
function beginProductEdit(item: Product) {
  void unsaved.attempt(() => {
    editingProductId.value = item.id; editingProduct.value = item
    Object.assign(editProductForm, { sku:item.sku, name:item.name, slug:item.slug, summary:item.summary ?? '', description:item.description ?? '', price:item.price, stockQuantity:item.stockQuantity, coverImageUrl:item.coverImageUrl ?? '' })
    editProductBaseline.value = JSON.stringify(editProductForm); unsaved.markClean()
  })
}
async function saveProduct(item: Product): Promise<boolean> {
  const element = Array.isArray(editFormElement.value) ? editFormElement.value[0] : editFormElement.value
  if (element && !element.reportValidity()) return false
  if (!await action(`/admin/products/${item.id}`,'PATCH',{...editProductForm,price:Number(editProductForm.price),stockQuantity:Number(editProductForm.stockQuantity)},'商品信息已更新。')) return false
  editingProductId.value = null; editingProduct.value = null; return true
}
async function createExhibit(): Promise<boolean> {
  if (!validateCreateForm()) return false
  if (!artifacts.value.some(artifact => artifact.id === exhibitForm.artifactId && !artifact.deleted)) {
    error.value = '请选择关联文物后再创建展项。'
    createFormElement.value?.querySelector<HTMLInputElement>('[role="combobox"]')?.focus()
    return false
  }
  const mobileModelUrl=exhibitForm.mobileModelUrl.trim()||null
  const mobileModelSizeBytes=exhibitForm.mobileModelSizeBytes ? Number(exhibitForm.mobileModelSizeBytes) : null
  if (!await action('/admin/exhibits','POST',{...exhibitForm,artifactId:Number(exhibitForm.artifactId),modelSizeBytes:Number(exhibitForm.modelSizeBytes),mobileModelUrl,mobileModelSizeBytes},'3D 展项草稿已创建。')) return false
  Object.assign(exhibitForm, defaults.exhibits); unsaved.markClean(); return true
}
function cancelProductEdit() {
  void unsaved.attempt(() => { editingProductId.value = null; editingProduct.value = null; unsaved.markClean() })
}
function validateCreateForm(): boolean {
  if (createFormElement.value && !createFormElement.value.reportValidity()) {
    error.value = '请补全必填项后保存。'
    return false
  }
  return true
}
function resetActiveDraft() {
  if (tab.value === 'users') Object.assign(userForm, defaults.users)
  if (tab.value === 'slots') Object.assign(slotForm, defaults.slots)
  if (tab.value === 'products') { Object.assign(createProductForm, defaults.products); editingProductId.value = null; editingProduct.value = null }
  if (tab.value === 'exhibits') Object.assign(exhibitForm, defaults.exhibits)
  unsaved.markClean()
}
async function saveActiveDraft(): Promise<boolean> {
  if (tab.value === 'users') return createUser()
  if (tab.value === 'slots') return createSlot()
  if (tab.value === 'exhibits') return createExhibit()
  if (tab.value === 'products') {
    if (JSON.stringify(createProductForm) !== JSON.stringify(defaults.products) && !await createProduct()) return false
    if (editingProduct.value && JSON.stringify(editProductForm) !== editProductBaseline.value && !await saveProduct(editingProduct.value)) return false
  }
  return true
}
function describeAction(path: string, method: string): string {
  const match = path.match(/^\/admin\/(users|appointments|products|orders|exhibits)\/(\d+)/)
  const id = Number(match?.[2])
  const resource = match?.[1]
  let name = `记录 #${id}`
  if (resource === 'users') { const item = users.value.find(value => value.id === id); if (item) name = `${item.nickname}（@${item.username}）` }
  if (resource === 'appointments') { const item = appointments.value.find(value => value.id === id); if (item) name = `${item.contactName} · ${item.visitDate} ${item.startTime}` }
  if (resource === 'products') name = products.value.find(value => value.id === id)?.name ?? name
  if (resource === 'orders') name = orders.value.find(value => value.id === id)?.orderNo ?? name
  if (resource === 'exhibits') name = exhibits.value.find(value => value.id === id)?.title ?? name
  const consequence = method === 'DELETE' ? '将进入回收站，前台不再展示'
    : path.endsWith('/status') ? '将无法登录，现有会话也会失效'
    : path.endsWith('/cancel') ? '的预约将取消，并释放已占用的名额'
    : path.endsWith('/complete') ? '将标记为已完成，不能再从当前列表处理'
    : '将从前台撤下，已保存的内容会保留'
  return `${name}${consequence}。`
}
async function confirmAction() {
  const current = confirmation.value
  if (!current || confirmationPending.value) return
  confirmationPending.value = true
  try { await current.run(); confirmation.value = null }
  finally { confirmationPending.value = false }
}
onMounted(load)
onBeforeUnmount(() => { ++loadSequence; loadController?.abort() })
</script>

<template>
  <AdminShell v-if="auth.isAdmin" title="运营管理" description="管理用户、预约、商品、订单、数字展项与操作记录。" section="operations">
    <template #header-actions><RouterLink class="admin-header-link" to="/admin">查看内容概览 →</RouterLink></template>
    <InlineStatus :message="message" kind="success" /><InlineStatus :message="error || listState[tab].error" kind="error" />
    <section v-if="summary" class="dashboard-summary dashboard-summary--operations" data-glass="light" aria-label="运营概览">
      <article><span>用户总数</span><strong>{{ summary.userCount }}</strong><small>人</small></article>
      <article><span>预约记录</span><strong>{{ summary.appointmentCount }}</strong><small>条</small></article>
      <article><span>订单总数</span><strong>{{ summary.orderCount }}</strong><small>单</small></article>
      <article><span>累计销售额</span><strong>¥ {{ summary.salesAmount }}</strong><small>模拟支付</small></article>
    </section>
    <div class="admin-operations-grid">
      <section class="admin-operations-main">
        <div class="admin-toolbar admin-toolbar--operations">
          <AdminTabs :model-value="tab" :tabs="operationTabs" label="运营模块" panel-id="admin-operations-panel" @update:model-value="switchTab($event as Tab)" />
          <div class="admin-list-filters">
            <label class="admin-filter-field admin-filter-field--search">
              <span class="admin-filter-field__label">查找用户</span>
              <input v-model.trim="keyword" type="search" placeholder="搜索用户" :disabled="tab !== 'users'" @keyup.enter="refreshList" />
            </label>
            <label class="admin-filter-field">
              <span class="admin-filter-field__label">状态</span>
              <select v-model="statusFilter" :disabled="!['appointments','products','orders'].includes(tab)" @change="refreshList">
                <option value="">全部状态</option>
                <option v-if="tab==='appointments'" value="PENDING">待确认</option>
                <option v-if="tab==='appointments'" value="CONFIRMED">已确认</option>
                <option v-if="tab==='appointments' || tab==='orders'" value="CANCELLED">已取消</option>
                <option v-if="tab==='appointments' || tab==='orders'" value="COMPLETED">已完成</option>
                <option v-if="tab==='products'" value="DRAFT">草稿</option>
                <option v-if="tab==='products'" value="PUBLISHED">已上架</option>
                <option v-if="tab==='products'" value="WITHDRAWN">已下架</option>
                <option v-if="tab==='orders'" value="PAID">已支付</option>
                <option v-if="tab==='orders'" value="PENDING_PAYMENT">待支付</option>
              </select>
            </label>
            <button class="admin-text-button" type="button" @click="clearFilters">清除</button>
          </div>
          <strong class="admin-count">{{ listState[tab].total }} 项</strong>
        </div>
        <div v-if="loading" class="state-panel">正在加载运营数据…</div>
        <div v-else-if="listState[tab].error" class="state-panel state-panel--action"><InlineStatus kind="error" :message="listState[tab].error" /><button class="state-panel__action" type="button" @click="load">重试</button></div>
        <section v-else id="admin-operations-panel" class="admin-operation-panel" data-glass="light" data-glass-controls role="tabpanel" :aria-labelledby="`admin-operations-panel-tab-${tab}`" tabindex="0">
      <form ref="createFormElement" :inert="pendingActions.length > 0" v-if="tab==='users'" class="admin-inline-form" @submit.prevent="createUser"><div class="admin-form-heading"><span>CREATE USER</span><h2>创建普通用户</h2></div><label><span>用户名</span><input v-model.trim="userForm.username" required pattern="[A-Za-z0-9_]{3,32}" autocomplete="off"/></label><label><span>初始密码 <em>至少 8 位</em></span><input v-model="userForm.password" type="password" minlength="8" required autocomplete="new-password"/></label><label><span>昵称</span><input v-model.trim="userForm.nickname" required/></label><label><span>邮箱 <em>可选</em></span><input v-model.trim="userForm.email" type="email"/></label><label><span>手机号 <em>可选</em></span><input v-model.trim="userForm.phone"/></label><FluidButton type="submit" :loading="isPending('/admin/users')">创建账号</FluidButton></form>
      <form ref="createFormElement" :inert="pendingActions.length > 0" v-else-if="tab==='slots'" class="admin-inline-form" @submit.prevent="createSlot"><div class="admin-form-heading"><span>VISIT SLOT</span><h2>创建预约时段</h2></div><label><span>参观日期</span><input v-model="slotForm.visitDate" type="date" required/></label><label><span>开始时间</span><input v-model="slotForm.startTime" type="time" required/></label><label><span>结束时间</span><input v-model="slotForm.endTime" type="time" required/></label><label><span>可预约人数</span><input v-model.number="slotForm.capacity" type="number" min="1" max="500" required/></label><label><span>初始状态</span><el-select v-model="slotForm.status" popper-class="museum-select-popper"><el-option label="开放" value="OPEN"/><el-option label="关闭" value="CLOSED"/><el-option label="取消" value="CANCELLED"/></el-select></label><FluidButton type="submit" :loading="isPending('/admin/appointment-slots')">创建时段</FluidButton></form>
      <form ref="createFormElement" :inert="pendingActions.length > 0" v-else-if="tab==='products'" class="admin-inline-form admin-inline-form--wide" @submit.prevent="createProduct"><div class="admin-form-heading"><span>STORE ITEM</span><h2>创建商品草稿</h2></div><label><span>SKU</span><input v-model.trim="createProductForm.sku" required/></label><label><span>商品名称</span><input v-model.trim="createProductForm.name" required/></label><label><span>URL 标识</span><input v-model.trim="createProductForm.slug" pattern="[a-z0-9-]{3,180}" required/></label><label><span>价格</span><input v-model.number="createProductForm.price" type="number" min="0.01" step="0.01" required/></label><label><span>库存</span><input v-model.number="createProductForm.stockQuantity" type="number" min="0" required/></label><label><span>封面路径 <em>可选</em></span><input v-model.trim="createProductForm.coverImageUrl"/></label><label class="admin-field-wide"><span>摘要 <em>可选</em></span><input v-model.trim="createProductForm.summary"/></label><FluidButton type="submit" :loading="isPending('/admin/products')">创建商品</FluidButton></form>
      <form ref="createFormElement" :inert="pendingActions.length > 0" v-else-if="tab==='exhibits'" class="admin-inline-form admin-inline-form--wide" @submit.prevent="createExhibit"><div class="admin-form-heading"><span>DIGITAL EXHIBIT</span><h2>创建 3D 展项草稿</h2></div><label><span>关联文物</span><el-select v-model="exhibitForm.artifactId" popper-class="museum-select-popper" placeholder="请选择关联文物" required><el-option v-for="artifact in artifacts.filter(x=>!x.deleted)" :key="artifact.id" :label="artifact.title" :value="artifact.id" /></el-select></label><label><span>展项名称</span><input v-model.trim="exhibitForm.title" required/></label><label><span>显示编号 <em>可选</em></span><input v-model.trim="exhibitForm.displayNo" maxlength="32" /></label><label><span>URL 标识</span><input v-model.trim="exhibitForm.slug" pattern="[a-z0-9-]{3,180}" required/></label><label><span>模型 Web 路径</span><input v-model.trim="exhibitForm.modelUrl" required/></label><label><span>原创资产编号</span><input v-model.trim="exhibitForm.modelSourceRef" required/></label><label><span>模型字节数</span><input v-model.number="exhibitForm.modelSizeBytes" type="number" min="1" required/></label><label><span>移动模型路径 <em>可选，需与大小同时填写</em></span><input v-model.trim="exhibitForm.mobileModelUrl" maxlength="500"/></label><label><span>移动模型字节数 <em>可选</em></span><input v-model.number="exhibitForm.mobileModelSizeBytes" type="number" min="1"/></label><label><span>来源说明 <em>可选</em></span><input v-model.trim="exhibitForm.sourceCredit" maxlength="255" /></label><label><span>来源链接 <em>可选</em></span><input v-model.trim="exhibitForm.sourceUrl" type="url" /></label><label><span>许可说明 <em>可选</em></span><input v-model.trim="exhibitForm.licenseLabel" maxlength="128" /></label><label><span>展示位置 <em>可选</em></span><input v-model.trim="exhibitForm.collectionLocation" maxlength="255" /></label><label><span>封面路径 <em>可选</em></span><input v-model.trim="exhibitForm.coverImageUrl"/></label><label class="admin-field-wide"><span>摘要 <em>可选</em></span><input v-model.trim="exhibitForm.summary"/></label><FluidButton type="submit" :loading="isPending('/admin/exhibits')">创建展项</FluidButton></form>

      <div v-if="activeItems.length===0" class="state-panel">当前模块暂无记录。</div>
      <div v-else class="admin-list admin-list--operations" data-glass-collection>
        <article v-for="item in users" v-if="tab==='users'" :key="item.id"><div class="admin-record-copy"><div class="admin-record-meta"><StatusBadge :status="item.status"/><span>{{ item.roles.join('、') }}</span></div><h3>{{ item.nickname }} <small>@{{ item.username }}</small></h3><p>{{ item.email || '未绑定邮箱' }}</p></div><div class="admin-actions"><AdminActionButton v-if="!item.roles.includes('ADMIN') && item.status==='ACTIVE'" :disabled="isPending('/admin/users/' + item.id + '/status', 'PATCH')" action="disable" @click="action(`/admin/users/${item.id}/status`,'PATCH',{status:'DISABLED'},'用户已禁用。')">禁用</AdminActionButton><AdminActionButton v-if="!item.roles.includes('ADMIN') && item.status==='DISABLED'" :disabled="isPending('/admin/users/' + item.id + '/status', 'PATCH')" action="restore" @click="action(`/admin/users/${item.id}/status`,'PATCH',{status:'ACTIVE'},'用户已恢复。')">恢复</AdminActionButton><AdminActionButton v-if="item.email" :disabled="isPending('/admin/users/' + item.id + '/reset-password')" action="email" @click="action(`/admin/users/${item.id}/reset-password`,'POST',undefined,'密码重置邮件已提交发送。')">发送重置邮件</AdminActionButton></div></article>
        <article v-for="item in slots" v-else-if="tab==='slots'" :key="item.id"><div class="admin-record-copy"><div class="admin-record-meta"><StatusBadge :status="item.status"/><span>已预约 {{ item.reservedPeople }}/{{ item.capacity }}</span></div><h3>{{ item.visitDate }}</h3><p>{{ item.startTime }}–{{ item.endTime }}</p></div></article>
        <article v-for="item in appointments" v-else-if="tab==='appointments'" :key="item.id"><div class="admin-record-copy"><div class="admin-record-meta"><StatusBadge :status="item.status"/><span>{{ item.visitDate }} {{ item.startTime }}–{{ item.endTime }}</span></div><h3>{{ item.contactName }} · {{ item.visitorCount }} 人</h3><p>{{ item.contactPhone }}</p></div><div class="admin-actions"><AdminActionButton v-if="item.status==='PENDING'" :disabled="isPending('/admin/appointments/' + item.id + '/confirm')" action="confirm" @click="action(`/admin/appointments/${item.id}/confirm`,'POST',undefined,'预约已确认，已记录通知。')">确认</AdminActionButton><AdminActionButton v-if="item.status==='PENDING'||item.status==='CONFIRMED'" :disabled="isPending('/admin/appointments/' + item.id + '/cancel')" action="cancel" @click="action(`/admin/appointments/${item.id}/cancel`,'POST',{reason:'管理员运营取消'},'预约已取消。')">取消</AdminActionButton><AdminActionButton v-if="item.status==='CONFIRMED'" :disabled="isPending('/admin/appointments/' + item.id + '/complete')" action="complete" @click="action(`/admin/appointments/${item.id}/complete`,'POST',undefined,'预约已标记完成。')">标记完成</AdminActionButton></div></article>
        <article v-for="item in products" v-else-if="tab==='products'" :key="item.id"><div class="admin-record-copy"><div class="admin-record-meta"><StatusBadge :status="item.deleted?'DISABLED':item.status"/><span>{{ item.sku }}</span></div><h3>{{ item.name }} · ¥ {{ item.price }}</h3><p>库存 {{ item.stockQuantity }}，已锁定 {{ item.lockedStock }}，可售 {{ Math.max(0, item.stockQuantity - item.lockedStock) }}</p><form ref="editFormElement" :inert="pendingActions.length > 0" v-if="editingProductId === item.id" class="admin-product-edit" @submit.prevent="saveProduct(item)"><label><span>SKU</span><input v-model.trim="editProductForm.sku" required /></label><label><span>名称</span><input v-model.trim="editProductForm.name" required /></label><label><span>URL 标识</span><input v-model.trim="editProductForm.slug" pattern="[a-z0-9-]{3,180}" required /></label><label><span>价格</span><input v-model.number="editProductForm.price" type="number" min="0.01" step="0.01" required /></label><label><span>库存</span><input v-model.number="editProductForm.stockQuantity" type="number" :min="item.lockedStock" required /></label><label><span>封面路径</span><input v-model.trim="editProductForm.coverImageUrl" /></label><label class="admin-field-wide"><span>摘要</span><input v-model.trim="editProductForm.summary" /></label><label class="admin-field-wide"><span>描述</span><textarea v-model.trim="editProductForm.description" rows="3"></textarea></label><div class="admin-product-edit__actions"><FluidButton size="sm" type="submit" :loading="isPending('/admin/products/' + item.id, 'PATCH')">保存</FluidButton><FluidButton size="sm" type="button" variant="secondary" :disabled="isPending('/admin/products/' + item.id, 'PATCH')" @click="cancelProductEdit">取消</FluidButton></div></form></div><div class="admin-actions"><AdminActionButton v-if="!item.deleted" action="edit" @click="beginProductEdit(item)">编辑</AdminActionButton><AdminActionButton v-if="!item.deleted && item.status!=='PUBLISHED'" action="shelf" :disabled="isPending('/admin/products/' + item.id + '/on-shelf')" @click="action(`/admin/products/${item.id}/on-shelf`)">上架</AdminActionButton><AdminActionButton v-if="!item.deleted && item.status==='PUBLISHED'" action="unshelf" :disabled="isPending('/admin/products/' + item.id + '/off-shelf')" @click="action(`/admin/products/${item.id}/off-shelf`)">下架</AdminActionButton><AdminActionButton v-if="!item.deleted" action="delete" :disabled="isPending('/admin/products/' + item.id, 'DELETE')" @click="action(`/admin/products/${item.id}`,'DELETE')">删除</AdminActionButton><AdminActionButton v-if="item.deleted" action="restore" :disabled="isPending('/admin/products/' + item.id + '/restore')" @click="action(`/admin/products/${item.id}/restore`)">恢复</AdminActionButton></div></article>
        <article v-for="item in orders" v-else-if="tab==='orders'" :key="item.id"><div class="admin-record-copy"><div class="admin-record-meta"><StatusBadge :status="item.status"/><span>{{ item.orderNo }}</span></div><h3>¥ {{ item.payableAmount }}</h3><p>{{ item.notificationEmail }}</p></div><div class="admin-actions"><AdminActionButton v-if="item.status==='PAID'" :disabled="isPending('/admin/orders/' + item.id + '/complete')" action="complete" @click="action(`/admin/orders/${item.id}/complete`,'POST',undefined,'订单已标记完成。')">标记完成</AdminActionButton></div></article>
        <article v-for="item in exhibits" v-else-if="tab==='exhibits'" :key="item.id"><div class="admin-record-copy"><div class="admin-record-meta"><StatusBadge :status="item.deleted?'DISABLED':item.status"/><span>{{ item.artifactPublished?'关联文物已公开':'关联文物未公开' }}</span></div><h3>{{ item.title }}</h3><p>{{ item.artifactTitle }} · /exhibits/{{ item.slug }}</p></div><div class="admin-actions"><AdminActionButton v-if="!item.deleted && item.status!=='PUBLISHED'" :disabled="isPending('/admin/exhibits/' + item.id + '/publish')" action="publish" @click="action(`/admin/exhibits/${item.id}/publish`)">发布</AdminActionButton><AdminActionButton v-if="!item.deleted && item.status==='PUBLISHED'" :disabled="isPending('/admin/exhibits/' + item.id + '/withdraw')" action="withdraw" @click="action(`/admin/exhibits/${item.id}/withdraw`)">撤回</AdminActionButton><AdminActionButton v-if="!item.deleted" :disabled="isPending('/admin/exhibits/' + item.id, 'DELETE')" action="delete" @click="action(`/admin/exhibits/${item.id}`,'DELETE')">删除</AdminActionButton><AdminActionButton v-if="item.deleted" :disabled="isPending('/admin/exhibits/' + item.id + '/restore')" action="restore" @click="action(`/admin/exhibits/${item.id}/restore`)">恢复</AdminActionButton></div></article>
        <article v-for="item in logs" v-else :key="item.id"><div class="admin-record-copy"><div class="admin-record-meta"><span>{{ item.createdAt }}</span><span>{{ item.module }} · {{ item.action }}</span></div><h3>{{ item.actorUsername }}</h3><p>{{ item.targetType }} #{{ item.targetId || '—' }}</p></div></article>
        <nav v-if="totalPages > 1" class="admin-pagination" aria-label="后台列表分页"><button type="button" :disabled="loading || page === 1" @click="goToPage(page - 1)">上一页</button><span>{{ page }} / {{ totalPages }}</span><button type="button" :disabled="loading || page === totalPages" @click="goToPage(page + 1)">下一页</button></nav>
      </div>
        </section>
      </section>
      <aside class="admin-insights" data-glass="light" aria-label="运营趋势">
        <div class="admin-insights__header"><strong>03</strong><span>运营态势</span></div>
        <article><span>待处理预约</span><strong>{{ appointments.filter(item => item.status === 'PENDING').length }}</strong><small>当前列表中的待确认记录</small><div class="admin-insight__signal admin-insight__signal--warning" aria-hidden="true"><i></i></div></article>
        <article><span>库存预警</span><strong>{{ products.filter(item => item.stockQuantity - item.lockedStock < 20).length }}</strong><small>可售库存低于 20 件</small><div class="admin-insight__signal admin-insight__signal--danger" aria-hidden="true"><i></i></div></article>
        <article><span>待处理订单</span><strong>{{ orders.filter(item => item.status === 'PAID').length }}</strong><small>已支付、待运营完成</small><div class="admin-insight__signal admin-insight__signal--success" aria-hidden="true"><i></i></div></article>
      </aside>
    </div>
      <AdminConfirmDialog v-if="confirmation" :open="Boolean(confirmation)" :title="confirmation.title" :message="confirmation.message" :confirm-label="confirmation.confirmLabel" :pending="confirmationPending" @confirm="confirmAction" @cancel="confirmation = null" />
    <AdminConfirmDialog v-if="unsaved.open.value" :open="unsaved.open.value" title="还有未保存的表单" message="保存当前表单后继续，或放弃本次修改。" :error="error" confirm-label="保存并继续" secondary-label="放弃修改" cancel-label="继续编辑" :pending="unsaved.pending.value" @confirm="unsaved.decide('save')" @secondary="unsaved.decide('discard')" @cancel="unsaved.decide('continue')" />
  </AdminShell>
</template>
