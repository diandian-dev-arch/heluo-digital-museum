<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { BufferGeometry, Group, Material, Mesh, PerspectiveCamera, Points, ShaderMaterial, Vector3 } from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { createRetryableAsyncLoader, interpolateExhibitOrbitOffset, selectExhibitCameraDistanceScale, selectExhibitCanvasTouchAction, selectExhibitRenderProfile } from '../lib/exhibitInteraction'
import { createWorldSamplingSurfaces } from '../lib/pointCloudGeometry'
import { createDisposalScope, runInTimeSlices, yieldToMainThread } from '../lib/exhibitLifecycle'
import { POINT_COUNTS, createPointCloudPerformanceMonitor, selectPointCloudPalette, selectPointCloudPointSize, selectPointCloudQuality, type PointCloudQuality, type PointCloudTheme } from '../lib/pointCloudQuality'
import { applyDeadZone, exponentialStep, readPointerMotionCapabilities, resolveExhibitPointerPolicy, selectEffectiveMotionTier, selectPointerMotionTier, type MotionTier } from '../lib/pointerMotion'
import { useLocale } from '../stores/locale'

type DisplayMode = 'solid' | 'points'
type ViewName = 'front' | 'left' | 'right' | 'back' | 'top'
type ViewerRuntimeState = 'loading-runtime' | 'loading-model' | 'compiling-first-frame' | 'ready' | 'error'
type PointCloudState = 'idle' | 'loading' | 'ready' | 'error'
type OpacityMaterial = Material & { opacity: number; transparent: boolean; depthWrite: boolean }
type PointCloudAnimationState = 'solid' | 'points-idle' | 'mode-transition' | 'fallback'
type PointCloudTransition = { fromMix: number; toMix: number; fromGather: number; toGather: number; gatherArc: number; start: number; duration: number }

const THREE_FIRST_FRAME_MARK = 'heluo-three-first-frame-ready'
const THREE_FIRST_FRAME_EVENT = 'heluo:three-first-frame-ready'

const props = withDefaults(defineProps<{
  modelUrl: string
  coverImageUrl: string
  alt: string
  enablePointCloud?: boolean
  initialMode?: DisplayMode
}>(), { enablePointCloud: true, initialMode: 'solid' })
const emit = defineEmits<{
  (event: 'mode-change', value: DisplayMode): void
  (event: 'quality-change', value: PointCloudQuality): void
  (event: 'state-change', value: ViewerRuntimeState): void
  (event: 'point-cloud-state', value: PointCloudState): void
}>()
const { locale } = useLocale()
const viewerCopy = computed(() => locale.value === 'zh-CN' ? {
  unsupported: '当前浏览器不支持 WebGL，已为你保留展项封面和说明。', loadFailed: '3D 模型暂时无法加载，已切换为展项封面和文字说明。你可以稍后重试。', unavailable: '互动 3D 展项暂时不可用，已切换为展项封面和文字说明。你可以稍后重试。',
  aria: '的可旋转 3D 模型', loading: '正在构建数字展项…', retry: '重试加载', contextLost: '3D 显示连接已中断，展项封面和说明仍可查看。请重试加载。',
} : {
  unsupported: 'This browser does not support WebGL. The exhibit cover and notes remain available.', loadFailed: 'The 3D model could not be loaded. The exhibit cover and notes are shown instead. Please try again later.', unavailable: 'The interactive 3D exhibit is temporarily unavailable. The cover and notes are shown instead. Please try again later.',
  aria: ' — rotatable 3D model', loading: 'Building the digital exhibit…', retry: 'Try again', contextLost: 'The 3D display connection was interrupted. The exhibit cover and notes remain available. Please retry.',
})

const container = ref<HTMLDivElement | null>(null)
const loading = ref(true)
const loadingProgress = ref(0)
const error = ref('')
let cleanup: (() => void) | undefined
let controlsRef: OrbitControls | undefined
let cameraRef: PerspectiveCamera | undefined
let targetRef: Vector3 | undefined
let cameraTransition: { from: Vector3; to: Vector3; start: number; duration: number } | undefined
let pointerInteractionRef: { pause: (duration?: number) => void } | undefined
let changeMode: (mode: DisplayMode) => void = () => undefined
let quality: PointCloudQuality = 'medium'
let activeMode: DisplayMode = props.initialMode
let initializationVersion = 0
const loadMeshSurfaceSampler = createRetryableAsyncLoader(() => import('three/examples/jsm/math/MeshSurfaceSampler.js'))

const clamp = (value: number) => Math.min(Math.max(value, 0), 1)
const easeOut = (value: number) => 1 - Math.pow(1 - clamp(value), 3)
const smootherStep = (value: number) => {
  const progress = clamp(value)
  return progress * progress * progress * (progress * (progress * 6 - 15) + 10)
}
const POINT_CLOUD_INTRO_DURATION = 1800
const POINT_CLOUD_INTRO_GATHER_ARC = .78
const views: Record<ViewName, [number, number, number]> = {
  front: [0, .5, 9.7], left: [-6.15, .8, 6.4], right: [6.15, .8, 6.4], back: [0, .5, -9.7], top: [0, 9.45, .8],
}

function selectQuality(): PointCloudQuality {
  const nav = navigator as Navigator & { deviceMemory?: number }
  return selectPointCloudQuality({
    width: window.innerWidth,
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    cores: nav.hardwareConcurrency,
    memoryGiB: nav.deviceMemory,
  })
}

function disposeMaterial(material: Material, disposed: Set<unknown>) {
  if (disposed.has(material)) return
  disposed.add(material)
  Object.values(material).forEach((value) => {
    if (value && typeof value === 'object' && 'isTexture' in value && 'dispose' in value && !disposed.has(value)) {
      disposed.add(value)
      ;(value as { dispose: () => void }).dispose()
    }
  })
  material.dispose()
}

function disposeScene(scene: import('three').Object3D, disposed = new Set<unknown>()) {
  scene.traverse((object) => {
    const item = object as import('three').Object3D & { geometry?: { dispose?: () => void }; material?: Material | Material[]; shadow?: { dispose: () => void } }
    if (item.geometry && !disposed.has(item.geometry)) { disposed.add(item.geometry); item.geometry.dispose?.() }
    if (item.shadow && !disposed.has(item.shadow)) { disposed.add(item.shadow); item.shadow.dispose() }
    const materials = item.material ? (Array.isArray(item.material) ? item.material : [item.material]) : []
    materials.forEach((material) => disposeMaterial(material, disposed))
  })
}

