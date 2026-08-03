<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
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

type Tab = 'users' | 'slots' | 'appointments' | 'products' | 'orders' | 'exhibits' | 'logs'
interface User { id:number; username:string; nickname:string; email:string; status:string; roles:string[] }
interface Appointment { id:number; status:string; contactName:string; contactPhone:string; visitDate:string; startTime:string; endTime:string; visitorCount:number }
interface Product { id:number; name:string; sku:string; price:string; stockQuantity:number; lockedStock:number; status:string; deleted:boolean }
interface Order { id:number; orderNo:string; status:string; payableAmount:string; notificationEmail:string; createdAt:string }
interface Exhibit { id:number; title:string; slug:string; artifactTitle:string; status:string; deleted:boolean; artifactPublished:boolean }
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
const loading = ref(false); const error = ref(''); const message = ref('')
const summary = ref<{ userCount: number; appointmentCount: number; orderCount: number; salesAmount: string } | null>(null)
const users = ref<User[]>([]); const slots = ref<Slot[]>([]); const appointments = ref<Appointment[]>([]); const products = ref<Product[]>([]); const orders = ref<Order[]>([]); const exhibits = ref<Exhibit[]>([]); const artifacts=ref<Artifact[]>([]); const logs=ref<OperationLog[]>([])
const userForm=reactive({username:'',password:'',nickname:'',email:'',phone:''}); const slotForm=reactive({visitDate:'',startTime:'09:00',endTime:'11:00',capacity:30,status:'OPEN'})
const productForm=reactive({sku:'',name:'',slug:'',summary:'',description:'',price:'',stockQuantity:0,coverImageUrl:''}); const exhibitForm=reactive({artifactId:0,title:'',slug:'',summary:'',description:'',modelUrl:'',modelSourceRef:'',modelFormat:'GLB',modelSizeBytes:1,coverImageUrl:'',coverAssetRef:''})
const activeItems = computed(() => ({ users:users.value, slots:slots.value, appointments:appointments.value, products:products.value, orders:orders.value, exhibits:exhibits.value, logs:logs.value })[tab.value])

async function load() {
  loading.value = true; error.value = ''
  try {
    await auth.initialize(); if (!auth.isAdmin) { await router.replace('/login'); return }
    const token = auth.token
    const [u,s,a,p,o,e,art,l,overview] = await Promise.all([
      apiGet<ContentPage<User>>('/admin/users?page=1&size=100', token), apiGet<ContentPage<Slot>>('/admin/appointment-slots?page=1&size=100', token),
      apiGet<ContentPage<Appointment>>('/admin/appointments?page=1&size=100', token), apiGet<Product[]>('/admin/products', token), apiGet<Order[]>('/admin/orders', token), apiGet<ContentPage<Exhibit>>('/admin/exhibits?page=1&size=100', token),
      apiGet<ContentPage<Artifact>>('/admin/artifacts?page=1&size=100', token),
      apiGet<ContentPage<OperationLog>>('/admin/operation-logs?page=1&size=100', token),
      apiGet<{ userCount: number; appointmentCount: number; orderCount: number; salesAmount: string }>('/admin/dashboard/summary', token),
    ])
    users.value=u.items; slots.value=s.items; appointments.value=a.items; products.value=p; orders.value=o; exhibits.value=e.items; artifacts.value=art.items; logs.value=l.items
    summary.value = overview
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '后台运营数据加载失败。' } finally { loading.value = false }
}
async function action(path:string, method:'POST'|'PATCH'|'DELETE'='POST', body?:unknown, success='操作已完成。') {
  error.value=''; message.value=''
  try { await apiRequest(path, method, body, auth.token); message.value=success; await load() }
  catch (reason) { error.value=reason instanceof Error ? reason.message : '操作失败。' }
}
function switchTab(next:Tab) { tab.value=next }
async function createUser(){ await action('/admin/users','POST',{...userForm},'普通用户账号已创建。'); Object.assign(userForm,{username:'',password:'',nickname:'',email:'',phone:''}) }
async function createSlot(){ await action('/admin/appointment-slots','POST',{...slotForm,capacity:Number(slotForm.capacity)},'预约时段已创建。') }
async function createProduct(){ await action('/admin/products','POST',{...productForm,price:Number(productForm.price),stockQuantity:Number(productForm.stockQuantity)},'商品草稿已创建。'); Object.assign(productForm,{sku:'',name:'',slug:'',summary:'',description:'',price:'',stockQuantity:0,coverImageUrl:''}) }
async function createExhibit(){ await action('/admin/exhibits','POST',{...exhibitForm,artifactId:Number(exhibitForm.artifactId),modelSizeBytes:Number(exhibitForm.modelSizeBytes)},'3D 展项草稿已创建。'); Object.assign(exhibitForm,{artifactId:0,title:'',slug:'',summary:'',description:'',modelUrl:'',modelSourceRef:'',modelFormat:'GLB',modelSizeBytes:1,coverImageUrl:'',coverAssetRef:''}) }
onMounted(load)
</script>

