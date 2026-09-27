<script setup lang="ts">
import '../assets/route-exhibit-detail-legacy.css'
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { gsap } from 'gsap'
import { Box, Connection, InfoFilled, VideoPlay } from '@element-plus/icons-vue'
import { qualityLabel, type PointCloudQuality } from '../lib/pointCloudQuality'
import { apiGet } from '../lib/api'
import BottomSheet from '../components/BottomSheet.vue'
import { useLocale } from '../stores/locale'
import { createGsapContext, isConstrainedGsapReveal, shouldRunGsapReveal } from '../lib/gsap'
import { requiresManualExhibitActivation, selectExhibitModelSource } from '../lib/exhibitInteraction'
import { consumeExhibitRuntimeRecovery, reloadExhibitRuntime } from '../lib/exhibitRuntimeRecovery'

type ViewName = 'front' | 'left' | 'right' | 'back' | 'top'
type ViewerRuntimeState = 'poster' | 'activating' | 'loading-runtime' | 'loading-model' | 'compiling-first-frame' | 'ready' | 'error'
interface Exhibit {
  slug:string; title:string; summary:string; description:string; modelUrl:string; modelFormat:string; modelSizeBytes:number; coverImageUrl:string;
  mobileModelUrl?:string|null; mobileModelSizeBytes?:number|null;
  displayNo:string; sourceCredit:string; sourceUrl:string; licenseLabel:string; collectionLocation:string;
  artifact:{slug:string;title:string}
}
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
const viewerRuntimeRequested = ref(false)
const viewerRuntimeState = ref<ViewerRuntimeState>('poster')
const viewerRuntimeError = ref('')
const viewerKey = ref(0)
const preferMobileModel = ref(false)
const pointCloudLoading = ref(false)
const pointCloudFailed = ref(false)
let gsapContext: gsap.Context | undefined
let modelPreloadLink: HTMLLinkElement | undefined
const ThreeExhibitViewer = defineAsyncComponent({
  loader: () => import('../components/ThreeExhibitViewer.vue'),
  delay: 0,
  onError() {
    clearModelPreload()
    viewerRuntimeError.value = navigator.onLine === false ? copy.value.viewerOffline : copy.value.viewerUnavailable
    viewerRuntimeState.value = 'error'
  },
})
const copy = computed(() => locale.value === 'zh-CN' ? {
  viewerOffline: '网络已断开，请恢复连接后重试启动。',
  pointCloudFailed: '点云暂时无法构建，实体模型仍可查看。可再次选择点云重试。',
  loading: '正在加载数字展项…', loadFailed: '无法打开该展项', backGallery: '返回数字展厅', scene: '深墨青铜厅｜数字展厅', wall: [['河洛之间', '文明肇始'], ['河洛文化', '中华文明重要源地']],
  toolsAria: '视角控制', tools: ['旋转', '放大', '缩小', '重置'], info: '查看展项信息', back: '返回展厅',
  factLabels: ['来源', '材质', '位置'], material: '古青铜 PBR 网页重制', unknownSource: '项目组数字重制', noDescription: '数字展项说明',
  genericFactLabels: ['展项', '材质', '说明'], digitalExhibit: '数字展项', renderMode: '渲染模式', solid: '实体', points: '点云', particles: '粒子解构中', pbr: 'PBR 实体展示',
  artifact: '查看关联文物', booking: '预约参观', tour: '展览导览', modeLabel: '观察模式', modeGroup: '展品显示模式', solidModel: '实体模型', returnSolid: '返回实体', pointsOn: '点云已开启', pointCloudMode: '点云模式', pointCloudTour: '点云讲解', returnSolidModel: '返回实体模型',
  viewsTitle: '视角切换', views: ['正面', '左侧', '右侧', '背面', '俯视'], current: '当前展品', infoTitle: '展项信息',
  steps: ['器形概览', '结构观察', '纹样细节', '材质层次', '点云解构', '来源说明'], title: '数字展项', enterViewer: '进入互动 3D', preparingViewer: '正在准备互动 3D…', retryViewer: '重试启动', viewerUnavailable: '互动 3D 资源加载失败，请重试启动。', posterHint: '启动后可旋转、缩放并切换观察视角。', modelSize: '模型体积', pointCloudLoading: '正在构建点云…', pointCloudBusy: '构建中',
} : {
  viewerOffline: 'You are offline. Reconnect before retrying 3D.',
  pointCloudFailed: 'The point cloud could not be built. The solid model remains available. Select Points to retry.',
  loading: 'Loading the digital exhibit…', loadFailed: 'Unable to open this exhibit', backGallery: 'Back to 3D Gallery', scene: 'BRONZE GALLERY | DIGITAL EXHIBIT', wall: [['BETWEEN THE RIVERS', 'WHERE CIVILIZATION BEGAN'], ['HELUO CULTURE', 'A CRADLE OF CHINESE CIVILIZATION']],
  toolsAria: 'View controls', tools: ['Rotate', 'Zoom in', 'Zoom out', 'Reset'], info: 'View exhibit details', back: 'Back to gallery',
  factLabels: ['Source', 'Material', 'Location'], material: 'Recrafted aged-bronze PBR', unknownSource: 'Project digital reconstruction', noDescription: 'Digital exhibit notes',
  genericFactLabels: ['Exhibit', 'Material', 'About'], digitalExhibit: 'Digital exhibit', renderMode: 'Render mode', solid: 'Solid', points: 'Points', particles: 'Point cloud active', pbr: 'PBR solid model',
  artifact: 'View related artifact', booking: 'Book a visit', tour: 'Exhibit tour', modeLabel: 'VIEW MODE', modeGroup: 'Exhibit display mode', solidModel: 'Solid model', returnSolid: 'Return to solid', pointsOn: 'Point cloud on', pointCloudMode: 'Point cloud mode', pointCloudTour: 'Point cloud guide', returnSolidModel: 'Return to solid model',
  viewsTitle: 'Viewpoints', views: ['Front', 'Left', 'Right', 'Back', 'Top'], current: 'Current exhibit', infoTitle: 'Exhibit details',
  steps: ['Form overview', 'Structure', 'Motif details', 'Material layers', 'Point cloud', 'Source notes'], title: 'Digital exhibit', enterViewer: 'Enter interactive 3D', preparingViewer: 'Preparing interactive 3D…', retryViewer: 'Retry 3D', viewerUnavailable: 'Interactive 3D resources could not be loaded. Please retry.', posterHint: 'Start to rotate, zoom, and inspect the exhibit.', modelSize: 'Model size', pointCloudLoading: 'Building point cloud…', pointCloudBusy: 'Building',
})
const displayTitle = computed(() => exhibit.value?.title || copy.value.title)
const sceneLabel = computed(() => `${exhibit.value?.displayNo ? `${exhibit.value.displayNo}｜` : ''}${copy.value.scene}`)
const exhibitFacts = computed(() => [
  { label: copy.value.factLabels[0], value: exhibit.value?.sourceCredit || copy.value.unknownSource },
  { label: copy.value.factLabels[1], value: exhibit.value?.licenseLabel || copy.value.material },
  { label: copy.value.factLabels[2], value: exhibit.value?.collectionLocation || exhibit.value?.summary || copy.value.noDescription },
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
const pointCloudTourLabel = computed(() => displayMode.value === 'points' ? copy.value.returnSolidModel : copy.value.pointCloudTour)
const exhibitDescription = computed(() => {
  const description = exhibit.value?.description?.trim()
  return description ? description.split(/\n\s*\n/) : exhibit.value?.summary ? [exhibit.value.summary] : [copy.value.noDescription]
})
const renderedQuality = computed(() => locale.value === 'zh-CN' ? qualityLabel(renderQuality.value) : ({ high:'High quality', medium:'Balanced quality', low:'Performance mode', mobile:'Mobile quality', fallback:'Solid fallback' }[renderQuality.value]))
const activeModel = computed(() => exhibit.value ? selectExhibitModelSource(exhibit.value, preferMobileModel.value) : null)
const viewerInteractive = computed(() => viewerRuntimeState.value === 'ready')
const posterStatus = computed(() => viewerRuntimeState.value === 'error' ? viewerRuntimeError.value || copy.value.viewerUnavailable : copy.value.posterHint)
const formattedModelSize = computed(() => {
  const bytes = activeModel.value?.sizeBytes
  if (!bytes || bytes <= 0) return ''
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : `${Math.ceil(bytes / 1024)} KB`
})

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

let detailRequestId = 0
function clearModelPreload() {
  modelPreloadLink?.remove()
  modelPreloadLink = undefined
}

function preloadActiveModel() {
  const modelUrl = activeModel.value?.url
  if (!modelUrl) return
  const resolvedUrl = new URL(modelUrl, window.location.href).href
  if (modelPreloadLink?.isConnected && modelPreloadLink.href === resolvedUrl) return
  clearModelPreload()
  const link = document.createElement('link')
  link.rel = 'preload'
  link.as = 'fetch'
  link.href = resolvedUrl
  link.crossOrigin = 'anonymous'
  link.dataset.heluoThreeModelPreload = 'true'
  document.head.appendChild(link)
  modelPreloadLink = link
}

function resetViewerRuntime() {
  clearModelPreload()
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  const coarsePointer = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
  const manualActivation = requiresManualExhibitActivation({
    coarsePointer,
    saveData: connection?.saveData,
    effectiveType: connection?.effectiveType,
    memoryGiB: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
  })
  preferMobileModel.value = manualActivation || window.innerWidth <= 760
  viewerRuntimeRequested.value = consumeExhibitRuntimeRecovery() || !manualActivation
  viewerRuntimeState.value = viewerRuntimeRequested.value ? 'activating' : 'poster'
  viewerRuntimeError.value = ''
  viewerKey.value += 1
  viewer.value = null
  displayMode.value = 'solid'
  renderQuality.value = 'medium'
  activeView.value = 'front'
  pointCloudLoading.value = false
  pointCloudFailed.value = false
}

function activateViewer() {
  if (navigator.onLine === false) {
    viewerRuntimeError.value = copy.value.viewerOffline
    viewerRuntimeState.value = 'error'
    return
  }
  if (viewerRuntimeState.value === 'error' && viewerRuntimeError.value) {
    viewerRuntimeState.value = 'activating'
    reloadExhibitRuntime()
    return
  }
  preloadActiveModel()
  viewerRuntimeRequested.value = true
  viewerRuntimeState.value = 'activating'
  viewerRuntimeError.value = ''
}

function handleViewerState(state: ViewerRuntimeState) {
  viewerRuntimeState.value = state
  if (state === 'ready' || state === 'error') clearModelPreload()
  if (state !== 'error') viewerRuntimeError.value = ''
}

function handlePointCloudState(state: 'idle' | 'loading' | 'ready' | 'error') {
  pointCloudLoading.value = state === 'loading'
  pointCloudFailed.value = state === 'error'
}

async function load() {
  const requestId = ++detailRequestId
  resetViewerRuntime()
  loading.value = true
  error.value = ''
  exhibit.value = null
  try {
    const result = await apiGet<Exhibit>(`/exhibits/${encodeURIComponent(String(route.params.slug))}`)
    if (requestId === detailRequestId) exhibit.value = result
  }
  catch (reason) { if (requestId === detailRequestId) error.value = reason instanceof Error ? reason.message : copy.value.loadFailed }
  finally {
    if (requestId !== detailRequestId) return
    loading.value = false
    await nextTick()
    revealExhibitShell()
  }
  if (requestId === detailRequestId && exhibit.value === null) loading.value = false
}
function selectMode(mode:'solid'|'points') {
  if (!viewerInteractive.value || (mode === 'points' && pointCloudLoading.value)) return
  viewer.value?.setMode(mode)
}
function togglePointCloud() { selectMode(displayMode.value === 'points' ? 'solid' : 'points') }
function chooseView(view:ViewName) { if (!viewerInteractive.value) return; activeView.value = view; viewer.value?.setView(view, { animated: true }) }
function reset() { if (!viewerInteractive.value) return; activeView.value = 'front'; viewer.value?.resetView() }
onMounted(load)
watch(() => route.params.slug, load)
onBeforeUnmount(() => {
  gsapContext?.revert()
  clearModelPreload()
})
</script>

<template>
  <section v-if="loading" class="state-panel detail-state">{{ copy.loading }}</section>
  <section v-else-if="error" class="state-panel detail-state"><h1>{{ copy.loadFailed }}</h1><p>{{ error }}</p><RouterLink to="/exhibits">{{ copy.backGallery }}</RouterLink></section>
  <section v-else-if="exhibit" ref="root" class="immersive-exhibit" data-motion-page="exhibit-detail">
    <section class="exhibit-scene">
      <svg class="scene-route" viewBox="0 0 1672 720" preserveAspectRatio="none" aria-hidden="true"><path d="M0 585 C180 520 240 625 425 568 S720 612 895 536 1172 484 1672 548"/><path d="M20 610 C205 552 286 650 448 592 S742 635 913 558 1210 505 1650 575"/><circle cx="555" cy="571" r="3"/><circle cx="1128" cy="505" r="3"/><circle cx="1382" cy="526" r="3"/></svg>
      <div class="exhibit-wall-copy exhibit-wall-copy--left" data-motion="scene-copy"><b>{{ copy.wall[0][0] }}</b><span>{{ copy.wall[0][1] }}</span></div>
      <div class="exhibit-wall-copy exhibit-wall-copy--right" data-motion="scene-copy"><b>{{ copy.wall[1][0] }}</b><span>{{ copy.wall[1][1] }}</span></div>
      <p class="exhibit-scene-label" data-motion="scene-label">{{ sceneLabel }}</p>
      <RouterLink class="exhibit-back exhibit-back-mobile" to="/exhibits">← {{ copy.back }}</RouterLink>
      <div class="exhibit-viewer-wrap" :data-viewer-state="viewerRuntimeState">
        <ThreeExhibitViewer
          v-if="viewerRuntimeRequested && activeModel"
          :key="viewerKey"
          ref="viewer"
          :model-url="activeModel.url"
          :cover-image-url="exhibit.coverImageUrl"
          :alt="displayTitle"
          :enable-point-cloud="true"
          initial-mode="solid"
          @mode-change="displayMode = $event"
          @quality-change="renderQuality = $event"
          @state-change="handleViewerState"
          @point-cloud-state="handlePointCloudState"
        />
        <div v-if="!viewerRuntimeRequested || viewerRuntimeState === 'activating' || (viewerRuntimeState === 'error' && viewerRuntimeError)" class="three-viewer">
          <div class="three-fallback three-fallback--activation" role="status" aria-live="polite">
            <img :src="exhibit.coverImageUrl" :alt="displayTitle" decoding="async" fetchpriority="high" />
            <div class="viewer-poster-copy">
              <p>{{ viewerRuntimeState === 'activating' ? copy.preparingViewer : posterStatus }}<br><small v-if="formattedModelSize">{{ copy.modelSize }}：{{ formattedModelSize }}</small></p>
              <div v-if="viewerRuntimeState !== 'activating'" class="viewer-poster-actions">
                <button class="viewer-poster-start" type="button" @click="activateViewer"><VideoPlay aria-hidden="true" /><span>{{ viewerRuntimeState === 'error' ? copy.retryViewer : copy.enterViewer }}</span></button>
                <button class="viewer-poster-info" type="button" aria-haspopup="dialog" :aria-expanded="mobileInfoOpen" @click="mobileInfoOpen = true"><InfoFilled aria-hidden="true" /><span>{{ copy.info }}</span></button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="viewer-tools" data-glass="compact" data-motion="exhibit-tools" role="group" :aria-label="copy.toolsAria">
        <button data-motion="exhibit-tool" type="button" :aria-label="copy.tools[0]" :disabled="!viewerInteractive" @click="viewer?.rotate()"><i class="tool-rotate" aria-hidden="true"></i><span>{{ copy.tools[0] }}</span></button>
        <button data-motion="exhibit-tool" type="button" :aria-label="copy.tools[1]" :disabled="!viewerInteractive" @click="viewer?.zoomIn()"><i aria-hidden="true">＋</i><span>{{ copy.tools[1] }}</span></button>
        <button data-motion="exhibit-tool" type="button" :aria-label="copy.tools[2]" :disabled="!viewerInteractive" @click="viewer?.zoomOut()"><i aria-hidden="true">−</i><span>{{ copy.tools[2] }}</span></button>
        <button data-motion="exhibit-tool" type="button" :aria-label="copy.tools[3]" :disabled="!viewerInteractive" @click="reset"><i class="tool-reset" aria-hidden="true">◇</i><span>{{ copy.tools[3] }}</span></button>
      </div>
      <button v-if="viewerRuntimeState === 'ready'" class="mobile-exhibit-info-trigger" type="button" aria-haspopup="dialog" :aria-expanded="mobileInfoOpen" @click="mobileInfoOpen = true"><InfoFilled aria-hidden="true" /><span>{{ copy.info }}</span></button>
      <aside class="exhibit-panel exhibit-panel-desktop" data-glass="dark" data-motion="exhibit-panel">
        <div class="exhibit-panel-heading" data-motion="panel-heading">
          <div class="exhibit-panel-title">
            <p>EXHIBIT {{ exhibit.displayNo || '—' }} <span>DIGITAL COLLECTION</span></p>
            <h1><i aria-hidden="true"></i>{{ displayTitle }}</h1>
          </div>
          <RouterLink class="exhibit-panel-back" to="/exhibits">← {{ copy.back }}</RouterLink>
        </div>
        <dl>
          <div v-for="(fact, index) in exhibitFacts" :key="fact.label" data-motion="panel-fact"><dt>{{ ['◷', '▱', '☷'][index] }}　{{ fact.label }}</dt><dd>{{ fact.value }}</dd></div>
        </dl>
        <div class="mode-switch" data-galaxy-segmented data-glass="compact" :aria-label="copy.renderMode"><button type="button" :class="{ active: displayMode === 'solid' }" :aria-pressed="displayMode === 'solid'" :disabled="!viewerInteractive" @click="selectMode('solid')">{{ copy.solid }}</button><button type="button" :class="{ active: displayMode === 'points' }" :aria-pressed="displayMode === 'points'" :aria-busy="pointCloudLoading" :disabled="!viewerInteractive || pointCloudLoading || renderQuality === 'fallback'" @click="selectMode('points')">{{ pointCloudLoading ? copy.pointCloudBusy : copy.points }}</button></div>
        <p class="render-quality" aria-live="polite"><i aria-hidden="true"></i>{{ pointCloudLoading ? copy.pointCloudLoading : pointCloudFailed ? copy.pointCloudFailed : `${renderedQuality} · ${displayMode === 'points' ? copy.particles : copy.pbr}` }}</p>
        <div class="exhibit-panel-actions"><RouterLink data-motion="panel-action" :to="`/artifacts/${exhibit.artifact.slug}`">{{ copy.artifact }}　→</RouterLink><RouterLink data-motion="panel-action" to="/appointment">{{ copy.booking }}</RouterLink></div>
      </aside>
    </section>
    <section class="exhibit-dock" data-glass="light" data-motion="exhibit-dock">
      <div class="tour-route" data-motion="dock-section">
        <div class="tour-route__header">
          <h2>{{ copy.tour }} <span>{{ activeTourStep }} / 6</span></h2>
          <div class="dock-mode-switch" data-galaxy-segmented data-glass="compact" role="group" :aria-label="copy.modeGroup" :data-label="copy.modeLabel" :data-mode="displayMode">
            <button type="button" :class="{ active: displayMode === 'solid' }" :aria-pressed="displayMode === 'solid'" :disabled="!viewerInteractive" @click="selectMode('solid')"><Box aria-hidden="true" /><span>{{ displayMode === 'points' ? copy.returnSolid : copy.solidModel }}</span></button>
            <button type="button" :class="{ active: displayMode === 'points' }" :aria-pressed="displayMode === 'points'" :aria-busy="pointCloudLoading" :disabled="!viewerInteractive || pointCloudLoading || renderQuality === 'fallback'" @click="selectMode('points')"><Connection aria-hidden="true" /><span>{{ pointCloudLoading ? copy.pointCloudBusy : displayMode === 'points' ? copy.pointsOn : copy.pointCloudMode }}</span></button>
          </div>
        </div>
        <p v-if="pointCloudFailed" class="point-cloud-error" role="status">{{ copy.pointCloudFailed }}</p>
        <ol v-else tabindex="0" :aria-label="copy.tour"><li v-for="(step, index) in tourSteps" :key="step" :class="{ active: activeTourStep === index + 1 }" :aria-current="activeTourStep === index + 1 ? 'step' : undefined"><button v-if="index === 4" type="button" :aria-label="pointCloudTourLabel" :aria-pressed="displayMode === 'points'" :disabled="!viewerInteractive || pointCloudLoading || renderQuality === 'fallback'" @click="togglePointCloud">{{ pointCloudLoading ? copy.pointCloudBusy : pointCloudTourLabel }}</button><span v-else>{{ step }}</span></li></ol>
      </div>
      <div class="view-switcher" data-motion="dock-section"><h2>{{ copy.viewsTitle }}</h2><div tabindex="0" role="group" :aria-label="copy.viewsTitle"><button v-for="view in views" :key="view.key" type="button" :class="{ active: activeView === view.key }" :data-view="view.key" :aria-label="view.label" :aria-pressed="activeView === view.key" :disabled="!viewerInteractive" @click="chooseView(view.key)"><img :src="view.thumbnail || exhibit.coverImageUrl" alt=""/><span>{{ view.label }}</span></button></div></div>
      <div class="exhibit-location" data-motion="dock-section"><svg viewBox="0 0 120 54" aria-hidden="true"><path d="M5 34 C18 8 34 42 51 20 S82 13 96 31 108 44 116 18"/><circle cx="8" cy="33" r="3"/></svg><p><span>{{ copy.current }}</span><b>{{ displayTitle }}</b>{{ exhibit.collectionLocation || copy.digitalExhibit }}</p></div>
    </section>
    <article class="exhibit-description"><p class="eyebrow">EXHIBIT NOTES</p><p v-for="part in exhibitDescription" :key="part">{{ part }}</p></article>
    <BottomSheet :open="mobileInfoOpen" :title="copy.infoTitle" :snap-point="mobileInfoSnapPoint" @close="mobileInfoOpen = false" @update:snap-point="mobileInfoSnapPoint = $event">
      <div class="mobile-exhibit-info"><h2>{{ displayTitle }}</h2><dl><div v-for="fact in exhibitFacts" :key="fact.label"><dt>{{ fact.label }}</dt><dd>{{ fact.value }}</dd></div></dl><div class="mode-switch" data-galaxy-segmented :aria-label="copy.renderMode"><button type="button" :class="{ active: displayMode === 'solid' }" :aria-pressed="displayMode === 'solid'" :disabled="!viewerInteractive" @click="selectMode('solid')">{{ copy.solid }}</button><button type="button" :class="{ active: displayMode === 'points' }" :aria-pressed="displayMode === 'points'" :aria-busy="pointCloudLoading" :disabled="!viewerInteractive || pointCloudLoading || renderQuality === 'fallback'" @click="selectMode('points')">{{ pointCloudLoading ? copy.pointCloudBusy : copy.points }}</button></div><p v-if="pointCloudFailed" role="status">{{ copy.pointCloudFailed }}</p><div class="exhibit-panel-actions"><RouterLink :to="`/artifacts/${exhibit.artifact.slug}`">{{ copy.artifact }}　→</RouterLink><RouterLink to="/appointment">{{ copy.booking }}</RouterLink></div></div>
    </BottomSheet>
  </section>
</template>

<style scoped>
.point-cloud-error { margin: .5rem 0 0; color: var(--color-ink); font-size: .75rem; line-height: 1.5; overflow-wrap: anywhere; }
</style>
