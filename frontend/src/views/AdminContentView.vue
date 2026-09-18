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
import { useAdminMutation } from '../composables/useAdminMutation'
import { useUnsavedChanges } from '../composables/useUnsavedChanges'

interface Category { id: number; code: string; name: string }
interface ManagedItem { titleEn?: string | null; summaryEn?: string | null; id: number; title: string; slug: string; summary: string; content: string; categoryId: number; categoryName: string; status: string; deleted: boolean; coverImageUrl: string; updatedAt: string; authorDisplay?: string; period?: string; material?: string; dimensions?: string; collectionLocation?: string; accessionNo?: string; coverAssetRef?: string }

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
const listState = reactive({
  artifacts: { page: 1, totalPages: 1, total: 0, keyword: '', status: '', deleted: false, loading: true, error: '', sequence: 0 },
  articles: { page: 1, totalPages: 1, total: 0, keyword: '', status: '', deleted: false, loading: false, error: '', sequence: 0 },
})
const loading = computed(() => listState[tab.value].loading)
const error = ref('')
const message = ref('')
const artifactForm = reactive({ categoryId: 0, accessionNo: '', title: '', titleEn: '', summaryEn: '', slug: '', period: '', material: '', dimensions: '', collectionLocation: '', summary: '', content: '', coverImageUrl: '', coverAssetRef: '', authorDisplay: '' })
const articleForm = reactive({ categoryId: 0, accessionNo: '', title: '', titleEn: '', summaryEn: '', slug: '', period: '', material: '', dimensions: '', collectionLocation: '', summary: '', content: '', coverImageUrl: '', coverAssetRef: '', authorDisplay: '' })
const editingId = ref<number | null>(null)
const editingType = ref<'artifacts' | 'articles' | null>(null)
const showDeleted = computed({ get: () => listState[tab.value].deleted, set: value => { listState[tab.value].deleted = value } })
const contentPage = computed({ get: () => listState[tab.value].page, set: value => { listState[tab.value].page = value } })
const contentTotalPages = computed(() => listState[tab.value].totalPages)
const keyword = computed({ get: () => listState[tab.value].keyword, set: value => { listState[tab.value].keyword = value } })
const statusFilter = computed({ get: () => listState[tab.value].status, set: value => { listState[tab.value].status = value } })
const saving = ref(false)
const formElement = ref<HTMLFormElement | null>(null)
const { isPending, run: runMutation } = useAdminMutation()
const confirmationPending = ref(false)
const confirmation = ref<{ title: string; message: string; confirmLabel: string; run: () => void | Promise<void> } | null>(null)
const items = computed(() => tab.value === 'artifacts' ? artifacts.value : articles.value)
const activeForm = computed(() => tab.value === 'artifacts' ? artifactForm : articleForm)
const editing = computed(() => editingId.value !== null && editingType.value === tab.value)
const unsaved = useUnsavedChanges({ value: () => activeForm.value, save, discard: resetForm, blocked: () => saving.value })
let loadSequence = 0
let loadController: AbortController | undefined
const fallbackImages = ['/media/exhibits/water-bird-bronze-cover.webp', '/media/exhibits/river-map-stone-cover.webp', '/media/exhibits/painted-pottery-jar-cover.webp', '/media/exhibits/jade-bi-cover.webp', '/media/exhibits/heluo-bronze-ding-v5.2-cover.webp']

function imageFor(item: ManagedItem, index: number) { return item.coverImageUrl || fallbackImages[index % fallbackImages.length] }
function selectContentTab(value: string) {
  if (value === tab.value || !['artifacts', 'articles'].includes(value)) return
  void unsaved.attempt(async () => {
    resetForm()
    tab.value = value as 'artifacts' | 'articles'
    error.value = ''; message.value = ''
    unsaved.markClean()
    await load()
  })
}

