<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { gsap } from 'gsap'
import { Box, Connection } from '@element-plus/icons-vue'
import ThreeExhibitViewer from '../components/ThreeExhibitViewer.vue'
import { qualityLabel, type PointCloudQuality } from '../lib/pointCloudQuality'
import { apiGet } from '../lib/api'
import BottomSheet from '../components/BottomSheet.vue'
import { useLocale } from '../stores/locale'
import { createGsapContext, isConstrainedGsapReveal, shouldRunGsapReveal } from '../lib/gsap'

type ViewName = 'front' | 'left' | 'right' | 'back' | 'top'
interface Exhibit { slug:string; title:string; summary:string; description:string; modelUrl:string; modelFormat:string; modelSizeBytes:number; coverImageUrl:string; artifact:{slug:string;title:string} }
interface ViewerController { rotate:()=>void; zoomIn:()=>void; zoomOut:()=>void; resetView:()=>void; setView:(view:ViewName, options?: { animated?: boolean })=>void; setMode:(mode:'solid'|'points')=>void }

const route = useRoute()
const { locale } = useLocale()
const exhibit = ref<Exhibit|null>(null)
const loading = ref(true)
const error = ref('')
const viewer = ref<ViewerController|null>(null)
const displayMode = ref<'solid'|'points'>('solid')
const renderQuality = ref<PointCloudQuality>('medium')
const activeView = ref<ViewName>('front')
const mobileInfoOpen = ref(false)
const mobileInfoSnapPoint = ref<'medium' | 'full'>('medium')
const root = ref<HTMLElement | null>(null)
let gsapContext: gsap.Context | undefined
const copy = computed(() => locale.value === 'zh-CN' ? {
  loading: '正在加载数字展项…', loadFailed: '无法打开该展项', backGallery: '返回数字展厅', scene: '06｜深墨青铜厅｜数字展厅', wall: [['河洛之间', '文明肇始'], ['河洛文化', '中华文明重要源地']],
  toolsAria: '视角控制', tools: ['旋转', '放大', '缩小', '重置'], info: '查看展项信息', back: '返回展厅',
  factLabels: ['来源', '材质', '说明'], material: '古青铜 PBR 网页重制', factDescription: '基于 Cleveland Museum of Art 1962.281 的三足青铜鼎数字模型，依据原始器型与纹样并重制古青铜 PBR 材质，支持旋转、缩放与多角度观察。',
  genericFactLabels: ['展项', '材质', '说明'], digitalExhibit: '数字展项', renderMode: '渲染模式', solid: '实体', points: '点云', particles: '粒子解构中', pbr: 'PBR 实体展示',
  artifact: '查看关联文物', booking: '预约参观', tour: '展览导览', modeLabel: '观察模式', modeGroup: '展品显示模式', solidModel: '实体模型', returnSolid: '返回实体', pointsOn: '点云已开启', pointCloud: '点云解构', returnSolidModel: '返回实体模型',
  viewsTitle: '视角切换', views: ['正面', '左侧', '右侧', '背面', '俯视'], current: '当前展品', infoTitle: '展项信息',
  steps: ['器形概览', '鼎之结构', '纹样细节', '材质层次', '点云解构', '来源说明'], title: '三足青铜鼎 · 1962.281',
  notes: '本展项以 Cleveland Museum of Art 1962.281 Tripod (Ding) 的 CC0 模型为基础网格，保留原始器型与纹样，由项目完成法线、AO、粗糙度、金属度和局部氧化铜绿重制，并使用浅色博物馆展厅呈现。该版本不是馆方扫描数据或官方复原。请拖动模型旋转视角，使用滚轮或双指缩放；若设备不支持 WebGL，仍可查看封面图和文字说明。',
} : {
  loading: 'Loading the digital exhibit…', loadFailed: 'Unable to open this exhibit', backGallery: 'Back to 3D Gallery', scene: '06 | BRONZE GALLERY | DIGITAL EXHIBIT', wall: [['BETWEEN THE RIVERS', 'WHERE CIVILIZATION BEGAN'], ['HELUO CULTURE', 'A CRADLE OF CHINESE CIVILIZATION']],
  toolsAria: 'View controls', tools: ['Rotate', 'Zoom in', 'Zoom out', 'Reset'], info: 'View exhibit details', back: 'Back to gallery',
  factLabels: ['Source', 'Material', 'About'], material: 'Recrafted aged-bronze PBR', factDescription: 'A digital model of Tripod (Ding) 1962.281 from the Cleveland Museum of Art, preserving the original form and motifs with a rebuilt aged-bronze PBR material. Rotate, zoom and inspect it from multiple viewpoints.',
  genericFactLabels: ['Exhibit', 'Material', 'About'], digitalExhibit: 'Digital exhibit', renderMode: 'Render mode', solid: 'Solid', points: 'Points', particles: 'Point cloud active', pbr: 'PBR solid model',
  artifact: 'View related artifact', booking: 'Book a visit', tour: 'Exhibit tour', modeLabel: 'VIEW MODE', modeGroup: 'Exhibit display mode', solidModel: 'Solid model', returnSolid: 'Return to solid', pointsOn: 'Point cloud on', pointCloud: 'Point cloud', returnSolidModel: 'Return to solid model',
  viewsTitle: 'Viewpoints', views: ['Front', 'Left', 'Right', 'Back', 'Top'], current: 'Current exhibit', infoTitle: 'Exhibit details',
  steps: ['Form overview', 'Ding structure', 'Motif details', 'Material layers', 'Point cloud', 'Source notes'], title: 'Tripod Ding · 1962.281',
  notes: 'This exhibit uses the CC0 Tripod (Ding) 1962.281 model from the Cleveland Museum of Art as its base mesh. The project preserves the original form and motifs while rebuilding normals, AO, roughness, metalness and localized patina for the web presentation. It is not museum scan data or an official reconstruction. Drag to rotate, then use the wheel or a two-finger gesture to zoom. A cover image and notes remain available when WebGL is unavailable.',
})
const isBronzeDing = computed(() => exhibit.value?.slug === 'heluo-bronze-ding-3d')
const displayTitle = computed(() => isBronzeDing.value ? copy.value.title : exhibit.value?.title ?? '')
const exhibitFacts = computed(() => isBronzeDing.value ? [
  { label: copy.value.factLabels[0], value: 'Cleveland Museum of Art · 1962.281' },
  { label: copy.value.factLabels[1], value: copy.value.material },
  { label: copy.value.factLabels[2], value: copy.value.factDescription },
] : [
  { label: copy.value.genericFactLabels[0], value: exhibit.value?.title ?? '' },
  { label: copy.value.genericFactLabels[1], value: copy.value.digitalExhibit },
  { label: copy.value.genericFactLabels[2], value: exhibit.value?.summary ?? '' },
])
const views = computed<Array<{ key:ViewName; label:string; thumbnail:string }>>(() => [
  { key:'front', label:copy.value.views[0], thumbnail:'/media/exhibits/views/bronze-ding-front-thumb.webp' },
  { key:'left', label:copy.value.views[1], thumbnail:'/media/exhibits/views/bronze-ding-side-thumb.webp' },
  { key:'right', label:copy.value.views[2], thumbnail:'/media/exhibits/views/bronze-ding-side-thumb.webp' },
  { key:'back', label:copy.value.views[3], thumbnail:'/media/exhibits/views/bronze-ding-back-thumb.webp' },
  { key:'top', label:copy.value.views[4], thumbnail:'/media/exhibits/views/bronze-ding-top-thumb.webp' },
])
const tourSteps = computed(() => copy.value.steps)
const activeTourStep = computed(() => displayMode.value === 'points' ? 5 : 1)
const pointCloudTourLabel = computed(() => displayMode.value === 'points' ? copy.value.returnSolidModel : copy.value.pointCloud)
const exhibitDescription = computed(() => isBronzeDing.value ? [copy.value.notes] : exhibit.value?.description.split(/\n\s*\n/) ?? [])
const renderedQuality = computed(() => locale.value === 'zh-CN' ? qualityLabel(renderQuality.value) : ({ high:'High quality', medium:'Balanced quality', low:'Performance mode', mobile:'Mobile quality', fallback:'Cover fallback' }[renderQuality.value]))

