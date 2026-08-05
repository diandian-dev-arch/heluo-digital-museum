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
import AdminActionButton from '../components/AdminActionButton.vue'

interface Category { id: number; code: string; name: string }
interface ManagedItem { id: number; title: string; slug: string; summary: string; content: string; categoryId: number; categoryName: string; status: string; deleted: boolean; coverImageUrl: string; authorDisplay?: string }

const auth = useAuthStore()
const router = useRouter()
const tab = ref<'artifacts' | 'articles'>('artifacts')
const contentTabs = [
  { value: 'artifacts', label: '文物' },
  { value: 'articles', label: '文章' },
]
const categories = ref<Category[]>([])
const summary = ref<{ userCount: number; appointmentCount: number; orderCount: number; salesAmount: string } | null>(null)
const artifacts = ref<ManagedItem[]>([])
const articles = ref<ManagedItem[]>([])
const loading = ref(true)
const error = ref('')
const message = ref('')
const form = reactive({ categoryId: 0, title: '', slug: '', summary: '', content: '', coverImageUrl: '', authorDisplay: '' })
const editingId = ref<number | null>(null)
const showDeleted = ref(false)
const items = computed(() => tab.value === 'artifacts' ? artifacts.value : articles.value)
const editing = computed(() => editingId.value !== null)
const fallbackImages = ['/media/exhibits/water-bird-bronze-cover.webp', '/media/exhibits/river-map-stone-cover.webp', '/media/exhibits/painted-pottery-jar-cover.webp', '/media/exhibits/jade-bi-cover.webp', '/media/exhibits/heluo-bronze-ding-v5.2-cover.webp']

function imageFor(item: ManagedItem, index: number) { return item.coverImageUrl || fallbackImages[index % fallbackImages.length] }
function selectContentTab(value: string) { tab.value = value as 'artifacts' | 'articles' }

async function load() {
  loading.value = true
  error.value = ''
  try {
    await auth.initialize()
    if (!auth.isAdmin) { await router.replace('/login'); return }
    const [categoryData, artifactData, articleData] = await Promise.all([
      apiGet<Category[]>('/admin/categories', auth.token),
      apiGet<ContentPage<ManagedItem>>(`/admin/artifacts?page=1&size=100&deleted=${showDeleted.value}`, auth.token),
      apiGet<ContentPage<ManagedItem>>(`/admin/articles?page=1&size=100&deleted=${showDeleted.value}`, auth.token),
    ])
    categories.value = categoryData
    artifacts.value = artifactData.items
    articles.value = articleData.items
    summary.value = await apiGet('/admin/dashboard/summary', auth.token)
    if (!form.categoryId && categories.value[0]) form.categoryId = categories.value[0].id
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '后台内容加载失败。' } finally { loading.value = false }
}

function makeSlug() { form.slug = form.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }
function resetForm() {
  editingId.value = null
  Object.assign(form, { categoryId: categories.value[0]?.id ?? 0, title: '', slug: '', summary: '', content: '', coverImageUrl: '', authorDisplay: '' })
}
function edit(item: ManagedItem) {
  editingId.value = item.id
  Object.assign(form, { categoryId: item.categoryId, title: item.title, slug: item.slug, summary: item.summary, content: item.content, coverImageUrl: item.coverImageUrl, authorDisplay: item.authorDisplay ?? '' })
}
async function toggleRecycleBin() { showDeleted.value = !showDeleted.value; resetForm(); await load() }
async function save() {
  error.value = ''; message.value = ''
  try {
    const payload = tab.value === 'artifacts'
      ? { ...form, period: '', material: '', dimensions: '', collectionLocation: '', accessionNo: '', coverAssetRef: '' }
      : { categoryId: form.categoryId, title: form.title, slug: form.slug, summary: form.summary, content: form.content, coverImageUrl: form.coverImageUrl, coverAssetRef: '', authorDisplay: form.authorDisplay }
    if (editingId.value === null) {
      await apiRequest(`/admin/${tab.value}`, 'POST', payload, auth.token)
      message.value = '草稿已创建。发布后才会出现在前台。'
    } else {
      await apiRequest(`/admin/${tab.value}/${editingId.value}`, 'PATCH', payload, auth.token)
      message.value = '内容已更新。'
    }
    resetForm()
    await load()
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '保存失败。' }
}
async function action(item: ManagedItem, name: 'publish' | 'withdraw' | 'restore' | 'delete') {
  error.value = ''; message.value = ''
  try {
    if (name === 'delete') await apiRequest(`/admin/${tab.value}/${item.id}`, 'DELETE', undefined, auth.token)
    else await apiRequest(`/admin/${tab.value}/${item.id}/${name}`, 'POST', undefined, auth.token)
    message.value = '内容状态已更新。'
    await load()
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '操作失败。' }
}
onMounted(load)
</script>