async function load(page = contentPage.value) {
  const target = tab.value
  const state = listState[target]
  state.page = Math.max(1, page)
  const query = new URLSearchParams({ page: String(state.page), size: '20', deleted: String(state.deleted), keyword: state.keyword.trim(), status: state.status })
  const sequence = ++loadSequence
  state.sequence = sequence
  loadController?.abort()
  const controller = new AbortController()
  loadController = controller
  state.loading = true
  state.error = ''
  try {
    await auth.initialize()
    if (sequence !== loadSequence) return
    if (!auth.isAdmin) { await router.replace('/login'); return }
    const options = { signal: controller.signal }
    const [categoryData, data, overview] = await Promise.all([
      categories.value.length ? Promise.resolve(categories.value) : apiGet<Category[]>('/admin/categories', auth.token, options),
      apiGet<ContentPage<ManagedItem>>(`/admin/${target}?${query}`, auth.token, options),
      apiGet<NonNullable<typeof summary.value>>('/admin/dashboard/summary', auth.token, options),
    ])
    if (sequence !== loadSequence) return
    if (state.page > Math.max(1, data.totalPages)) { await load(Math.max(1, data.totalPages)); return }
    categories.value = categoryData
    if (target === 'artifacts') artifacts.value = data.items
    else articles.value = data.items
    state.totalPages = Math.max(1, data.totalPages)
    state.total = data.total
    summary.value = overview
    if (!activeForm.value.categoryId && categories.value[0]) {
      const wasDirty = unsaved.dirty.value
      activeForm.value.categoryId = categories.value[0].id
      if (!wasDirty) unsaved.markClean()
    }
  } catch (reason) {
    if (sequence === loadSequence) state.error = reason instanceof Error ? reason.message : '后台内容加载失败。'
  } finally { if (state.sequence === sequence) state.loading = false }
}

