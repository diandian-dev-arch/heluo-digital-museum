<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import ThreeExhibitViewer from '../components/ThreeExhibitViewer.vue'
import { qualityLabel, type PointCloudQuality } from '../lib/pointCloudQuality'
import { apiGet } from '../lib/api'
import BottomSheet from '../components/BottomSheet.vue'

type ViewName = 'front' | 'left' | 'right' | 'back' | 'top'
interface Exhibit { slug:string; title:string; summary:string; description:string; modelUrl:string; modelFormat:string; modelSizeBytes:number; coverImageUrl:string; artifact:{slug:string;title:string} }
interface ViewerController { rotate:()=>void; zoomIn:()=>void; zoomOut:()=>void; resetView:()=>void; setView:(view:ViewName, options?: { animated?: boolean })=>void; setMode:(mode:'solid'|'points')=>void }

const route = useRoute()
const exhibit = ref<Exhibit|null>(null)
const loading = ref(true)
const error = ref('')
const viewer = ref<ViewerController|null>(null)
const displayMode = ref<'solid'|'points'>('solid')
const renderQuality = ref<PointCloudQuality>('medium')
const activeView = ref<ViewName>('front')
const mobileInfoOpen = ref(false)
const mobileInfoSnapPoint = ref<'medium' | 'full'>('medium')
const isBronzeDing = computed(() => exhibit.value?.slug === 'heluo-bronze-ding-3d')
const displayTitle = computed(() => isBronzeDing.value ? '三足青铜鼎 · 1962.281' : exhibit.value?.title ?? '')
const exhibitFacts = computed(() => isBronzeDing.value ? [
  { label: '来源', value: 'Cleveland Museum of Art · 1962.281' },
  { label: '材质', value: '古青铜 PBR 网页重制' },
  { label: '说明', value: exhibit.value?.summary ?? '保留原始器型与纹样，重制古青铜材质和展厅灯光。' },
] : [
  { label: '展项', value: exhibit.value?.title ?? '' },
  { label: '材质', value: '数字展项' },
  { label: '说明', value: exhibit.value?.summary ?? '' },
])
const views: Array<{ key:ViewName; label:string }> = [
  { key:'front', label:'正面' }, { key:'left', label:'左侧' }, { key:'right', label:'右侧' }, { key:'back', label:'背面' }, { key:'top', label:'俯视' },
]
const tourSteps = ['器形概览', '鼎之结构', '纹样细节', '材质层次', '点云解构', '来源说明']
const activeTourStep = computed(() => displayMode.value === 'points' ? 5 : 1)

async function load() {
  loading.value = true
  error.value = ''
  try { exhibit.value = await apiGet<Exhibit>(`/exhibits/${encodeURIComponent(String(route.params.slug))}`) }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '展项加载失败。' }
  finally { loading.value = false }
}
function selectMode(mode:'solid'|'points') { displayMode.value = mode; viewer.value?.setMode(mode) }
function chooseView(view:ViewName) { activeView.value = view; viewer.value?.setView(view, { animated: true }) }
function reset() { activeView.value = 'front'; viewer.value?.resetView() }
onMounted(load)
watch(() => route.fullPath, load)
</script>