function setView(name: ViewName, options: { animated?: boolean } = {}) {
  if (!cameraRef || !controlsRef || !targetRef) return
  pointerInteractionRef?.pause(560)
  const [x, y, z] = views[name]
  const distanceScale = selectExhibitCameraDistanceScale({ width: window.innerWidth })
  const nextPosition = cameraRef.position.clone().set(targetRef.x + x * distanceScale, targetRef.y + y * distanceScale, targetRef.z + z * distanceScale)
  if (options.animated !== false && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) cameraTransition = { from: cameraRef.position.clone(), to: nextPosition, start: performance.now(), duration: 520 }
  else cameraRef.position.copy(nextPosition)
  controlsRef.target.copy(targetRef)
  controlsRef.update()
}
function syncAutoRotateState() {
  if (container.value) container.value.dataset.autoRotate = String(Boolean(controlsRef?.autoRotate))
}
function rotate() {
  if (!controlsRef) return
  pointerInteractionRef?.pause(360)
  controlsRef.autoRotate = !controlsRef.autoRotate
  syncAutoRotateState()
}
function zoomBy(factor: number) {
  if (!cameraRef || !controlsRef) return
  pointerInteractionRef?.pause(320)
  cameraRef.position.copy(controlsRef.target.clone().add(cameraRef.position.clone().sub(controlsRef.target).multiplyScalar(factor)))
  controlsRef.update()
}
function zoomIn() { zoomBy(.83) }
function zoomOut() { zoomBy(1.17) }
function resetView() {
  if (controlsRef) controlsRef.autoRotate = false
  syncAutoRotateState()
  setView('front', { animated: true })
}
function setMode(mode: DisplayMode) { changeMode(mode) }
defineExpose({ rotate, zoomIn, zoomOut, resetView, setView, setMode })