function revealExhibitShell() {
  if (!shouldRunGsapReveal() || !root.value || !exhibit.value) return
  gsapContext?.revert()
  gsapContext = createGsapContext(root.value, () => {
    const constrained = isConstrainedGsapReveal()
    const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } })
    timeline
      .from('[data-motion="scene-label"]', { autoAlpha: 0, x: constrained ? 0 : -12, duration: constrained ? 0.16 : 0.28 }, 0)
      .from('[data-motion="scene-copy"]', { autoAlpha: 0, x: (index) => constrained ? 0 : (index === 0 ? -14 : 14), duration: constrained ? 0.18 : 0.34, stagger: constrained ? 0.02 : 0.06, clearProps: 'transform' }, constrained ? 0.02 : 0.06)
      .from('[data-motion="exhibit-tools"]', { autoAlpha: 0, x: constrained ? 0 : -16, duration: constrained ? 0.18 : 0.34, clearProps: 'transform' }, constrained ? 0.04 : 0.14)
      .from('[data-motion="exhibit-tool"]', { autoAlpha: 0, x: constrained ? 0 : -8, duration: constrained ? 0.14 : 0.24, stagger: constrained ? 0.02 : 0.045, clearProps: 'transform' }, constrained ? 0.05 : 0.2)
      .from('[data-motion="exhibit-panel"]', { autoAlpha: 0, x: constrained ? 0 : 24, duration: constrained ? 0.18 : 0.44, clearProps: 'transform' }, constrained ? 0.05 : 0.12)
      .from('[data-motion="panel-heading"] > *', { autoAlpha: 0, y: constrained ? 4 : 10, duration: constrained ? 0.16 : 0.28, stagger: constrained ? 0.02 : 0.04, clearProps: 'transform' }, constrained ? 0.07 : 0.25)
      .from('[data-motion="panel-fact"]', { autoAlpha: 0, x: constrained ? 0 : 10, duration: constrained ? 0.16 : 0.26, stagger: constrained ? 0.025 : 0.05, clearProps: 'transform' }, constrained ? 0.09 : 0.31)
      .from('[data-motion="panel-action"]', { autoAlpha: 0, y: constrained ? 4 : 8, duration: constrained ? 0.16 : 0.24, stagger: constrained ? 0.02 : 0.04, clearProps: 'transform' }, constrained ? 0.11 : 0.42)
      .from('[data-motion="exhibit-dock"]', { autoAlpha: 0, y: constrained ? 8 : 26, duration: constrained ? 0.2 : 0.46, clearProps: 'transform' }, constrained ? 0.1 : 0.34)
      .from('[data-motion="dock-section"]', { autoAlpha: 0, y: constrained ? 4 : 12, duration: constrained ? 0.16 : 0.3, stagger: constrained ? 0.025 : 0.055, clearProps: 'transform' }, constrained ? 0.12 : 0.45)
  })
}