<template>
  <AdminShell v-if="auth.isAdmin" title="运营管理" description="管理用户、预约、商品、订单、数字展项与操作记录。" section="operations">
    <template #header-actions><RouterLink class="admin-header-link" to="/admin">查看内容概览 →</RouterLink></template>
    <InlineStatus :message="message" kind="success" /><InlineStatus :message="error" kind="error" />
    <section v-if="summary" class="dashboard-summary dashboard-summary--operations" aria-label="运营概览">
      <article><span>用户总数</span><strong>{{ summary.userCount }}</strong><small>人</small></article>
      <article><span>预约记录</span><strong>{{ summary.appointmentCount }}</strong><small>条</small></article>
      <article><span>订单总数</span><strong>{{ summary.orderCount }}</strong><small>单</small></article>
      <article><span>累计销售额</span><strong>¥ {{ summary.salesAmount }}</strong><small>模拟支付</small></article>
    </section>
    <div class="admin-operations-grid">
      <section class="admin-operations-main">
        <div class="admin-toolbar admin-toolbar--operations"><AdminTabs :model-value="tab" :tabs="operationTabs" label="运营模块" panel-id="admin-operations-panel" @update:model-value="switchTab($event as Tab)" /><strong class="admin-count">{{ activeItems.length }} 项</strong></div>
        <div v-if="loading" class="state-panel">正在加载运营数据…</div>
        <section v-else id="admin-operations-panel" class="admin-operation-panel" role="tabpanel" :aria-labelledby="`admin-operations-panel-tab-${tab}`" tabindex="0">
      <form v-if="tab==='users'" class="admin-inline-form" @submit.prevent="createUser"><div class="admin-form-heading"><span>CREATE USER</span><h2>创建普通用户</h2></div><label><span>用户名</span><input v-model.trim="userForm.username" required pattern="[A-Za-z0-9_]{3,32}" autocomplete="off"/></label><label><span>初始密码</span><input v-model="userForm.password" type="password" minlength="8" required autocomplete="new-password"/><small>至少 8 位</small></label><label><span>昵称</span><input v-model.trim="userForm.nickname" required/></label><label><span>邮箱 <em>可选</em></span><input v-model.trim="userForm.email" type="email"/></label><label><span>手机号 <em>可选</em></span><input v-model.trim="userForm.phone"/></label><FluidButton type="submit">创建账号</FluidButton></form>
      <form v-else-if="tab==='slots'" class="admin-inline-form" @submit.prevent="createSlot"><div class="admin-form-heading"><span>VISIT SLOT</span><h2>创建预约时段</h2></div><label><span>参观日期</span><input v-model="slotForm.visitDate" type="date" required/></label><label><span>开始时间</span><input v-model="slotForm.startTime" type="time" required/></label><label><span>结束时间</span><input v-model="slotForm.endTime" type="time" required/></label><label><span>可预约人数</span><input v-model.number="slotForm.capacity" type="number" min="1" max="500" required/></label><label><span>初始状态</span><el-select v-model="slotForm.status" popper-class="museum-select-popper"><el-option label="开放" value="OPEN"/><el-option label="关闭" value="CLOSED"/><el-option label="取消" value="CANCELLED"/></el-select></label><FluidButton type="submit">创建时段</FluidButton></form>
      <form v-else-if="tab==='products'" class="admin-inline-form admin-inline-form--wide" @submit.prevent="createProduct"><div class="admin-form-heading"><span>STORE ITEM</span><h2>创建商品草稿</h2></div><label><span>SKU</span><input v-model.trim="productForm.sku" required/></label><label><span>商品名称</span><input v-model.trim="productForm.name" required/></label><label><span>URL 标识</span><input v-model.trim="productForm.slug" pattern="[a-z0-9-]{3,180}" required/></label><label><span>价格</span><input v-model.number="productForm.price" type="number" min="0.01" step="0.01" required/></label><label><span>库存</span><input v-model.number="productForm.stockQuantity" type="number" min="0" required/></label><label><span>封面路径 <em>可选</em></span><input v-model.trim="productForm.coverImageUrl"/></label><label class="admin-field-wide"><span>摘要 <em>可选</em></span><input v-model.trim="productForm.summary"/></label><FluidButton type="submit">创建商品</FluidButton></form>
      <form v-else-if="tab==='exhibits'" class="admin-inline-form admin-inline-form--wide" @submit.prevent="createExhibit"><div class="admin-form-heading"><span>DIGITAL EXHIBIT</span><h2>创建 3D 展项草稿</h2></div><label><span>关联文物</span><el-select v-model="exhibitForm.artifactId" popper-class="museum-select-popper" placeholder="请选择关联文物" required><el-option v-for="artifact in artifacts.filter(x=>!x.deleted)" :key="artifact.id" :label="artifact.title" :value="artifact.id" /></el-select></label><label><span>展项名称</span><input v-model.trim="exhibitForm.title" required/></label><label><span>URL 标识</span><input v-model.trim="exhibitForm.slug" pattern="[a-z0-9-]{3,180}" required/></label><label><span>模型 Web 路径</span><input v-model.trim="exhibitForm.modelUrl" required/></label><label><span>原创资产编号</span><input v-model.trim="exhibitForm.modelSourceRef" required/></label><label><span>模型字节数</span><input v-model.number="exhibitForm.modelSizeBytes" type="number" min="1" required/></label><label><span>封面路径 <em>可选</em></span><input v-model.trim="exhibitForm.coverImageUrl"/></label><label class="admin-field-wide"><span>摘要 <em>可选</em></span><input v-model.trim="exhibitForm.summary"/></label><FluidButton type="submit">创建展项</FluidButton></form>

      <div v-if="activeItems.length===0" class="state-panel">当前模块暂无记录。</div>
      <div v-else class="admin-list admin-list--operations">
        <article v-for="item in users" v-if="tab==='users'" :key="item.id"><div class="admin-record-copy"><div class="admin-record-meta"><StatusBadge :status="item.status"/><span>{{ item.roles.join('、') }}</span></div><h3>{{ item.nickname }} <small>@{{ item.username }}</small></h3><p>{{ item.email || '未绑定邮箱' }}</p></div><div class="admin-actions"><button v-if="!item.roles.includes('ADMIN') && item.status==='ACTIVE'" class="danger" @click="action(`/admin/users/${item.id}/status`,'PATCH',{status:'DISABLED'},'用户已禁用。')">禁用</button><button v-if="!item.roles.includes('ADMIN') && item.status==='DISABLED'" class="primary" @click="action(`/admin/users/${item.id}/status`,'PATCH',{status:'ACTIVE'},'用户已恢复。')">恢复</button><button v-if="item.email" @click="action(`/admin/users/${item.id}/reset-password`,'POST',undefined,'重置邮件已进入开发邮件记录。')">发送重置邮件</button></div></article>
        <article v-for="item in slots" v-else-if="tab==='slots'" :key="item.id"><div class="admin-record-copy"><div class="admin-record-meta"><StatusBadge :status="item.status"/><span>已预约 {{ item.reservedPeople }}/{{ item.capacity }}</span></div><h3>{{ item.visitDate }}</h3><p>{{ item.startTime }}–{{ item.endTime }}</p></div></article>
        <article v-for="item in appointments" v-else-if="tab==='appointments'" :key="item.id"><div class="admin-record-copy"><div class="admin-record-meta"><StatusBadge :status="item.status"/><span>{{ item.visitDate }} {{ item.startTime }}–{{ item.endTime }}</span></div><h3>{{ item.contactName }} · {{ item.visitorCount }} 人</h3><p>{{ item.contactPhone }}</p></div><div class="admin-actions"><button v-if="item.status==='PENDING'" class="primary" @click="action(`/admin/appointments/${item.id}/confirm`,'POST',undefined,'预约已确认，已记录通知。')">确认</button><button v-if="item.status==='PENDING'||item.status==='CONFIRMED'" class="danger" @click="action(`/admin/appointments/${item.id}/cancel`,'POST',{reason:'管理员运营取消'},'预约已取消。')">取消</button><button v-if="item.status==='CONFIRMED'" @click="action(`/admin/appointments/${item.id}/complete`,'POST',undefined,'预约已标记完成。')">标记完成</button></div></article>
        <article v-for="item in products" v-else-if="tab==='products'" :key="item.id"><div class="admin-record-copy"><div class="admin-record-meta"><StatusBadge :status="item.deleted?'DISABLED':item.status"/><span>{{ item.sku }}</span></div><h3>{{ item.name }} · ¥ {{ item.price }}</h3><p>库存 {{ item.stockQuantity }}，已锁定 {{ item.lockedStock }}</p></div><div class="admin-actions"><button v-if="!item.deleted && item.status!=='PUBLISHED'" class="primary" @click="action(`/admin/products/${item.id}/on-shelf`)">上架</button><button v-if="!item.deleted && item.status==='PUBLISHED'" @click="action(`/admin/products/${item.id}/off-shelf`)">下架</button><button v-if="!item.deleted" class="danger" @click="action(`/admin/products/${item.id}`,'DELETE')">删除</button><button v-if="item.deleted" class="primary" @click="action(`/admin/products/${item.id}/restore`)">恢复</button></div></article>
        <article v-for="item in orders" v-else-if="tab==='orders'" :key="item.id"><div class="admin-record-copy"><div class="admin-record-meta"><StatusBadge :status="item.status"/><span>{{ item.orderNo }}</span></div><h3>¥ {{ item.payableAmount }}</h3><p>{{ item.notificationEmail }}</p></div><div class="admin-actions"><button v-if="item.status==='PAID'" class="primary" @click="action(`/admin/orders/${item.id}/complete`,'POST',undefined,'订单已标记完成。')">标记完成</button></div></article>
        <article v-for="item in exhibits" v-else-if="tab==='exhibits'" :key="item.id"><div class="admin-record-copy"><div class="admin-record-meta"><StatusBadge :status="item.deleted?'DISABLED':item.status"/><span>{{ item.artifactPublished?'关联文物已公开':'关联文物未公开' }}</span></div><h3>{{ item.title }}</h3><p>{{ item.artifactTitle }} · /exhibits/{{ item.slug }}</p></div><div class="admin-actions"><button v-if="!item.deleted && item.status!=='PUBLISHED'" class="primary" @click="action(`/admin/exhibits/${item.id}/publish`)">发布</button><button v-if="!item.deleted && item.status==='PUBLISHED'" @click="action(`/admin/exhibits/${item.id}/withdraw`)">撤回</button><button v-if="!item.deleted" class="danger" @click="action(`/admin/exhibits/${item.id}`,'DELETE')">删除</button><button v-if="item.deleted" class="primary" @click="action(`/admin/exhibits/${item.id}/restore`)">恢复</button></div></article>
        <article v-for="item in logs" v-else :key="item.id"><div class="admin-record-copy"><div class="admin-record-meta"><span>{{ item.createdAt }}</span><span>{{ item.module }} · {{ item.action }}</span></div><h3>{{ item.actorUsername }}</h3><p>{{ item.targetType }} #{{ item.targetId || '—' }}</p></div></article>
      </div>
        </section>
      </section>
      <aside class="admin-insights" aria-label="运营趋势">
        <div class="admin-insights__header"><strong>03</strong><span>运营态势</span></div>
        <article><span>待处理预约</span><strong>{{ appointments.filter(item => item.status === 'PENDING').length }}</strong><small>查看详情 →</small><div class="mini-chart mini-chart--red" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></article>
        <article><span>库存预警</span><strong>{{ products.filter(item => item.stockQuantity - item.lockedStock < 20).length }}</strong><small>查看详情 →</small><div class="stock-bars" aria-hidden="true"><i style="width: 76%"></i><i style="width: 42%"></i><i style="width: 90%"></i></div></article>
        <article><span>待处理订单</span><strong>{{ orders.filter(item => item.status === 'PAID').length }}</strong><small>查看详情 →</small><div class="mini-chart mini-chart--green" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></article>
      </aside>
    </div>
  </AdminShell>
</template>