function makeSlug() { activeForm.value.slug = activeForm.value.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }
function formatUpdatedAt(value: string) { return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) }
function resetForm() {
  editingId.value = null
  editingType.value = null
  Object.assign(artifactForm, { categoryId: categories.value[0]?.id ?? 0, accessionNo: '', title: '', titleEn: '', summaryEn: '', slug: '', period: '', material: '', dimensions: '', collectionLocation: '', summary: '', content: '', coverImageUrl: '', coverAssetRef: '', authorDisplay: '' })
  Object.assign(articleForm, { categoryId: categories.value[0]?.id ?? 0, accessionNo: '', title: '', titleEn: '', summaryEn: '', slug: '', period: '', material: '', dimensions: '', collectionLocation: '', summary: '', content: '', coverImageUrl: '', coverAssetRef: '', authorDisplay: '' })
  unsaved.markClean()
}
function edit(item: ManagedItem) {
  void unsaved.attempt(() => selectItem(item))
}
function selectItem(item: ManagedItem) {
  editingId.value = item.id
  editingType.value = tab.value
  if (tab.value === 'artifacts') Object.assign(artifactForm, { categoryId: item.categoryId, accessionNo: item.accessionNo ?? '', title: item.title, titleEn: item.titleEn ?? '', summaryEn: item.summaryEn ?? '', slug: item.slug, period: item.period ?? '', material: item.material ?? '', dimensions: item.dimensions ?? '', collectionLocation: item.collectionLocation ?? '', summary: item.summary, content: item.content, coverImageUrl: item.coverImageUrl, coverAssetRef: item.coverAssetRef ?? '' })
  else Object.assign(articleForm, { categoryId: item.categoryId, title: item.title, titleEn: item.titleEn ?? '', summaryEn: item.summaryEn ?? '', slug: item.slug, summary: item.summary, content: item.content, coverImageUrl: item.coverImageUrl, coverAssetRef: item.coverAssetRef ?? '', authorDisplay: item.authorDisplay ?? '' })
  unsaved.markClean()
}
async function toggleRecycleBin() { await unsaved.attempt(async () => { showDeleted.value = !showDeleted.value; resetForm(); await load(1) }) }
function refreshList() { contentPage.value = 1; void load(1) }
function clearFilters() { keyword.value = ''; statusFilter.value = ''; refreshList() }
function goToContentPage(page: number) { if (loading.value || page < 1 || page > contentTotalPages.value || page === contentPage.value) return; void load(page) }
async function save(): Promise<boolean> {
  if (saving.value) return false
  if (formElement.value && !formElement.value.reportValidity()) { error.value = '请补全必填项后保存。'; return false }
  error.value = ''; message.value = ''
  saving.value = true
  try {
    const payload = tab.value === 'artifacts'
      ? { categoryId: artifactForm.categoryId, accessionNo: artifactForm.accessionNo, title: artifactForm.title, titleEn: artifactForm.titleEn, summaryEn: artifactForm.summaryEn, slug: artifactForm.slug, period: artifactForm.period, material: artifactForm.material, dimensions: artifactForm.dimensions, collectionLocation: artifactForm.collectionLocation, summary: artifactForm.summary, content: artifactForm.content, coverImageUrl: artifactForm.coverImageUrl, coverAssetRef: artifactForm.coverAssetRef }
      : { categoryId: articleForm.categoryId, title: articleForm.title, titleEn: articleForm.titleEn, summaryEn: articleForm.summaryEn, slug: articleForm.slug, summary: articleForm.summary, content: articleForm.content, coverImageUrl: articleForm.coverImageUrl, coverAssetRef: articleForm.coverAssetRef, authorDisplay: articleForm.authorDisplay }
    if (editingId.value === null) {
      await apiRequest(`/admin/${tab.value}`, 'POST', payload, auth.token)
      message.value = '草稿已创建。发布后才会出现在前台。'
    } else {
      await apiRequest(`/admin/${tab.value}/${editingId.value}`, 'PATCH', payload, auth.token)
      message.value = '内容已更新。'
    }
    resetForm()
    await load()
    return true
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '保存失败。'; return false }
  finally { saving.value = false }
}
function resourceKey(type: 'artifacts' | 'articles', id: number) { return `${type}:${id}` }
async function action(item: ManagedItem, name: 'publish' | 'withdraw' | 'restore' | 'delete', confirmed = false, resourceType = tab.value) {
  const key = resourceKey(resourceType, item.id)
  if (!confirmed && (name === 'delete' || name === 'withdraw')) {
    confirmation.value = {
      title: name === 'delete' ? '删除这条内容？' : '撤回这条内容？',
      message: `${item.title} 将${name === 'delete' ? '进入回收站，前台不再展示' : '从前台撤下，但保留草稿内容'}。`,
      confirmLabel: name === 'delete' ? '确认删除' : '确认撤回',
      run: () => action(item, name, true, resourceType),
    }
    return
  }
  if (isPending(key)) return
  await runMutation(key, async () => {
    error.value = ''; message.value = ''
    try {
      if (name === 'delete') await apiRequest(`/admin/${resourceType}/${item.id}`, 'DELETE', undefined, auth.token)
      else await apiRequest(`/admin/${resourceType}/${item.id}/${name}`, 'POST', undefined, auth.token)
      message.value = '内容状态已更新。'
      await load()
    } catch (reason) { error.value = reason instanceof Error ? reason.message : '操作失败。' }
  })
}
async function confirmAction() {
  const current = confirmation.value
  if (!current || confirmationPending.value) return
  confirmationPending.value = true
  try { await current.run(); confirmation.value = null }
  finally { confirmationPending.value = false }
}
function cancelEditing() {
  void unsaved.attempt(resetForm)
}
onMounted(load)
onBeforeUnmount(() => { ++loadSequence; loadController?.abort() })
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
    <InlineStatus :message="error || listState[tab].error" kind="error" />

    <div class="admin-toolbar">
      <AdminTabs :model-value="tab" :tabs="contentTabs" label="内容类型" panel-id="admin-content-panel" @update:model-value="selectContentTab" />
      <div class="admin-list-filters">
        <label class="admin-filter-field admin-filter-field--search">
          <span class="admin-filter-field__label">查找内容</span>
          <input v-model.trim="keyword" type="search" placeholder="搜索标题、标识或登记号" @keyup.enter="refreshList" />
        </label>
        <label class="admin-filter-field">
          <span class="admin-filter-field__label">状态</span>
          <select v-model="statusFilter" @change="refreshList">
            <option value="">全部状态</option>
            <option value="DRAFT">草稿</option>
            <option value="PUBLISHED">已发布</option>
            <option value="WITHDRAWN">已撤回</option>
          </select>
        </label>
        <button class="admin-text-button" type="button" @click="clearFilters">清除</button>
      </div>
      <button class="admin-text-button" type="button" @click="toggleRecycleBin">{{ showDeleted ? '返回现有内容' : '查看回收站' }}</button>
    </div>

    <div id="admin-content-panel" class="admin-layout" role="tabpanel" :aria-labelledby="`admin-content-panel-tab-${tab}`" tabindex="0">
      <section class="admin-create" data-glass="light" data-glass-controls>
        <header><span>{{ editing ? '正在编辑' : '新建草稿' }}</span><h2>{{ tab === 'artifacts' ? '文物内容' : '文化文章' }}</h2><p>草稿只有发布后才会出现在前台。</p></header>
        <form ref="formElement" :inert="saving" @submit.prevent="save">
          <label><span>分类</span><el-select v-model="activeForm.categoryId" popper-class="museum-select-popper" placeholder="请选择内容分类" required><el-option v-for="category in categories" :key="category.id" :label="category.name" :value="category.id" /></el-select></label>
          <label><span>标题</span><input v-model.trim="activeForm.title" required maxlength="200" @blur="!activeForm.slug && makeSlug()" /></label>
          <label><span>URL 标识</span><input v-model.trim="activeForm.slug" required pattern="[a-z0-9-]+" aria-describedby="slug-help" /><small id="slug-help">仅英文小写、数字和连字符，例如 river-story</small></label>
          <label v-if="tab === 'artifacts'"><span>登记号 <em>可选</em></span><input v-model.trim="activeForm.accessionNo" maxlength="64" /></label>
          <div v-if="tab === 'artifacts'" class="admin-form-grid"><label><span>年代 <em>可选</em></span><input v-model.trim="activeForm.period" /></label><label><span>材质 <em>可选</em></span><input v-model.trim="activeForm.material" /></label><label><span>尺寸 <em>可选</em></span><input v-model.trim="activeForm.dimensions" /></label><label><span>典藏地 <em>可选</em></span><input v-model.trim="activeForm.collectionLocation" /></label></div>
          <label><span>英文标题（可选）</span><input v-model.trim="activeForm.titleEn" maxlength="300" /></label>
          <label><span>英文摘要（可选）</span><textarea v-model.trim="activeForm.summaryEn" maxlength="1000" rows="3" /></label>
          <p class="form-hint">{{ !activeForm.titleEn || !activeForm.summaryEn ? '英文译文尚未补齐，无法保证英文搜索命中。' : '英文译文已填写。' }} 修改中文内容后，请同步核对译文。</p>
          <label><span>摘要</span><textarea v-model.trim="activeForm.summary" required maxlength="500" rows="3" /></label>
          <label><span>正文</span><textarea v-model.trim="activeForm.content" required rows="7" /></label>
          <label><span>封面图片路径 <em>可选</em></span><input v-model.trim="activeForm.coverImageUrl" placeholder="/media/exhibits/…" /></label>
          <label v-if="tab === 'articles'"><span>前台作者名 <em>可选</em></span><input v-model.trim="activeForm.authorDisplay" /></label>
          <div class="admin-form-actions"><FluidButton type="submit" block :loading="saving">{{ editing ? '保存修改' : '创建草稿' }}</FluidButton><FluidButton v-if="editing" variant="ghost" block :disabled="saving" @click="cancelEditing">取消编辑</FluidButton></div>
        </form>
      </section>

      <section class="admin-records" data-glass="light">
        <div class="section-heading"><div><span>{{ showDeleted ? 'RECYCLE BIN' : 'CONTENT LIBRARY' }}</span><h2>{{ showDeleted ? '回收站' : '现有内容' }}</h2></div><strong>{{ listState[tab].total }} 项</strong></div>
        <div v-if="loading" class="state-panel">正在加载后台内容…</div>
        <div v-else-if="listState[tab].error" class="state-panel state-panel--action"><button class="state-panel__action" type="button" @click="load()">重试</button></div>
        <div v-else-if="items.length === 0" class="state-panel">{{ showDeleted ? '回收站为空。' : '暂无内容，可以从左侧创建第一篇草稿。' }}</div>
        <div v-else class="admin-list admin-list--content">
          <div class="admin-list-head" aria-hidden="true"><span>状态</span><span>标题</span><span>分类</span><span>更新时间</span><span>操作</span></div>
          <article v-for="(item, index) in items" :key="item.id" data-glass="compact">
            <div class="admin-record-status"><StatusBadge :status="item.deleted ? 'DISABLED' : item.status" /></div>
            <div class="admin-record-copy"><div class="admin-record-title"><img :src="imageFor(item, index)" :alt="`${item.title}封面`" /><div><h3>{{ item.title }}</h3><RouterLink v-if="!item.deleted" :to="`/${tab}/${item.slug}`" target="_blank">查看前台页 ↗</RouterLink></div></div></div>
            <span class="admin-record-category">{{ item.categoryName }}</span>
            <time class="admin-record-date" :datetime="item.updatedAt">{{ formatUpdatedAt(item.updatedAt) }}</time>
            <div class="admin-actions"><AdminActionButton v-if="!item.deleted" action="edit" :disabled="isPending(resourceKey(tab, item.id))" @click="edit(item)">编辑</AdminActionButton><AdminActionButton v-if="!item.deleted && item.status !== 'PUBLISHED'" :disabled="isPending(resourceKey(tab, item.id))" action="publish" @click="action(item, 'publish')">发布</AdminActionButton><AdminActionButton v-if="!item.deleted && item.status === 'PUBLISHED'" :disabled="isPending(resourceKey(tab, item.id))" action="withdraw" @click="action(item, 'withdraw')">撤回</AdminActionButton><AdminActionButton v-if="!item.deleted" :disabled="isPending(resourceKey(tab, item.id))" action="delete" @click="action(item, 'delete')">删除</AdminActionButton><AdminActionButton v-if="item.deleted" :disabled="isPending(resourceKey(tab, item.id))" action="restore" @click="action(item, 'restore')">恢复</AdminActionButton></div>
          </article>
        </div>
        <nav v-if="contentTotalPages > 1" class="admin-pagination" aria-label="内容列表分页"><button type="button" :disabled="contentPage === 1" @click="goToContentPage(contentPage - 1)">上一页</button><span>{{ contentPage }} / {{ contentTotalPages }}</span><button type="button" :disabled="contentPage === contentTotalPages" @click="goToContentPage(contentPage + 1)">下一页</button></nav>
      </section>
    </div>
    <AdminConfirmDialog v-if="confirmation" :open="Boolean(confirmation)" :title="confirmation.title" :message="confirmation.message" :confirm-label="confirmation.confirmLabel" :pending="confirmationPending" @confirm="confirmAction" @cancel="confirmation = null" />
    <AdminConfirmDialog v-if="unsaved.open.value" :open="unsaved.open.value" title="还有未保存的内容" message="保存当前表单后继续，或放弃本次修改。" :error="error" confirm-label="保存并继续" secondary-label="放弃修改" cancel-label="继续编辑" :pending="unsaved.pending.value" @confirm="unsaved.decide('save')" @secondary="unsaved.decide('discard')" @cancel="unsaved.decide('continue')" />
  </AdminShell>
</template>