async function initialize() {
  const version = ++initializationVersion
  cleanup?.()
  const resources = createDisposalScope()
  let disposed = false
  let host: HTMLDivElement | undefined
  const disposeRuntime = () => {
    if (disposed) return
    disposed = true
    resources.dispose()
    if (cleanup === disposeRuntime) {
      cameraTransition = undefined
      pointerInteractionRef = undefined
      controlsRef = undefined
      cameraRef = undefined
      targetRef = undefined
      changeMode = () => undefined
      cleanup = undefined
    }
    if (host) {
      for (const name of ['threeReady', 'threeReadyAt', 'autoRotate', 'themeFog', 'renderFpsWindow']) delete host.dataset[name]
      host.dataset.renderState = 'stopped'
    }
  }
  cleanup = disposeRuntime
  const fail = (message: string) => {
    if (disposed || version !== initializationVersion) return
    disposeRuntime()
    error.value = message
    loading.value = false
    emit('point-cloud-state', 'idle')
    emit('state-change', 'error')
  }
  loading.value = true
  loadingProgress.value = 0
  error.value = ''
  activeMode = props.initialMode
  emit('state-change', 'loading-runtime')
  emit('point-cloud-state', 'idle')
  await nextTick()
  if (disposed || version !== initializationVersion) return
  host = container.value ?? undefined
  performance.clearMarks(THREE_FIRST_FRAME_MARK)
  container.value?.removeAttribute('data-three-ready')
  container.value?.removeAttribute('data-three-ready-at')
  container.value?.removeAttribute('data-auto-rotate')
  if (!container.value || !window.WebGLRenderingContext) {
    fail(viewerCopy.value.unsupported)
    return
  }

  try {
    const [THREE, loaderModule, controlsModule, meshoptModule, environmentModule] = await Promise.all([
      import('three'),
      import('three/examples/jsm/loaders/GLTFLoader.js'),
      import('three/examples/jsm/controls/OrbitControls.js'),
      import('three/examples/jsm/libs/meshopt_decoder.module.js'),
      import('three/examples/jsm/environments/RoomEnvironment.js'),
    ])
    if (version !== initializationVersion || !container.value) return
    quality = selectQuality()
    host!.dataset.quality = quality
    host!.dataset.pointCloudState = 'idle'
    host!.dataset.renderSubmissions = '0'
    emit('quality-change', quality)
    const renderProfile = selectExhibitRenderProfile({ mobile: quality === 'mobile' })

    const scene = new THREE.Scene()
    const releasedResources = new Set<unknown>()
    resources.add(() => disposeScene(scene, releasedResources))
    // The confirmed moon-jade layout supplies the room as a DOM background.
    // Keep WebGL transparent so the real model sits naturally in that space.
    scene.background = null
    const sceneFog = new THREE.FogExp2('#eee9df', .006)
    let sceneTheme: PointCloudTheme = 'light'
    let syncCloudPalette: (() => void) | undefined
    let syncStageTheme: (() => void) | undefined
    const syncSceneTheme = () => {
      sceneTheme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
      sceneFog.color.set(sceneTheme === 'dark' ? '#0c1815' : '#eee9df')
      syncCloudPalette?.()
      syncStageTheme?.()
      if (container.value) container.value.dataset.themeFog = sceneTheme
    }
    scene.fog = sceneFog
    syncSceneTheme()
    window.addEventListener('heluo:theme-change', syncSceneTheme)
    resources.add(() => window.removeEventListener('heluo:theme-change', syncSceneTheme))
    const camera = new THREE.PerspectiveCamera(37, 1, .1, 80)
    cameraRef = camera
    const renderer = new THREE.WebGLRenderer({ antialias: renderProfile.antialias, alpha: true, powerPreference: 'high-performance' })
    resources.add(() => renderer.domElement.remove())
    resources.add(() => renderer.forceContextLoss())
    resources.add(() => renderer.dispose())
    resources.add(() => renderer.renderLists.dispose())
    const onContextLost = (event: Event) => { event.preventDefault(); fail(viewerCopy.value.contextLost) }
    renderer.domElement.addEventListener('webglcontextlost', onContextLost)
    resources.add(() => renderer.domElement.removeEventListener('webglcontextlost', onContextLost))
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'mobile' ? 1.25 : 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    // A museum object needs stable material values rather than an HDR-like bloom.
    // NoToneMapping prevents the light gallery from washing the bronze out on refresh.
    renderer.toneMapping = THREE.NoToneMapping
    renderer.toneMappingExposure = 1
    renderer.shadowMap.enabled = renderProfile.shadows
    renderer.shadowMap.type = THREE.PCFShadowMap
    container.value.replaceChildren(renderer.domElement)
    // Metallic GLB materials need an environment to reflect.  Without this, aged bronze
    // becomes almost black in the otherwise dark digital hall and reads as plastic.
    const pmrem = new THREE.PMREMGenerator(renderer)
    const releasePmrem = resources.add(() => pmrem.dispose())
    // Keep the moon-white room controlled, but give aged bronze enough
    // reflection to reveal its relief and patina instead of reading as black.
    const room = new environmentModule.RoomEnvironment()
    const releaseRoom = resources.add(() => room.dispose())
    const environmentTarget = pmrem.fromScene(room, .04)
    resources.add(() => environmentTarget.dispose())
    scene.environment = environmentTarget.texture
    scene.environmentIntensity = .5
    releasePmrem()
    releaseRoom()

    const controls = new controlsModule.OrbitControls(camera, renderer.domElement)
    resources.add(() => controls.dispose())
    controlsRef = controls
    syncAutoRotateState()
    renderer.domElement.dataset.cursor = 'native'
    renderer.domElement.setAttribute('aria-hidden', 'true')
    const canvasTouchAction = selectExhibitCanvasTouchAction({
      width: window.innerWidth,
      coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    })
    renderer.domElement.style.touchAction = canvasTouchAction
    if (canvasTouchAction === 'pan-y') {
      controls.touches.ONE = THREE.TOUCH.ROTATE
      controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE
    }
    controls.enableDamping = true
    controls.dampingFactor = .065
    controls.enablePan = false
    controls.minDistance = 3.2
    controls.maxDistance = window.innerWidth <= 760 ? 13.5 : 12.5
    controls.minPolarAngle = .08
    controls.maxPolarAngle = 1.62
    controls.minAzimuthAngle = -Infinity
    controls.maxAzimuthAngle = Infinity
    const target = new THREE.Vector3(0, 1.05, 0)
    targetRef = target
    controls.target.copy(target)
    const initialPointerCapabilities = readPointerMotionCapabilities()
    // Visibility is transient and is handled by the render pause below. Keeping it in
    // the base tier would make a viewer initialized in a background tab static forever.
    const motionTier: MotionTier = selectPointerMotionTier({ ...initialPointerCapabilities, hidden: false })
    const pointerNdc = new THREE.Vector2()
    const pointerWorld = new THREE.Vector2()
    const pointerPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
    const pointerIntersection = new THREE.Vector3()
    const raycaster = new THREE.Raycaster()
    const appliedCameraOffset = new THREE.Vector3()
    const appliedTargetOffset = new THREE.Vector3()
    let pointerInside = false
    let controlsActive = false
    let pointerX = 0
    let pointerY = 0
    let pointerStrength = 0
    let targetPointerX = 0
    let targetPointerY = 0
    let targetPointerStrength = 0
    let pointerResumeAt = 0
    let lastPointerMove = 0
    let lastPointerClientX = 0
    let lastPointerClientY = 0

    const removeAppliedPointerOffset = (commit = false) => {
      if (!commit) {
        camera.position.sub(appliedCameraOffset)
        controls.target.sub(appliedTargetOffset)
      }
      appliedCameraOffset.set(0, 0, 0)
      appliedTargetOffset.set(0, 0, 0)
    }
    const pausePointerInteraction = (duration = 320) => {
      removeAppliedPointerOffset(true)
      targetPointerX = 0
      targetPointerY = 0
      targetPointerStrength = 0
      pointerX = 0
      pointerY = 0
      pointerStrength = 0
      pointerResumeAt = performance.now() + duration
    }
    pointerInteractionRef = { pause: pausePointerInteraction }

    const onControlsStart = () => {
      cameraTransition = undefined
      controlsActive = true
      pausePointerInteraction(320)
    }
    const onControlsEnd = () => {
      controlsActive = false
      pointerResumeAt = performance.now() + 320
    }
    const onCanvasPointerMove = (event: PointerEvent) => {
      const effectiveMotionTier = selectEffectiveMotionTier(motionTier, document.documentElement.dataset.motionTier)
      if (effectiveMotionTier === 'static' || event.pointerType && event.pointerType !== 'mouse') return
      const rect = renderer.domElement.getBoundingClientRect()
      const normalizedX = Math.min(Math.max((event.clientX - rect.left) / Math.max(rect.width, 1), 0), 1)
      const normalizedY = Math.min(Math.max((event.clientY - rect.top) / Math.max(rect.height, 1), 0), 1)
      const now = event.timeStamp || performance.now()
      const elapsed = lastPointerMove ? Math.max(now - lastPointerMove, 1) : 16.67
      const speed = Math.hypot(event.clientX - lastPointerClientX, event.clientY - lastPointerClientY) / elapsed * 1000
      pointerNdc.set(normalizedX * 2 - 1, -(normalizedY * 2 - 1))
      targetPointerX = applyDeadZone(pointerNdc.x)
      targetPointerY = applyDeadZone(pointerNdc.y)
      targetPointerStrength = Math.min(speed / 1200, 1)
      lastPointerMove = now
      lastPointerClientX = event.clientX
      lastPointerClientY = event.clientY
      pointerInside = true
    }
    const onCanvasPointerLeave = () => {
      pointerInside = false
      targetPointerX = 0
      targetPointerY = 0
      targetPointerStrength = 0
    }
    controls.addEventListener('start', onControlsStart)
    resources.add(() => controls.removeEventListener('start', onControlsStart))
    controls.addEventListener('end', onControlsEnd)
    resources.add(() => controls.removeEventListener('end', onControlsEnd))
    renderer.domElement.addEventListener('pointermove', onCanvasPointerMove, { passive: true })
    resources.add(() => renderer.domElement.removeEventListener('pointermove', onCanvasPointerMove))
    renderer.domElement.addEventListener('pointerleave', onCanvasPointerLeave, { passive: true })
    resources.add(() => renderer.domElement.removeEventListener('pointerleave', onCanvasPointerLeave))
    setView('front', { animated: false })
    renderer.domElement.addEventListener('dblclick', resetView)
    resources.add(() => renderer.domElement.removeEventListener('dblclick', resetView))

    const floorMaterial = new THREE.MeshStandardMaterial({ color: '#d7d0c4', roughness: 1, metalness: 0, opacity: .1, transparent: true })
    const floor = new THREE.Mesh(new THREE.CircleGeometry(8, renderProfile.floorSegments), floorMaterial)
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = renderProfile.shadows
    scene.add(floor)
    // Warm limestone layers mirror the confirmed reference without competing
    // with the aged bronze. The thin brass ring is the only bright accent.
    const baseMaterial = new THREE.MeshStandardMaterial({ color: '#c9c1b4', roughness: .88, metalness: .02 })
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 2.28, .32, renderProfile.baseSegments), baseMaterial)
    base.position.y = .21
    base.receiveShadow = renderProfile.shadows
    scene.add(base)
    const topMaterial = new THREE.MeshStandardMaterial({ color: '#eee8dc', roughness: .82, metalness: .02 })
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.88, 1.96, .19, renderProfile.baseSegments), topMaterial)
    top.position.y = .44
    top.receiveShadow = renderProfile.shadows
    scene.add(top)
    const pedestalTrimMaterial = new THREE.MeshStandardMaterial({ color: '#b68a4b', roughness: .5, metalness: .68 })
    const pedestalTrim = new THREE.Mesh(
      new THREE.TorusGeometry(1.8, .018, 8, renderProfile.trimSegments),
      pedestalTrimMaterial,
    )
    pedestalTrim.rotation.x = Math.PI / 2
    pedestalTrim.position.y = .545
    scene.add(pedestalTrim)
    const floorRingMaterials: import('three').MeshBasicMaterial[] = []
    ;[2.38, 3.55, 4.65].forEach((radius, index) => {
      const material = new THREE.MeshBasicMaterial({ color: '#af9d7d', transparent: true, opacity: .12 - index * .03 })
      floorRingMaterials.push(material)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, index === 0 ? .016 : .006, 6, renderProfile.ringSegments), material)
      ring.rotation.x = Math.PI / 2
      ring.position.y = .03
      scene.add(ring)
    })
    syncStageTheme = () => {
      const mobileDark = quality === 'mobile' && sceneTheme === 'dark'
      floorMaterial.color.set(mobileDark ? '#18211d' : '#d7d0c4')
      floorMaterial.opacity = mobileDark ? .24 : .1
      baseMaterial.color.set(mobileDark ? '#252c27' : '#c9c1b4')
      topMaterial.color.set(mobileDark ? '#343b35' : '#eee8dc')
      pedestalTrimMaterial.color.set(mobileDark ? '#9c7138' : '#b68a4b')
      floorRingMaterials.forEach((material, index) => {
        material.color.set(mobileDark ? '#607467' : '#af9d7d')
        material.opacity = mobileDark ? .1 - index * .018 : .12 - index * .03
      })
    }
    syncStageTheme()
    const river = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-7.5, 2.2, -4.3), new THREE.Vector3(-4.2, 3.25, -6.3), new THREE.Vector3(-1, 2.3, -7.7), new THREE.Vector3(2.2, 3.1, -7.3), new THREE.Vector3(5.5, 2.5, -5.7), new THREE.Vector3(7.6, 3.1, -4.2),
    ])
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(river.getPoints(150)), new THREE.LineBasicMaterial({ color: '#b79d70', transparent: true, opacity: .08 })))
    scene.add(new THREE.HemisphereLight(0xfff8e9, 0x5c675f, 1.08))
    const key = new THREE.SpotLight(0xffe8c6, 132, 16, .44, .78, 1.5)
    key.position.set(2.2, 7.6, 3.4); key.target.position.set(0, 1.05, 0); key.castShadow = renderProfile.shadows; if (renderProfile.shadows) key.shadow.mapSize.set(1024, 1024)
    scene.add(key, key.target)
    const fill = new THREE.PointLight(0xb8d1c8, 3.3, 9, 2); fill.position.set(-3.7, 2.5, 2); scene.add(fill)
    const rim = new THREE.PointLight(0xf3cf99, 3.8, 8, 2); rim.position.set(0, 3.8, -4.6); scene.add(rim)
    const front = new THREE.PointLight(0xffe1bd, 5.2, 11, 2); front.position.set(0, 2.8, 5.2); scene.add(front)

    // Rendering directly preserves the alpha channel. Bloom post-processing
    // turns transparent pixels black and would cover the photographic room.
    let composer: { render: () => void; setSize: (width: number, height: number) => void; dispose?: () => void } | undefined

    let cloud: Points | undefined
    let cloudMaterial: ShaderMaterial | undefined
    syncCloudPalette = () => {
      if (!cloudMaterial) return
      const palette = selectPointCloudPalette(quality, sceneTheme)
      cloudMaterial.uniforms.uJade.value.set(...palette.jade)
      cloudMaterial.uniforms.uCopper.value.set(...palette.copper)
      cloudMaterial.uniforms.uCopperBase.value = palette.copperBase
      cloudMaterial.uniforms.uCopperRange.value = palette.copperRange
      cloudMaterial.uniforms.uPointOpacity.value = palette.opacity
      cloudMaterial.uniforms.uPointSize.value = selectPointCloudPointSize(quality, sceneTheme)
    }
    let artifact: Group | undefined
    let dust: Points | undefined
    const modelMaterials: Array<{ material: OpacityMaterial; opacity: number; transparent: boolean; depthWrite: boolean }> = []
    let transition: PointCloudTransition | undefined
    let introComplete = false
    let animationState: PointCloudAnimationState = 'solid'
    let visualMix = 0
    let cloudGather = 1
    let pointCloudAvailable = props.enablePointCloud
    let pointCloudInitialization: Promise<void> | undefined
    let pointCloudController: AbortController | undefined
    let pointCloudTask = 0
    resources.add(() => pointCloudController?.abort())
    let requestedMode: DisplayMode = props.initialMode
    let frameId = 0
    resources.add(() => cancelAnimationFrame(frameId))
    let previousRenderTime = 0
    let modelReady = false
    let pointCloudBusy = false
    let renderSubmissions = 0
    let pointRenderPeak = 0
    const performanceMonitor = createPointCloudPerformanceMonitor()
    const submitRender = () => {
      const started = performance.now()
      if (composer) composer.render(); else renderer.render(scene, camera)
      const finished = performance.now()
      const duration = finished - started
      renderSubmissions += 1
      if (host) {
        host.dataset.renderSubmissions = String(renderSubmissions)
        host.dataset.renderSubmitMs = duration.toFixed(3)
        if (host.dataset.pointSamplingStartedAt && duration > pointRenderPeak) {
          pointRenderPeak = duration
          host.dataset.pointRenderPeakMs = duration.toFixed(3)
          host.dataset.pointRenderPeakStartedAt = String(started)
          host.dataset.pointRenderPeakFinishedAt = String(finished)
        }
        host.dataset.renderDrawCalls = String(renderer.info?.render.calls ?? 0)
        host.dataset.renderGeometries = String(renderer.info?.memory.geometries ?? 0)
        host.dataset.renderTextures = String(renderer.info?.memory.textures ?? 0)
      }
    }
    const setPointCloudState = (state: PointCloudState) => {
      pointCloudBusy = state === 'loading'
      if (host) {
        host.dataset.pointCloudState = state
        if (state === 'loading') {
          pointRenderPeak = 0
          for (const key of ['pointSamplingStartedAt', 'pointSamplingFinishedAt', 'pointCompileStartedAt', 'pointCompileFinishedAt', 'pointRenderPeakMs', 'pointRenderPeakStartedAt', 'pointRenderPeakFinishedAt']) delete host.dataset[key]
        }
      }
      emit('point-cloud-state', state)
    }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const setModelOpacity = (opacity: number) => {
      const factor = clamp(opacity)
      modelMaterials.forEach(({ material, opacity: original, transparent, depthWrite }) => {
        material.transparent = transparent || factor < .999
        material.opacity = original * factor
        material.depthWrite = depthWrite
      })
    }
    const setMix = (pointMix: number, pointGather = cloudGather) => {
      if (!artifact || !cloud || !cloudMaterial) return
      const mix = clamp(pointMix)
      const gather = clamp(pointGather)
      visualMix = mix
      cloudGather = gather
      cloud.visible = mix > .002
      artifact.visible = mix < .998
      cloudMaterial.uniforms.uProgress.value = gather
      // Reveal full-color particles by seed instead of washing the whole cloud
      // through low alpha against the pale gallery background.
      cloudMaterial.uniforms.uOpacity.value = mix > .002 ? 1 : 0
      cloudMaterial.uniforms.uTransition.value = mix
      setModelOpacity(1 - mix)
    }
    const beginModeTransition = (toMix: number, toGather: number, duration: number, gatherArc = 0) => {
      introComplete = false
      transition = { fromMix: visualMix, toMix, fromGather: cloudGather, toGather, gatherArc, start: performance.now(), duration }
      animationState = 'mode-transition'
    }
    const completeSolid = () => {
      transition = undefined
      introComplete = true
      animationState = 'solid'
      activeMode = 'solid'
      setMix(0, 1)
      emit('mode-change', 'solid')
    }
    const beginPointCloudIntro = () => {
      if (!cloud || !cloudMaterial || !artifact || !pointCloudAvailable) return
      introComplete = false
      activeMode = 'points'
      const fromSolid = animationState === 'solid'
      cloudMaterial.uniforms.uPulse.value = 0
      const remaining = Math.max(1 - visualMix, Math.abs(1 - cloudGather))
      const duration = reducedMotion ? 220 : fromSolid ? POINT_CLOUD_INTRO_DURATION : Math.max(420, 820 * remaining)
      const gatherArc = reducedMotion ? 0 : fromSolid ? POINT_CLOUD_INTRO_GATHER_ARC : .12 * remaining
      beginModeTransition(1, 1, duration, gatherArc)
      emit('mode-change', 'points')
    }
    const makeDust = () => {
      const count = quality === 'high' ? 900 : quality === 'medium' ? 500 : 240
      const positions = new Float32Array(count * 3)
      for (let i = 0; i < count; i += 1) {
        const theta = Math.random() * Math.PI * 2, radius = 1.2 + Math.random() * 2.3
        positions[i * 3] = Math.cos(theta) * radius; positions[i * 3 + 1] = .5 + Math.random() * 2.5; positions[i * 3 + 2] = Math.sin(theta) * radius
      }
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      dust = new THREE.Points(geometry, new THREE.PointsMaterial({ color: '#dbad5d', size: .018, transparent: true, opacity: .62, depthWrite: false, sizeAttenuation: true }))
      scene.add(dust)
    }

    const createCloud = async (model: Group, signal: AbortSignal) => {
      const samplerModule = await loadMeshSurfaceSampler()
      signal.throwIfAborted()
      if (disposed || version !== initializationVersion) return
      const palette = selectPointCloudPalette(quality, sceneTheme)
      const surfaces: Array<{ geometry: BufferGeometry; color: import('three').Color; area: number }> = []
      model.updateMatrixWorld(true)
      const meshes: Mesh[] = []
      model.traverse((object) => {
        const mesh = object as Mesh
        if (mesh.isMesh && mesh.visible) meshes.push(mesh)
      })
      const count = POINT_COUNTS[quality === 'fallback' ? 'mobile' : quality]
      const positions = new Float32Array(count * 3), origins = new Float32Array(count * 3), colors = new Float32Array(count * 3), seeds = new Float32Array(count), regions = new Float32Array(count), phases = new Float32Array(count)
      const bounds = new THREE.Box3().setFromObject(model)
      const height = Math.max(bounds.max.y - bounds.min.y, .001)
      const deterministic = (index: number, salt: number) => {
        const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453
        return value - Math.floor(value)
      }
      const sampled = new THREE.Vector3()
      const direction = new THREE.Vector3()
      let cursor = 0
      try {
        for (const mesh of meshes) {
          const chunks = await createWorldSamplingSurfaces(mesh.geometry, mesh.matrixWorld, THREE, signal)
          const rawMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
          const color = rawMaterial && 'color' in rawMaterial && rawMaterial.color instanceof THREE.Color ? rawMaterial.color.clone() : new THREE.Color('#5b6b58')
          chunks.forEach((chunk) => surfaces.push({ ...chunk, color }))
        }
        const totalArea = surfaces.reduce((total, surface) => total + surface.area, 0)
        if (totalArea <= 0) throw new Error('The model has no sampleable surface')
        let accumulatedArea = 0
        for (const [surfaceIndex, surface] of surfaces.entries()) {
          accumulatedArea += surface.area
          const allocation = Math.round(count * accumulatedArea / totalArea) - cursor
          if (allocation <= 0) continue
          await yieldToMainThread(signal)
          // Reuse a real material; Mesh's default constructor allocates a new one.
          const samplingMesh = new THREE.Mesh(surface.geometry, floorMaterial)
          const sampler = new samplerModule.MeshSurfaceSampler(samplingMesh).build()
          await runInTimeSlices(allocation, () => {
            sampler.sample(sampled)
            // A coprime permutation keeps lower draw ranges representative of all meshes.
            const sampleIndex = cursor * 7919 % count
            const seed = deterministic(cursor, surfaceIndex + 1), theta = seed * Math.PI * 2 + cursor * .618, travel = 1.6 + deterministic(cursor, 29) * 2.65, offset = sampleIndex * 3
            direction.set(Math.cos(theta), deterministic(cursor, 13) - .22, Math.sin(theta)).normalize()
            positions[offset] = sampled.x; positions[offset + 1] = sampled.y; positions[offset + 2] = sampled.z
            origins[offset] = sampled.x * .32 + direction.x * travel; origins[offset + 1] = sampled.y * .42 + direction.y * travel + .8; origins[offset + 2] = sampled.z * .32 + direction.z * travel
            colors[offset] = surface.color.r; colors[offset + 1] = surface.color.g; colors[offset + 2] = surface.color.b; seeds[sampleIndex] = seed
            regions[sampleIndex] = Math.min(5, Math.max(0, Math.floor(((sampled.y - bounds.min.y) / height) * 6)))
            phases[sampleIndex] = deterministic(cursor, 47) * .28
            cursor += 1
          }, { signal })
        }
      } finally {
        surfaces.forEach((surface) => surface.geometry.dispose())
      }
      signal.throwIfAborted()
      const geometry = new THREE.BufferGeometry()
      resources.add(() => { if (!releasedResources.has(geometry)) { releasedResources.add(geometry); geometry.dispose() } })
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setAttribute('aOrigin', new THREE.BufferAttribute(origins, 3)); geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3)); geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1)); geometry.setAttribute('aRegion', new THREE.BufferAttribute(regions, 1)); geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
      cloudMaterial = new THREE.ShaderMaterial({
        transparent: true, depthWrite: true,
        uniforms: { uProgress: { value: 1 }, uOpacity: { value: 0 }, uTime: { value: 0 }, uPulse: { value: 0 }, uTransition: { value: 0 }, uReducedMotion: { value: reducedMotion ? 1 : 0 }, uPixelRatio: { value: Math.min(window.devicePixelRatio, quality === 'mobile' ? 1.25 : 2) }, uPointSize: { value: selectPointCloudPointSize(quality, sceneTheme) }, uJade: { value: new THREE.Vector3(...palette.jade) }, uCopper: { value: new THREE.Vector3(...palette.copper) }, uCopperBase: { value: palette.copperBase }, uCopperRange: { value: palette.copperRange }, uPointOpacity: { value: palette.opacity }, uPointer: { value: new THREE.Vector2() }, uPointerStrength: { value: 0 }, uPointerRadius: { value: .9 } },
        vertexShader: `attribute vec3 aOrigin; attribute vec3 aColor; attribute float aSeed; attribute float aRegion; attribute float aPhase; uniform float uProgress; uniform float uTime; uniform float uReducedMotion; uniform float uPixelRatio; uniform float uPointSize; uniform vec3 uJade; uniform vec3 uCopper; uniform float uCopperBase; uniform float uCopperRange; uniform vec2 uPointer; uniform float uPointerStrength; uniform float uPointerRadius; varying vec3 vColor; varying float vSeed; void main(){float gathered=smoothstep(0.0,1.0,uProgress); float phase=aPhase+aRegion*.035; vec3 drift=vec3(sin(uTime*.85+aSeed*31.0+phase),cos(uTime*.72+aSeed*19.0+phase),sin(uTime*.64+aSeed*47.0+phase))*(1.0-gathered)*.12*(1.0-uReducedMotion); vec3 basePosition=mix(aOrigin,position,gathered)+drift; float pointerDistance=distance(basePosition.xy,uPointer); float pointerInfluence=(1.0-smoothstep(0.0,uPointerRadius,pointerDistance))*uPointerStrength*(1.0-uReducedMotion); vec2 pointerDirection=normalize(basePosition.xy-uPointer+vec2(.0001)); basePosition.xy+=pointerDirection*pointerInfluence*.022; vec4 mvPosition=modelViewMatrix*vec4(basePosition,1.0); gl_PointSize=clamp(uPointSize*uPixelRatio*(1.05+fract(aSeed*13.0))*(7.5/-mvPosition.z),1.0,8.0); gl_Position=projectionMatrix*mvPosition; vec3 sampled=clamp(aColor,vec3(.0),vec3(1.0)); float sourceTone=dot(sampled,vec3(.299,.587,.114)); vec3 aged=mix(uJade,sampled*vec3(.08,.1,.07),.08+sourceTone*.04); vColor=mix(aged,uCopper,uCopperBase+fract(aSeed*11.0)*uCopperRange); vSeed=aSeed;}`,
        fragmentShader: `uniform float uOpacity; uniform float uTime; uniform float uPulse; uniform float uTransition; uniform float uPointOpacity; varying vec3 vColor; varying float vSeed; void main(){float radius=length(gl_PointCoord-vec2(.5)); float disc=1.0-smoothstep(.18,.5,radius); if(uOpacity<.5||vSeed>uTransition||disc<=.001)discard; float core=1.0-smoothstep(.0,.16,radius); float glint=.9+.1*sin(uTime*1.6+vSeed*20.0)*(0.35+uPulse*.65); gl_FragColor=vec4(vColor*(glint+core*.12),pow(disc,1.25)*uPointOpacity);}`,
      })
      const createdMaterial = cloudMaterial
      resources.add(() => disposeMaterial(createdMaterial, releasedResources))
      cloud = new THREE.Points(geometry, cloudMaterial)
      const createdCloud = cloud
      resources.add(() => disposeScene(createdCloud, releasedResources))
      cloud.visible = false
      scene.add(cloud)
    }

    const discardPointCloud = () => {
      if (cloud) {
        scene.remove(cloud)
        disposeScene(cloud, releasedResources)
      }
      cloud = undefined
      cloudMaterial = undefined
      if (dust) {
        scene.remove(dust)
        disposeScene(dust, releasedResources)
        dust = undefined
      }
    }

    const ensurePointCloud = () => {
      if (cloud && cloudMaterial) return Promise.resolve()
      if (!artifact || !pointCloudAvailable) return Promise.reject(new Error('Point cloud is unavailable'))
      if (!pointCloudInitialization) {
        setPointCloudState('loading')
        const taskId = ++pointCloudTask
        const controller = new AbortController()
        pointCloudController = controller
        const signal = controller.signal
        const sourceArtifact = artifact
        pointCloudInitialization = (async () => {
          await nextTick()
          await yieldToMainThread(signal)
          if (host) host.dataset.pointSamplingStartedAt = String(performance.now())
          await createCloud(sourceArtifact, signal)
          if (disposed || taskId !== pointCloudTask || version !== initializationVersion || !cloud || !cloudMaterial) return
          if (host) host.dataset.pointSamplingFinishedAt = String(performance.now())
          await yieldToMainThread(signal)
          cloud.visible = true
          cloudMaterial.uniforms.uOpacity.value = 0
          cloudMaterial.uniforms.uProgress.value = 1
          if (renderProfile.dust) makeDust()
          if (host) host.dataset.pointCompileStartedAt = String(performance.now())
          await renderer.compileAsync(scene, camera)
          if (disposed || taskId !== pointCloudTask || version !== initializationVersion) return
          if (host) host.dataset.pointCompileFinishedAt = String(performance.now())
          setMix(0, 1)
          setPointCloudState('ready')
        })().catch((reason: unknown) => {
          if (taskId === pointCloudTask) pointCloudInitialization = undefined
          if (!disposed && taskId === pointCloudTask && version === initializationVersion) {
            discardPointCloud()
            requestedMode = 'solid'
            completeSolid()
            setPointCloudState('error')
          }
          throw reason
        })
      }
      return pointCloudInitialization
    }

    changeMode = (mode: DisplayMode) => {
      requestedMode = mode
      if (!artifact || !pointCloudAvailable) return
      if (mode === 'solid' && pointCloudBusy) {
        pointCloudTask += 1
        pointCloudController?.abort()
        pointCloudInitialization = undefined
        completeSolid()
        discardPointCloud()
        setPointCloudState('idle')
        return
      }
      if (mode === 'points') {
        if (mode === activeMode && !pointCloudInitialization) return
        if (cloud && cloudMaterial) {
          beginPointCloudIntro()
          return
        }
        if (pointCloudInitialization) return
        void ensurePointCloud().then(() => {
          if (!disposed && requestedMode === 'points') beginPointCloudIntro()
        }).catch(() => undefined)
        return
      }
      if (!cloud || !cloudMaterial || mode === activeMode) return
      const remaining = Math.max(visualMix, Math.abs(1 - cloudGather))
      beginModeTransition(0, 1, reducedMotion ? 220 : Math.max(420, 820 * remaining), reducedMotion ? 0 : .14 * remaining)
      activeMode = 'solid'
      emit('mode-change', 'solid')
    }

    const loader = new loaderModule.GLTFLoader()
    loader.setMeshoptDecoder(meshoptModule.MeshoptDecoder)
    emit('state-change', 'loading-model')
    loader.load(props.modelUrl, (gltf) => {
      void (async () => {
        if (disposed || version !== initializationVersion) {
          disposeScene(gltf.scene)
          return
        }
        artifact = gltf.scene
        const loadedArtifact = artifact
        resources.add(() => disposeScene(loadedArtifact, releasedResources))
        artifact.traverse((object) => {
          const mesh = object as Mesh
          if (!mesh.isMesh) return
          if (/(render[_ -]?floor|display[_ -]?(base|floor)|pedestal|plinth|platform)/i.test(mesh.name)) { mesh.visible = false; return }
          mesh.castShadow = renderProfile.shadows; mesh.receiveShadow = renderProfile.shadows
          const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
          source.forEach((material) => resources.add(() => disposeMaterial(material, releasedResources)))
          const cloned = source.map((material) => {
            const next = material.clone() as OpacityMaterial & {
              color?: { setRGB?: (r: number, g: number, b: number) => void }
              envMapIntensity?: number
              metalness?: number
              normalScale?: { set?: (x: number, y: number) => void }
              roughness?: number
            }
            resources.add(() => disposeMaterial(next, releasedResources))
            const originalTransparent = next.transparent
            const originalDepthWrite = next.depthWrite
            // Selected reference profile: grey-green aged bronze with soft metal
            // reflections, visible micro relief and no emissive lift.
            const mobileMaterial = quality === 'mobile'
            next.envMapIntensity = mobileMaterial ? .3 : .5
            // Preserve the v5.4 texture as the source of truth; a pale runtime
            // color multiplier was washing out the material contrast.
            next.color?.setRGB?.(mobileMaterial ? .55 : 1, mobileMaterial ? .62 : 1, mobileMaterial ? .42 : 1)
            const emissive = (next as OpacityMaterial & { emissive?: { set?: (color: string) => void } }).emissive
            if (emissive?.set) emissive.set('#000000')
            if ('emissiveIntensity' in next) next.emissiveIntensity = 0
            if (typeof next.roughness === 'number') next.roughness = mobileMaterial ? .76 : Math.min(Math.max(next.roughness, .58), .84)
            if (typeof next.metalness === 'number') next.metalness = mobileMaterial ? .62 : Math.min(Math.max(next.metalness, .72), .9)
            next.normalScale?.set?.(mobileMaterial ? .32 : .38, mobileMaterial ? .32 : .38)
            modelMaterials.push({ material: next, opacity: next.opacity, transparent: originalTransparent, depthWrite: originalDepthWrite })
            return next
          })
          mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0]
        })
        const bounds = new THREE.Box3().setFromObject(artifact), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3()), scale = 3.35 / Math.max(size.x, size.y, size.z)
        artifact.scale.setScalar(scale)
        artifact.position.set(-center.x * scale, -bounds.min.y * scale + .51, -center.z * scale)
        artifact.updateMatrixWorld(true)
        scene.add(artifact)
        const compositionLift = window.innerWidth <= 760 ? .1 : .22
        target.set(0, .51 + size.y * scale * .5 - compositionLift, 0)
        setView('front', { animated: false })
        // Never expose a partially transparent PBR material as a loading effect.
        // Compile and upload the complete first frame behind the loading veil,
        // then reveal the already opaque artifact as one stable image.
        completeSolid()
        loadingProgress.value = 97
        emit('state-change', 'compiling-first-frame')
        await renderer.compileAsync(scene, camera)
        const readyContainer = container.value
        if (disposed || version !== initializationVersion || !readyContainer) return
        loadingProgress.value = 99
        submitRender()
        modelReady = true
        performanceMonitor.reset()
        const firstFrameReadyAt = performance.now()
        performance.mark(THREE_FIRST_FRAME_MARK)
        readyContainer.dataset.threeReady = 'true'
        readyContainer.dataset.threeReadyAt = String(firstFrameReadyAt)
        window.dispatchEvent(new CustomEvent(THREE_FIRST_FRAME_EVENT, {
          detail: { markName: THREE_FIRST_FRAME_MARK, startTime: firstFrameReadyAt },
        }))
        loadingProgress.value = 100
        loading.value = false
        emit('state-change', 'ready')
        if (props.initialMode === 'points') changeMode('points')
      })().catch(() => {
        fail(viewerCopy.value.loadFailed)
      })
    }, (event) => {
      if (!disposed && version === initializationVersion && event.lengthComputable && event.total > 0) loadingProgress.value = Math.min(96, Math.round((event.loaded / event.total) * 100))
    }, () => {
      fail(viewerCopy.value.loadFailed)
    })

    const resize = () => { const width = Math.max(container.value?.clientWidth ?? 1, 1), height = Math.max(container.value?.clientHeight ?? 520, 1); camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height, false); composer?.setSize(width, height) }
    const observer = new ResizeObserver(resize)
    resources.add(() => observer.disconnect())
    observer.observe(container.value)
    let canvasVisible = true
    let pageVisible = !document.hidden
    const syncRenderState = () => {
      if (!container.value) return
      container.value.dataset.renderState = pageVisible
        ? canvasVisible ? 'running' : 'paused-offscreen'
        : 'paused-hidden'
    }
    function startRendering() {
      syncRenderState()
      if (disposed || frameId || !canvasVisible || !pageVisible) return
      previousRenderTime = 0
      performanceMonitor.reset()
      frameId = requestAnimationFrame(animate)
    }
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      if (disposed) return
      canvasVisible = entry?.isIntersecting ?? true
      if (canvasVisible) startRendering()
      else if (frameId) { cancelAnimationFrame(frameId); frameId = 0 }
      syncRenderState()
    }, { rootMargin: '120px' })
    resources.add(() => visibilityObserver.disconnect())
    visibilityObserver.observe(container.value)
    const onDocumentVisibility = () => {
      pageVisible = !document.hidden
      if (pageVisible) startRendering()
      else if (frameId) { cancelAnimationFrame(frameId); frameId = 0 }
      syncRenderState()
    }
    document.addEventListener('visibilitychange', onDocumentVisibility)
    resources.add(() => document.removeEventListener('visibilitychange', onDocumentVisibility))
    function animate(time: number) {
      frameId = 0
      if (disposed || !canvasVisible || !pageVisible) return
      const deltaMs = previousRenderTime ? Math.min(time - previousRenderTime, 64) : 16.67
      previousRenderTime = time
      removeAppliedPointerOffset()
      if (cameraTransition) {
        const progress = clamp((time - cameraTransition.start) / cameraTransition.duration)
        const transitionProgress = easeOut(progress)
        const fromOffset = cameraTransition.from.clone().sub(controls.target)
        const toOffset = cameraTransition.to.clone().sub(controls.target)
        const orbitOffset = interpolateExhibitOrbitOffset(fromOffset, toOffset, transitionProgress)
        camera.position.set(
          controls.target.x + orbitOffset.x,
          controls.target.y + orbitOffset.y,
          controls.target.z + orbitOffset.z,
        )
        if (progress >= 1) cameraTransition = undefined
      }
      controls.update()
      if (time - lastPointerMove > 40) targetPointerStrength = 0
      const effectiveMotionTier = selectEffectiveMotionTier(motionTier, document.documentElement.dataset.motionTier)
      const pointerPolicy = resolveExhibitPointerPolicy(effectiveMotionTier, {
        pointerInside,
        controlsActive,
        autoRotate: controls.autoRotate,
        cameraTransitionActive: Boolean(cameraTransition),
        time,
        resumeAt: pointerResumeAt,
        pointCloudIdle: animationState === 'points-idle',
      })
      const { pointerAllowed, amplitude, pointResponseAllowed } = pointerPolicy
      if (effectiveMotionTier === 'static') {
        pointerX = 0
        pointerY = 0
        pointerStrength = 0
      } else {
        pointerX = exponentialStep(pointerX, pointerAllowed ? targetPointerX : 0, deltaMs, 120)
        pointerY = exponentialStep(pointerY, pointerAllowed ? targetPointerY : 0, deltaMs, 120)
        pointerStrength = exponentialStep(pointerStrength, pointerAllowed ? targetPointerStrength : 0, deltaMs, 280)
      }
      appliedCameraOffset.set(pointerX * .12 * amplitude, pointerY * .07 * amplitude, 0)
      appliedTargetOffset.set(pointerX * .025 * amplitude, pointerY * .015 * amplitude, 0)
      camera.position.add(appliedCameraOffset)
      controls.target.add(appliedTargetOffset)
      camera.lookAt(controls.target)
      if (cloudMaterial) {
        cloudMaterial.uniforms.uTime.value = time * .001
        cloudMaterial.uniforms.uPulse.value = !reducedMotion && animationState === 'points-idle' ? .5 + Math.sin(time * .00042) * .5 : 0
        if (pointResponseAllowed) {
          raycaster.setFromCamera(pointerNdc, camera)
          if (raycaster.ray.intersectPlane(pointerPlane, pointerIntersection)) pointerWorld.set(pointerIntersection.x, pointerIntersection.y)
        }
        cloudMaterial.uniforms.uPointer.value.copy(pointerWorld)
        cloudMaterial.uniforms.uPointerStrength.value = pointResponseAllowed ? pointerStrength : 0
      }
      if (dust) { dust.rotation.y = reducedMotion ? 0 : time * .00006; (dust.material as import('three').PointsMaterial).opacity = activeMode === 'points' || !introComplete ? .64 : .16 }
      if (transition && cloudMaterial) {
        const progress = clamp((time - transition.start) / transition.duration), eased = smootherStep(progress)
        const mix = transition.fromMix + (transition.toMix - transition.fromMix) * eased
        const linearGather = transition.fromGather + (transition.toGather - transition.fromGather) * eased
        const gather = clamp(linearGather - transition.gatherArc * Math.sin(Math.PI * progress) ** 2)
        setMix(mix, gather)
        if (progress >= 1) {
          const target = transition.toMix
          transition = undefined
          if (target > .5) {
            introComplete = true
            animationState = 'points-idle'
            activeMode = 'points'
            setMix(1, 1)
          } else {
            completeSolid()
          }
        }
      }
      try { submitRender() } catch { fail(viewerCopy.value.unavailable); return }
      const measured = performanceMonitor.record(time, modelReady && !transition && !cameraTransition && !pointCloudBusy, quality)
      if (measured && host) host.dataset.renderFpsWindow = measured.fps.toFixed(2)
      if (measured?.quality) {
        quality = measured.quality
        if (host) host.dataset.quality = quality
        emit('quality-change', quality)
        if (quality === 'medium') {
          cloud?.geometry.setDrawRange(0, POINT_COUNTS.medium)
          renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
          if (cloudMaterial) cloudMaterial.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 1.5)
          composer?.dispose?.()
          composer = undefined
        } else if (quality === 'fallback') {
          requestedMode = 'solid'
          pointCloudAvailable = false
          completeSolid()
          discardPointCloud()
          animationState = 'fallback'
          setPointCloudState('idle')
          renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1))
          renderer.shadowMap.enabled = false
        }
      }
      frameId = requestAnimationFrame(animate)
    }
    resize(); startRendering()
  } catch {
    fail(viewerCopy.value.unavailable)
  }
}