<template>
  <section v-if="loading" class="state-panel detail-state">正在加载数字展项…</section>
  <section v-else-if="error" class="state-panel detail-state"><h1>无法打开该展项</h1><p>{{ error }}</p><RouterLink to="/exhibits">返回数字展厅</RouterLink></section>
  <main v-else-if="exhibit" class="immersive-exhibit">
    <section class="exhibit-scene">
      <svg class="scene-route" viewBox="0 0 1672 720" preserveAspectRatio="none" aria-hidden="true"><path d="M0 585 C180 520 240 625 425 568 S720 612 895 536 1172 484 1672 548"/><path d="M20 610 C205 552 286 650 448 592 S742 635 913 558 1210 505 1650 575"/><circle cx="555" cy="571" r="3"/><circle cx="1128" cy="505" r="3"/><circle cx="1382" cy="526" r="3"/></svg>
      <div class="exhibit-wall-copy exhibit-wall-copy--left"><b>河洛之间</b><span>文明肇始</span></div>
      <div class="exhibit-wall-copy exhibit-wall-copy--right"><b>河洛文化</b><span>中华文明重要源地</span></div>
      <p class="exhibit-scene-label">06｜深墨青铜厅｜数字展厅 <span>⌄</span></p>
      <div class="exhibit-viewer-wrap"><ThreeExhibitViewer ref="viewer" :model-url="exhibit.modelUrl" :cover-image-url="exhibit.coverImageUrl" :alt="displayTitle" :enable-point-cloud="true" initial-mode="solid" @mode-change="displayMode = $event" @quality-change="renderQuality = $event" /></div>
      <RouterLink class="exhibit-back" to="/exhibits">← 返回展厅</RouterLink>
      <div class="viewer-tools" aria-label="视角控制">
        <button type="button" aria-label="旋转" @click="viewer?.rotate()"><i class="tool-rotate" aria-hidden="true"></i><span>旋转</span></button>
        <button type="button" aria-label="放大" @click="viewer?.zoomIn()"><i aria-hidden="true">＋</i><span>放大</span></button>
        <button type="button" aria-label="缩小" @click="viewer?.zoomOut()"><i aria-hidden="true">−</i><span>缩小</span></button>
        <button type="button" aria-label="重置" @click="reset"><i class="tool-reset" aria-hidden="true">◇</i><span>重置</span></button>
      </div>
      <button class="mobile-exhibit-info-trigger" type="button" aria-haspopup="dialog" :aria-expanded="mobileInfoOpen" @click="mobileInfoOpen = true">查看展项信息</button>
      <aside class="exhibit-panel exhibit-panel-desktop">
        <h1><i aria-hidden="true"></i>{{ displayTitle }}</h1>
        <dl>
          <div v-for="(fact, index) in exhibitFacts" :key="fact.label"><dt>{{ ['◷', '▱', '☷'][index] }}　{{ fact.label }}</dt><dd>{{ fact.value }}</dd></div>
        </dl>
        <div class="mode-switch" aria-label="渲染模式"><button type="button" :class="{ active: displayMode === 'solid' }" :aria-pressed="displayMode === 'solid'" @click="selectMode('solid')">实体</button><button type="button" :class="{ active: displayMode === 'points' }" :aria-pressed="displayMode === 'points'" :disabled="renderQuality === 'fallback'" @click="selectMode('points')">点云</button></div>
        <p class="render-quality" aria-live="polite"><i aria-hidden="true"></i>{{ qualityLabel(renderQuality) }} · {{ displayMode === 'points' ? '粒子解构中' : 'PBR 实体展示' }}</p>
        <div class="exhibit-panel-actions"><RouterLink :to="`/artifacts/${exhibit.artifact.slug}`">查看关联文物　↗</RouterLink><RouterLink to="/appointment">预约参观</RouterLink></div>
      </aside>
    </section>
    <section class="exhibit-dock">
      <div class="tour-route"><h2>展览导览 <span>{{ activeTourStep }} / 6</span></h2><ol><li v-for="(step, index) in tourSteps" :key="step" :class="{ active: activeTourStep === index + 1 }" :aria-current="activeTourStep === index + 1 ? 'step' : undefined"><button v-if="index === 4" type="button" :aria-pressed="displayMode === 'points'" @click="selectMode('points')">{{ step }}</button><span v-else>{{ step }}</span></li></ol></div>
      <div class="view-switcher"><h2>视角切换</h2><div><button v-for="view in views" :key="view.key" type="button" :class="{ active: activeView === view.key }" :aria-label="view.label" :aria-pressed="activeView === view.key" @click="chooseView(view.key)"><img :src="exhibit.coverImageUrl" alt=""/><span>{{ view.label }}</span></button></div></div>
      <div class="exhibit-location"><svg viewBox="0 0 120 54" aria-hidden="true"><path d="M5 34 C18 8 34 42 51 20 S82 13 96 31 108 44 116 18"/><circle cx="8" cy="33" r="3"/></svg><p><span>模型来源</span>Cleveland Museum of Art · 1962.281</p></div>
    </section>
    <article class="exhibit-description"><p class="eyebrow">EXHIBIT NOTES</p><p v-for="part in exhibit.description.split(/\n\s*\n/)" :key="part">{{ part }}</p></article>
    <BottomSheet :open="mobileInfoOpen" title="展项信息" :snap-point="mobileInfoSnapPoint" @close="mobileInfoOpen = false" @update:snap-point="mobileInfoSnapPoint = $event">
      <div class="mobile-exhibit-info"><h2>{{ displayTitle }}</h2><dl><div v-for="fact in exhibitFacts" :key="fact.label"><dt>{{ fact.label }}</dt><dd>{{ fact.value }}</dd></div></dl><div class="mode-switch" aria-label="渲染模式"><button type="button" :class="{ active: displayMode === 'solid' }" :aria-pressed="displayMode === 'solid'" @click="selectMode('solid')">实体</button><button type="button" :class="{ active: displayMode === 'points' }" :aria-pressed="displayMode === 'points'" :disabled="renderQuality === 'fallback'" @click="selectMode('points')">点云</button></div><div class="exhibit-panel-actions"><RouterLink :to="`/artifacts/${exhibit.artifact.slug}`">查看关联文物　↗</RouterLink><RouterLink to="/appointment">预约参观</RouterLink></div></div>
    </BottomSheet>
  </main>
</template>