async function load() {
  loading.value = true
  error.value = ''
  try { exhibit.value = await apiGet<Exhibit>(`/exhibits/${encodeURIComponent(String(route.params.slug))}`) }
  catch (reason) { error.value = reason instanceof Error ? reason.message : copy.value.loadFailed }
  finally { loading.value = false; await nextTick(); revealExhibitShell() }
}
function selectMode(mode:'solid'|'points') { displayMode.value = mode; viewer.value?.setMode(mode) }
function togglePointCloud() { selectMode(displayMode.value === 'points' ? 'solid' : 'points') }
function chooseView(view:ViewName) { activeView.value = view; viewer.value?.setView(view, { animated: true }) }
function reset() { activeView.value = 'front'; viewer.value?.resetView() }
onMounted(load)
watch(() => route.fullPath, load)
onBeforeUnmount(() => gsapContext?.revert())
</script>

<template>
  <section v-if="loading" class="state-panel detail-state">{{ copy.loading }}</section>
  <section v-else-if="error" class="state-panel detail-state"><h1>{{ copy.loadFailed }}</h1><p>{{ error }}</p><RouterLink to="/exhibits">{{ copy.backGallery }}</RouterLink></section>
  <main v-else-if="exhibit" ref="root" class="immersive-exhibit" data-motion-page="exhibit-detail">
    <section class="exhibit-scene">
      <svg class="scene-route" viewBox="0 0 1672 720" preserveAspectRatio="none" aria-hidden="true"><path d="M0 585 C180 520 240 625 425 568 S720 612 895 536 1172 484 1672 548"/><path d="M20 610 C205 552 286 650 448 592 S742 635 913 558 1210 505 1650 575"/><circle cx="555" cy="571" r="3"/><circle cx="1128" cy="505" r="3"/><circle cx="1382" cy="526" r="3"/></svg>
      <div class="exhibit-wall-copy exhibit-wall-copy--left" data-motion="scene-copy"><b>{{ copy.wall[0][0] }}</b><span>{{ copy.wall[0][1] }}</span></div>
      <div class="exhibit-wall-copy exhibit-wall-copy--right" data-motion="scene-copy"><b>{{ copy.wall[1][0] }}</b><span>{{ copy.wall[1][1] }}</span></div>
      <p class="exhibit-scene-label" data-motion="scene-label">{{ copy.scene }}</p>
      <div class="exhibit-viewer-wrap"><ThreeExhibitViewer ref="viewer" :model-url="exhibit.modelUrl" :cover-image-url="exhibit.coverImageUrl" :alt="displayTitle" :enable-point-cloud="true" initial-mode="solid" @mode-change="displayMode = $event" @quality-change="renderQuality = $event" /></div>
      <div class="viewer-tools" data-glass="compact" data-motion="exhibit-tools" :aria-label="copy.toolsAria">
        <button data-motion="exhibit-tool" type="button" :aria-label="copy.tools[0]" @click="viewer?.rotate()"><i class="tool-rotate" aria-hidden="true"></i><span>{{ copy.tools[0] }}</span></button>
        <button data-motion="exhibit-tool" type="button" :aria-label="copy.tools[1]" @click="viewer?.zoomIn()"><i aria-hidden="true">＋</i><span>{{ copy.tools[1] }}</span></button>
        <button data-motion="exhibit-tool" type="button" :aria-label="copy.tools[2]" @click="viewer?.zoomOut()"><i aria-hidden="true">−</i><span>{{ copy.tools[2] }}</span></button>
        <button data-motion="exhibit-tool" type="button" :aria-label="copy.tools[3]" @click="reset"><i class="tool-reset" aria-hidden="true">◇</i><span>{{ copy.tools[3] }}</span></button>
      </div>
      <button class="mobile-exhibit-info-trigger" type="button" aria-haspopup="dialog" :aria-expanded="mobileInfoOpen" @click="mobileInfoOpen = true">{{ copy.info }}</button>
      <aside class="exhibit-panel exhibit-panel-desktop" data-glass="dark" data-motion="exhibit-panel">
        <div class="exhibit-panel-heading" data-motion="panel-heading">
          <div class="exhibit-panel-title">
            <p>EXHIBIT 06 <span>DIGITAL COLLECTION</span></p>
            <h1><i aria-hidden="true"></i>{{ displayTitle }}</h1>
          </div>
          <RouterLink class="exhibit-panel-back" to="/exhibits">← {{ copy.back }}</RouterLink>
        </div>
        <dl>
          <div v-for="(fact, index) in exhibitFacts" :key="fact.label" data-motion="panel-fact"><dt>{{ ['◷', '▱', '☷'][index] }}　{{ fact.label }}</dt><dd>{{ fact.value }}</dd></div>
        </dl>
        <div class="mode-switch" data-glass="compact" :aria-label="copy.renderMode"><button type="button" :class="{ active: displayMode === 'solid' }" :aria-pressed="displayMode === 'solid'" @click="selectMode('solid')">{{ copy.solid }}</button><button type="button" :class="{ active: displayMode === 'points' }" :aria-pressed="displayMode === 'points'" :disabled="renderQuality === 'fallback'" @click="selectMode('points')">{{ copy.points }}</button></div>
        <p class="render-quality" aria-live="polite"><i aria-hidden="true"></i>{{ renderedQuality }} · {{ displayMode === 'points' ? copy.particles : copy.pbr }}</p>
        <div class="exhibit-panel-actions"><RouterLink data-motion="panel-action" :to="`/artifacts/${exhibit.artifact.slug}`">{{ copy.artifact }}　→</RouterLink><RouterLink data-motion="panel-action" to="/appointment">{{ copy.booking }}</RouterLink></div>
      </aside>
    </section>
    <section class="exhibit-dock" data-glass="light" data-motion="exhibit-dock">
      <div class="tour-route" data-motion="dock-section">
        <div class="tour-route__header">
          <h2>{{ copy.tour }} <span>{{ activeTourStep }} / 6</span></h2>
          <div class="dock-mode-switch" data-glass="compact" role="group" :aria-label="copy.modeGroup" :data-label="copy.modeLabel" :data-mode="displayMode">
            <button type="button" :class="{ active: displayMode === 'solid' }" :aria-pressed="displayMode === 'solid'" @click="selectMode('solid')"><Box aria-hidden="true" /><span>{{ displayMode === 'points' ? copy.returnSolid : copy.solidModel }}</span></button>
            <button type="button" :class="{ active: displayMode === 'points' }" :aria-pressed="displayMode === 'points'" :disabled="renderQuality === 'fallback'" @click="selectMode('points')"><Connection aria-hidden="true" /><span>{{ displayMode === 'points' ? copy.pointsOn : copy.pointCloud }}</span></button>
          </div>
        </div>
        <ol><li v-for="(step, index) in tourSteps" :key="step" :class="{ active: activeTourStep === index + 1 }" :aria-current="activeTourStep === index + 1 ? 'step' : undefined"><button v-if="index === 4" type="button" :aria-label="pointCloudTourLabel" :aria-pressed="displayMode === 'points'" @click="togglePointCloud">{{ pointCloudTourLabel }}</button><span v-else>{{ step }}</span></li></ol>
      </div>
      <div class="view-switcher" data-motion="dock-section"><h2>{{ copy.viewsTitle }}</h2><div><button v-for="view in views" :key="view.key" type="button" :class="{ active: activeView === view.key }" :data-view="view.key" :aria-label="view.label" :aria-pressed="activeView === view.key" @click="chooseView(view.key)"><img :src="isBronzeDing ? view.thumbnail : exhibit.coverImageUrl" alt=""/><span>{{ view.label }}</span></button></div></div>
      <div class="exhibit-location" data-motion="dock-section"><svg viewBox="0 0 120 54" aria-hidden="true"><path d="M5 34 C18 8 34 42 51 20 S82 13 96 31 108 44 116 18"/><circle cx="8" cy="33" r="3"/></svg><p><span>{{ copy.current }}</span><b>{{ displayTitle }}</b>Cleveland Museum of Art</p></div>
    </section>
    <article class="exhibit-description"><p class="eyebrow">EXHIBIT NOTES</p><p v-for="part in exhibitDescription" :key="part">{{ part }}</p></article>
    <BottomSheet :open="mobileInfoOpen" :title="copy.infoTitle" :snap-point="mobileInfoSnapPoint" @close="mobileInfoOpen = false" @update:snap-point="mobileInfoSnapPoint = $event">
      <div class="mobile-exhibit-info"><h2>{{ displayTitle }}</h2><dl><div v-for="fact in exhibitFacts" :key="fact.label"><dt>{{ fact.label }}</dt><dd>{{ fact.value }}</dd></div></dl><div class="mode-switch" :aria-label="copy.renderMode"><button type="button" :class="{ active: displayMode === 'solid' }" :aria-pressed="displayMode === 'solid'" @click="selectMode('solid')">{{ copy.solid }}</button><button type="button" :class="{ active: displayMode === 'points' }" :aria-pressed="displayMode === 'points'" :disabled="renderQuality === 'fallback'" @click="selectMode('points')">{{ copy.points }}</button></div><div class="exhibit-panel-actions"><RouterLink :to="`/artifacts/${exhibit.artifact.slug}`">{{ copy.artifact }}　→</RouterLink><RouterLink to="/appointment">{{ copy.booking }}</RouterLink></div></div>
    </BottomSheet>
  </main>
</template>