onMounted(initialize)
watch(() => props.modelUrl, initialize)
onBeforeUnmount(() => { initializationVersion += 1; cleanup?.() })
</script>

<template>
  <div class="three-viewer">
    <div ref="container" class="three-canvas" role="img" data-cursor="native" :aria-label="`${alt}${viewerCopy.aria}`"></div>
    <Transition name="exhibit-loading">
      <div v-if="loading" class="three-overlay" role="status" aria-live="polite"><div class="exhibit-loader" data-glass="dark"><span class="exhibit-loader__artifact" aria-hidden="true"><i></i><b></b></span><div class="exhibit-loader__copy"><small>DIGITAL OBJECT</small><strong>{{ viewerCopy.loading }}</strong><span class="exhibit-loader__track" aria-hidden="true"><i :style="{ width: `${loadingProgress || 12}%` }"></i></span><em>{{ loadingProgress ? `${loadingProgress}%` : 'LOADING' }}</em></div></div></div>
    </Transition>
    <div v-if="error" class="three-fallback" role="alert" aria-live="assertive"><img :src="coverImageUrl" :alt="alt" decoding="async" /><p>{{ error }}</p><button type="button" @click="initialize">{{ viewerCopy.retry }}</button></div>
  </div>
</template>

<style scoped>
.three-fallback[role="alert"] {
  grid-template-columns: minmax(0, 32rem);
  grid-template-rows: minmax(0, min(30vh, 16rem)) auto auto;
  place-items: center;
  gap: .75rem;
  padding: 4.5rem 1.25rem 8rem;
}
.three-fallback[role="alert"] > img {
  width: 100%;
  height: 100%;
  min-height: 0;
  object-fit: contain;
}
.three-fallback[role="alert"] > p {
  margin: 0;
  overflow-wrap: anywhere;
}
.three-fallback[role="alert"] > button {
  justify-self: center;
  min-width: 8rem;
  width: auto;
  min-height: 44px;
  border-radius: 8px;
}
</style>