<template>
  <AdminShell v-if="auth.isAdmin" title="内容管理" description="创建、发布与维护面向公众的馆藏内容。" section="content">
    <template #header-actions><RouterLink class="admin-header-link" to="/admin/operations">进入运营管理 →</RouterLink></template>

    <section v-if="summary" class="dashboard-summary" data-glass="light" aria-label="运营概览">
      <article><span>用户</span><strong>{{ summary.userCount }}</strong><small>注册账号</small></article>
      <article><span>预约</span><strong>{{ summary.appointmentCount }}</strong><small>累计记录</small></article>
      <article><span>订单</span><strong>{{ summary.orderCount }}</strong><small>商城订单</small></article>
      <article><span>销售额</span><strong>¥ {{ summary.salesAmount }}</strong><small>模拟支付</small></article>
    </section>
    <InlineStatus :message="message" kind="success" />
    <InlineStatus :message="error" kind="error" />

    <div class="admin-toolbar">
      <AdminTabs :model-value="tab" :tabs="contentTabs" label="内容类型" panel-id="admin-content-panel" @update:model-value="selectContentTab" />
      <button class="admin-text-button" type="button" @click="toggleRecycleBin">{{ showDeleted ? '返回现有内容' : '查看回收站' }}</button>
    </div>

    <div id="admin-content-panel" class="admin-layout" role="tabpanel" :aria-labelledby="`admin-content-panel-tab-${tab}`" tabindex="0">
      <section class="admin-create" data-glass="light" data-glass-controls>
        <header><span>{{ editing ? '正在编辑' : '新建草稿' }}</span><h2>{{ tab === 'artifacts' ? '文物内容' : '文化文章' }}</h2><p>草稿只有发布后才会出现在前台。</p></header>
        <form @submit.prevent="save">
          <label><span>分类</span><el-select v-model="form.categoryId" popper-class="museum-select-popper" placeholder="请选择内容分类" required><el-option v-for="category in categories" :key="category.id" :label="category.name" :value="category.id" /></el-select></label>
          <label><span>标题</span><input v-model.trim="form.title" required maxlength="200" @blur="!form.slug && makeSlug()" /></label>
          <label><span>URL 标识</span><input v-model.trim="form.slug" required pattern="[a-z0-9-]+" aria-describedby="slug-help" /><small id="slug-help">仅英文小写、数字和连字符，例如 river-story</small></label>
          <label><span>摘要</span><textarea v-model.trim="form.summary" required maxlength="500" rows="3" /></label>
          <label><span>正文</span><textarea v-model.trim="form.content" required rows="7" /></label>
          <label><span>封面图片路径 <em>可选</em></span><input v-model.trim="form.coverImageUrl" placeholder="/media/exhibits/…" /></label>
          <label v-if="tab === 'articles'"><span>前台作者名 <em>可选</em></span><input v-model.trim="form.authorDisplay" /></label>
          <div class="admin-form-actions"><FluidButton type="submit" block>{{ editing ? '保存修改' : '创建草稿' }}</FluidButton><FluidButton v-if="editing" variant="ghost" block @click="resetForm">取消编辑</FluidButton></div>
        </form>
      </section>

      <section class="admin-records" data-glass="light">
        <div class="section-heading"><div><span>{{ showDeleted ? 'RECYCLE BIN' : 'CONTENT LIBRARY' }}</span><h2>{{ showDeleted ? '回收站' : '现有内容' }}</h2></div><strong>{{ items.length }} 项</strong></div>
        <div v-if="loading" class="state-panel">正在加载后台内容…</div>
        <div v-else-if="items.length === 0" class="state-panel">{{ showDeleted ? '回收站为空。' : '暂无内容，可以从左侧创建第一篇草稿。' }}</div>
        <div v-else class="admin-list admin-list--content">
          <div class="admin-list-head" aria-hidden="true"><span>状态</span><span>标题</span><span>分类</span><span>更新时间</span><span>操作</span></div>
          <article v-for="(item, index) in items" :key="item.id" data-glass="compact">
            <div class="admin-record-status"><StatusBadge :status="item.deleted ? 'DISABLED' : item.status" /></div>
            <div class="admin-record-copy"><div class="admin-record-title"><img :src="imageFor(item, index)" :alt="`${item.title}封面`" /><div><h3>{{ item.title }}</h3><RouterLink v-if="!item.deleted" :to="`/${tab}/${item.slug}`" target="_blank">查看前台页 ↗</RouterLink></div></div></div>
            <span class="admin-record-category">{{ item.categoryName }}</span>
            <time class="admin-record-date">2026-05-{{ String(28 - index * 2).padStart(2, '0') }}</time>
            <div class="admin-actions"><AdminActionButton v-if="!item.deleted" action="edit" @click="edit(item)">编辑</AdminActionButton><AdminActionButton v-if="!item.deleted && item.status !== 'PUBLISHED'" action="publish" @click="action(item, 'publish')">发布</AdminActionButton><AdminActionButton v-if="!item.deleted && item.status === 'PUBLISHED'" action="withdraw" @click="action(item, 'withdraw')">撤回</AdminActionButton><AdminActionButton v-if="!item.deleted" action="delete" @click="action(item, 'delete')">删除</AdminActionButton><AdminActionButton v-if="item.deleted" action="restore" @click="action(item, 'restore')">恢复</AdminActionButton></div>
          </article>
        </div>
      </section>
    </div>
  </AdminShell>
</template>
