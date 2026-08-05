<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { BufferGeometry, Group, Material, Mesh, PerspectiveCamera, Points, ShaderMaterial, Vector3 } from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { interpolateExhibitOrbitOffset, selectExhibitCameraDistanceScale, selectExhibitCanvasTouchAction } from '../lib/exhibitInteraction'
import { POINT_COUNTS, downgradePointCloudQuality, selectPointCloudPalette, selectPointCloudQuality, type PointCloudQuality } from '../lib/pointCloudQuality'
import { applyDeadZone, exponentialStep, readPointerMotionCapabilities, resolveExhibitPointerPolicy, selectEffectiveMotionTier, selectPointerMotionTier, type MotionTier } from '../lib/pointerMotion'
import { useLocale } from '../stores/locale'

type DisplayMode = 'solid' | 'points'
type ViewName = 'front' | 'left' | 'right' | 'back' | 'top'
type OpacityMaterial = Material & { opacity: number; transparent: boolean; depthWrite: boolean }
type PointCloudAnimationState = 'solid' | 'points-intro' | 'points-idle' | 'solid-transition' | 'fallback'

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
}>()
const { locale } = useLocale()
const viewerCopy = computed(() => locale.value === 'zh-CN' ? {
  unsupported: '当前浏览器不支持 WebGL，已为你保留展项封面和说明。', loadFailed: '3D 模型暂时无法加载，已切换为展项封面和文字说明。你可以稍后重试。', unavailable: '互动 3D 展项暂时不可用，已切换为展项封面和文字说明。你可以稍后重试。',
  aria: '的可旋转 3D 模型', loading: '正在构建数字展项…', retry: '重试加载',
} : {
  unsupported: 'This browser does not support WebGL. The exhibit cover and notes remain available.', loadFailed: 'The 3D model could not be loaded. The exhibit cover and notes are shown instead. Please try again later.', unavailable: 'The interactive 3D exhibit is temporarily unavailable. The cover and notes are shown instead. Please try again later.',
  aria: ' — rotatable 3D model', loading: 'Building the digital exhibit…', retry: 'Try again',
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

const clamp = (value: number) => Math.min(Math.max(value, 0), 1)
const easeOut = (value: number) => 1 - Math.pow(1 - clamp(value), 3)
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

function estimateSurfaceArea(geometry: BufferGeometry, THREE: typeof import('three')): number {
  const position = geometry.getAttribute('position')
  if (!position) return 0
  const index = geometry.getIndex()
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  let area = 0
  const triangles = Math.floor((index?.count ?? position.count) / 3)
  for (let triangle = 0; triangle < triangles; triangle += 1) {
    const offset = triangle * 3
    a.fromBufferAttribute(position, index ? index.getX(offset) : offset)
    b.fromBufferAttribute(position, index ? index.getX(offset + 1) : offset + 1)
    c.fromBufferAttribute(position, index ? index.getX(offset + 2) : offset + 2)
    area += b.sub(a).cross(c.sub(a)).length() * .5
  }
  return area
}

function disposeScene(scene: import('three').Object3D) {
  const disposed = new Set<unknown>()
  scene.traverse((object) => {
    const item = object as import('three').Object3D & { geometry?: { dispose?: () => void }; material?: Material | Material[] }
    if (item.geometry && !disposed.has(item.geometry)) { disposed.add(item.geometry); item.geometry.dispose?.() }
    const materials = item.material ? (Array.isArray(item.material) ? item.material : [item.material]) : []
    materials.forEach((material) => {
      if (disposed.has(material)) return
      disposed.add(material)
      Object.values(material).forEach((value) => {
        if (value && typeof value === 'object' && 'isTexture' in value && 'dispose' in value) (value as { dispose: () => void }).dispose()
      })
      material.dispose()
    })
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
function rotate() { if (controlsRef) { pointerInteractionRef?.pause(360); controlsRef.autoRotate = !controlsRef.autoRotate } }
function zoomBy(factor: number) {
  if (!cameraRef || !controlsRef) return
  pointerInteractionRef?.pause(320)
  cameraRef.position.copy(controlsRef.target.clone().add(cameraRef.position.clone().sub(controlsRef.target).multiplyScalar(factor)))
  controlsRef.update()
}
function zoomIn() { zoomBy(.83) }
function zoomOut() { zoomBy(1.17) }
function resetView() { if (controlsRef) controlsRef.autoRotate = false; setView('front', { animated: true }) }
function setMode(mode: DisplayMode) { changeMode(mode) }
defineExpose({ rotate, zoomIn, zoomOut, resetView, setView, setMode })

async function initialize() {
  const version = ++initializationVersion
  cleanup?.()
  loading.value = true
  loadingProgress.value = 0
  error.value = ''
  activeMode = props.initialMode
  await nextTick()
  if (!container.value || !window.WebGLRenderingContext) {
    error.value = viewerCopy.value.unsupported
    loading.value = false
    return
  }

  try {
    const [THREE, loaderModule, controlsModule, samplerModule, environmentModule] = await Promise.all([
      import('three'),
      import('three/examples/jsm/loaders/GLTFLoader.js'),
      import('three/examples/jsm/controls/OrbitControls.js'),
      import('three/examples/jsm/math/MeshSurfaceSampler.js'),
      import('three/examples/jsm/environments/RoomEnvironment.js'),
    ])
    if (version !== initializationVersion || !container.value) return
    quality = selectQuality()
    emit('quality-change', quality)

    const scene = new THREE.Scene()
    // The confirmed moon-jade layout supplies the room as a DOM background.
    // Keep WebGL transparent so the real model sits naturally in that space.
    scene.background = null
    scene.fog = new THREE.FogExp2('#eee9df', .006)
    const camera = new THREE.PerspectiveCamera(37, 1, .1, 80)
    cameraRef = camera
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'mobile' ? 1.25 : 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    // A museum object needs stable material values rather than an HDR-like bloom.
    // NoToneMapping prevents the light gallery from washing the bronze out on refresh.
    renderer.toneMapping = THREE.NoToneMapping
    renderer.toneMappingExposure = 1
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    container.value.replaceChildren(renderer.domElement)
    // Metallic GLB materials need an environment to reflect.  Without this, aged bronze
    // becomes almost black in the otherwise dark digital hall and reads as plastic.
    const pmrem = new THREE.PMREMGenerator(renderer)
    // Keep the moon-white room controlled, but give aged bronze enough
    // reflection to reveal its relief and patina instead of reading as black.
    const environmentTarget = pmrem.fromScene(new environmentModule.RoomEnvironment(), .04)
    scene.environment = environmentTarget.texture
    scene.environmentIntensity = .5
    pmrem.dispose()

    const controls = new controlsModule.OrbitControls(camera, renderer.domElement)
    controlsRef = controls
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
    controls.minAzimuthAngle = -Math.PI
    controls.maxAzimuthAngle = Math.PI
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
    controls.addEventListener('end', onControlsEnd)
    renderer.domElement.addEventListener('pointermove', onCanvasPointerMove, { passive: true })
    renderer.domElement.addEventListener('pointerleave', onCanvasPointerLeave, { passive: true })
    setView('front', { animated: false })
    renderer.domElement.addEventListener('dblclick', resetView)

    const floor = new THREE.Mesh(new THREE.CircleGeometry(8, 96), new THREE.MeshStandardMaterial({ color: '#d7d0c4', roughness: 1, metalness: 0, opacity: .1, transparent: true }))
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    scene.add(floor)
    // Warm limestone layers mirror the confirmed reference without competing
    // with the aged bronze. The thin brass ring is the only bright accent.
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 2.28, .32, 96), new THREE.MeshStandardMaterial({ color: '#c9c1b4', roughness: .88, metalness: .02 }))
    base.position.y = .21
    base.receiveShadow = true
    scene.add(base)
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.88, 1.96, .19, 96), new THREE.MeshStandardMaterial({ color: '#eee8dc', roughness: .82, metalness: .02 }))
    top.position.y = .44
    top.receiveShadow = true
    scene.add(top)
    const pedestalTrim = new THREE.Mesh(
      new THREE.TorusGeometry(1.8, .018, 8, 128),
      new THREE.MeshStandardMaterial({ color: '#b68a4b', roughness: .5, metalness: .68 }),
    )
    pedestalTrim.rotation.x = Math.PI / 2
    pedestalTrim.position.y = .545
    scene.add(pedestalTrim)
    ;[2.38, 3.55, 4.65].forEach((radius, index) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, index === 0 ? .016 : .006, 6, 96), new THREE.MeshBasicMaterial({ color: '#af9d7d', transparent: true, opacity: .12 - index * .03 }))
      ring.rotation.x = Math.PI / 2
      ring.position.y = .03
      scene.add(ring)
    })
    const river = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-7.5, 2.2, -4.3), new THREE.Vector3(-4.2, 3.25, -6.3), new THREE.Vector3(-1, 2.3, -7.7), new THREE.Vector3(2.2, 3.1, -7.3), new THREE.Vector3(5.5, 2.5, -5.7), new THREE.Vector3(7.6, 3.1, -4.2),
    ])
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(river.getPoints(150)), new THREE.LineBasicMaterial({ color: '#b79d70', transparent: true, opacity: .08 })))
    scene.add(new THREE.HemisphereLight(0xfff8e9, 0x5c675f, 1.08))
    const key = new THREE.SpotLight(0xffe8c6, 132, 16, .44, .78, 1.5)
    key.position.set(2.2, 7.6, 3.4); key.target.position.set(0, 1.05, 0); key.castShadow = true; key.shadow.mapSize.set(1024, 1024)
    scene.add(key, key.target)
    const fill = new THREE.PointLight(0xb8d1c8, 3.3, 9, 2); fill.position.set(-3.7, 2.5, 2); scene.add(fill)
    const rim = new THREE.PointLight(0xf3cf99, 3.8, 8, 2); rim.position.set(0, 3.8, -4.6); scene.add(rim)
    const front = new THREE.PointLight(0xffe1bd, 5.2, 11, 2); front.position.set(0, 2.8, 5.2); scene.add(front)

    // Rendering directly preserves the alpha channel. Bloom post-processing
    // turns transparent pixels black and would cover the photographic room.
    let composer: { render: () => void; setSize: (width: number, height: number) => void; dispose?: () => void } | undefined

    let cloud: Points | undefined
    let cloudMaterial: ShaderMaterial | undefined
    let artifact: Group | undefined
    let dust: Points | undefined
    const modelMaterials: Array<{ material: OpacityMaterial; opacity: number }> = []
    let transition: { from: number; to: number; start: number; duration: number } | undefined
    let modelRevealStartedAt: number | undefined
    let introStartedAt: number | undefined
    let introComplete = false
    let animationState: PointCloudAnimationState = 'solid'
    let pointCloudAvailable = props.enablePointCloud
    let frameId = 0
    let previousRenderTime = 0
    let lastCheck = performance.now(), renderedFrames = 0, downgraded = false
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const setModelOpacity = (opacity: number) => modelMaterials.forEach(({ material, opacity: original }) => { material.transparent = true; material.opacity = original * opacity; material.depthWrite = opacity > .96 })
    const setMix = (pointMix: number) => {
      if (!artifact || !cloud || !cloudMaterial) return
      const mix = clamp(pointMix)
      cloud.visible = mix > .002
      artifact.visible = mix < .998
      cloudMaterial.uniforms.uProgress.value = 1
      cloudMaterial.uniforms.uOpacity.value = mix
      cloudMaterial.uniforms.uTransition.value = mix
      setModelOpacity(1 - mix)
    }
    const completeSolid = () => {
      introStartedAt = undefined
      transition = undefined
      introComplete = true
      animationState = 'solid'
      activeMode = 'solid'
      setMix(0)
      emit('mode-change', 'solid')
    }
    const beginPointCloudIntro = () => {
      if (!cloud || !cloudMaterial || !artifact || !pointCloudAvailable) return
      introComplete = false
      activeMode = 'points'
      transition = undefined
      cloud.visible = true
      artifact.visible = true
      cloudMaterial.uniforms.uProgress.value = 1
      cloudMaterial.uniforms.uOpacity.value = 0
      cloudMaterial.uniforms.uTransition.value = 0
      cloudMaterial.uniforms.uPulse.value = 0
      setModelOpacity(1)
      if (reducedMotion) {
        animationState = 'solid-transition'
        transition = { from: 0, to: 1, start: performance.now(), duration: 300 }
      } else {
        animationState = 'points-intro'
        introStartedAt = performance.now()
      }
      emit('mode-change', 'points')
    }
    changeMode = (mode: DisplayMode) => {
      if (!cloud || !cloudMaterial || !artifact || !pointCloudAvailable || mode === activeMode && (introComplete || animationState === 'points-intro')) return
      if (mode === 'points') {
        beginPointCloudIntro()
        return
      }
      introStartedAt = undefined
      introComplete = true
      animationState = 'solid-transition'
      transition = { from: Number(cloudMaterial.uniforms.uOpacity.value), to: 0, start: performance.now(), duration: reducedMotion ? 300 : 650 }
      activeMode = 'solid'
      emit('mode-change', 'solid')
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

    const createCloud = (model: Group) => {
      const palette = selectPointCloudPalette(quality)
      const surfaces: Array<{ geometry: BufferGeometry; color: import('three').Color; area: number }> = []
      model.updateMatrixWorld(true)
      model.traverse((object) => {
        const mesh = object as Mesh
        if (!mesh.isMesh || !mesh.visible) return
        const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
        const area = estimateSurfaceArea(geometry, THREE)
        if (!area) { geometry.dispose(); return }
        const rawMaterial = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
        const color = 'color' in rawMaterial && rawMaterial.color instanceof THREE.Color ? rawMaterial.color.clone() : new THREE.Color('#5b6b58')
        surfaces.push({ geometry, color, area })
      })
      const count = POINT_COUNTS[quality === 'fallback' ? 'mobile' : quality]
      const totalArea = surfaces.reduce((total, surface) => total + surface.area, 0)
      const positions = new Float32Array(count * 3), origins = new Float32Array(count * 3), colors = new Float32Array(count * 3), seeds = new Float32Array(count), regions = new Float32Array(count), phases = new Float32Array(count)
      const bounds = new THREE.Box3().setFromObject(model)
      const height = Math.max(bounds.max.y - bounds.min.y, .001)
      const deterministic = (index: number, salt: number) => {
        const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453
        return value - Math.floor(value)
      }
      const sampled = new THREE.Vector3()
      let cursor = 0
      surfaces.forEach((surface, surfaceIndex) => {
        const remaining = surfaces.length - surfaceIndex - 1
        const allocation = Math.max(24, Math.min(count - cursor - remaining * 24, Math.round(count * surface.area / totalArea)))
        const samplingMesh = new THREE.Mesh(surface.geometry)
        const sampler = new samplerModule.MeshSurfaceSampler(samplingMesh).build()
        for (let i = 0; i < allocation && cursor < count; i += 1, cursor += 1) {
          sampler.sample(sampled)
          const seed = deterministic(cursor, surfaceIndex + 1), theta = seed * Math.PI * 2 + cursor * .618, direction = new THREE.Vector3(Math.cos(theta), deterministic(cursor, 13) - .22, Math.sin(theta)).normalize(), travel = 1.6 + deterministic(cursor, 29) * 2.65, offset = cursor * 3
          positions[offset] = sampled.x; positions[offset + 1] = sampled.y; positions[offset + 2] = sampled.z
          origins[offset] = sampled.x * .32 + direction.x * travel; origins[offset + 1] = sampled.y * .42 + direction.y * travel + .8; origins[offset + 2] = sampled.z * .32 + direction.z * travel
          colors[offset] = surface.color.r; colors[offset + 1] = surface.color.g; colors[offset + 2] = surface.color.b; seeds[cursor] = seed
          regions[cursor] = Math.min(5, Math.max(0, Math.floor(((sampled.y - bounds.min.y) / height) * 6)))
          phases[cursor] = deterministic(cursor, 47) * .28
        }
        surface.geometry.dispose()
      })
      while (cursor < count) { const offset = cursor * 3; positions[offset] = positions[0]; positions[offset + 1] = positions[1]; positions[offset + 2] = positions[2]; origins[offset] = origins[0]; origins[offset + 1] = origins[1]; origins[offset + 2] = origins[2]; colors[offset] = colors[0]; colors[offset + 1] = colors[1]; colors[offset + 2] = colors[2]; seeds[cursor] = deterministic(cursor, 59); regions[cursor] = regions[0]; phases[cursor] = phases[0]; cursor += 1 }
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setAttribute('aOrigin', new THREE.BufferAttribute(origins, 3)); geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3)); geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1)); geometry.setAttribute('aRegion', new THREE.BufferAttribute(regions, 1)); geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1))
      cloudMaterial = new THREE.ShaderMaterial({
        transparent: true, depthWrite: true,
        uniforms: { uProgress: { value: 1 }, uOpacity: { value: 0 }, uTime: { value: 0 }, uPulse: { value: 0 }, uTransition: { value: 0 }, uReducedMotion: { value: reducedMotion ? 1 : 0 }, uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }, uPointSize: { value: quality === 'mobile' ? 1.65 : 1.25 }, uJade: { value: new THREE.Vector3(...palette.jade) }, uCopper: { value: new THREE.Vector3(...palette.copper) }, uCopperBase: { value: palette.copperBase }, uCopperRange: { value: palette.copperRange }, uPointOpacity: { value: palette.opacity }, uPointer: { value: new THREE.Vector2() }, uPointerStrength: { value: 0 }, uPointerRadius: { value: .9 } },
        vertexShader: `attribute vec3 aOrigin; attribute vec3 aColor; attribute float aSeed; attribute float aRegion; attribute float aPhase; uniform float uProgress; uniform float uTime; uniform float uReducedMotion; uniform float uPixelRatio; uniform float uPointSize; uniform vec3 uJade; uniform vec3 uCopper; uniform float uCopperBase; uniform float uCopperRange; uniform vec2 uPointer; uniform float uPointerStrength; uniform float uPointerRadius; varying vec3 vColor; varying float vSeed; void main(){float gathered=smoothstep(0.0,1.0,uProgress); float phase=aPhase+aRegion*.035; vec3 drift=vec3(sin(uTime*.85+aSeed*31.0+phase),cos(uTime*.72+aSeed*19.0+phase),sin(uTime*.64+aSeed*47.0+phase))*(1.0-gathered)*.12*(1.0-uReducedMotion); vec3 basePosition=mix(aOrigin,position,gathered)+drift; float pointerDistance=distance(basePosition.xy,uPointer); float pointerInfluence=(1.0-smoothstep(0.0,uPointerRadius,pointerDistance))*uPointerStrength*(1.0-uReducedMotion); vec2 pointerDirection=normalize(basePosition.xy-uPointer+vec2(.0001)); basePosition.xy+=pointerDirection*pointerInfluence*.022; vec4 mvPosition=modelViewMatrix*vec4(basePosition,1.0); gl_PointSize=clamp(uPointSize*uPixelRatio*(1.05+fract(aSeed*13.0))*(7.5/-mvPosition.z),1.0,8.0); gl_Position=projectionMatrix*mvPosition; vec3 sampled=clamp(aColor,vec3(.0),vec3(1.0)); float sourceTone=dot(sampled,vec3(.299,.587,.114)); vec3 aged=mix(uJade,sampled*vec3(.08,.1,.07),.08+sourceTone*.04); vColor=mix(aged,uCopper,uCopperBase+fract(aSeed*11.0)*uCopperRange); vSeed=aSeed;}`,
        fragmentShader: `uniform float uOpacity; uniform float uTime; uniform float uPulse; uniform float uTransition; uniform float uPointOpacity; varying vec3 vColor; varying float vSeed; void main(){float disc=1.0-smoothstep(.34,.5,length(gl_PointCoord-vec2(.5))); float glint=.92+.08*sin(uTime*1.6+vSeed*20.0)*(0.35+uPulse*.65); gl_FragColor=vec4(vColor*glint,disc*uOpacity*uPointOpacity);}`,
      })
      cloud = new THREE.Points(geometry, cloudMaterial)
      cloud.visible = false
      scene.add(cloud)
    }

    let disposed = false
    const loader = new loaderModule.GLTFLoader()
    loader.load(props.modelUrl, (gltf) => {
      if (disposed || version !== initializationVersion) {
        disposeScene(gltf.scene)
        return
      }
      artifact = gltf.scene
      artifact.traverse((object) => {
        const mesh = object as Mesh
        if (!mesh.isMesh) return
        if (/(render[_ -]?floor|display[_ -]?(base|floor)|pedestal|plinth|platform)/i.test(mesh.name)) { mesh.visible = false; return }
        mesh.castShadow = true; mesh.receiveShadow = true
        const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        const cloned = source.map((material) => {
          const next = material.clone() as OpacityMaterial & {
            color?: { setRGB?: (r: number, g: number, b: number) => void }
            envMapIntensity?: number
            metalness?: number
            normalScale?: { set?: (x: number, y: number) => void }
            roughness?: number
          }
          next.transparent = true
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
          modelMaterials.push({ material: next, opacity: next.opacity })
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
      if (props.enablePointCloud) { createCloud(artifact); makeDust() }
      // The initial route must be stable: starting from a bright point-cloud crossfade
      // produced a white flash when the page was refreshed. Point mode remains available
      // on demand, but the default renders the real object immediately.
      if (props.initialMode === 'points' && cloud && cloudMaterial) {
        setMix(1); introComplete = true; animationState = 'points-idle'; activeMode = 'points'; emit('mode-change', 'points')
      } else {
        completeSolid()
        if (!reducedMotion) { setModelOpacity(0); modelRevealStartedAt = performance.now() }
      }
      loadingProgress.value = 100
      loading.value = false
    }, (event) => {
      if (event.lengthComputable && event.total > 0) loadingProgress.value = Math.min(96, Math.round((event.loaded / event.total) * 100))
    }, () => {
      if (disposed || version !== initializationVersion) return
      error.value = viewerCopy.value.loadFailed
      loading.value = false
    })

    const resize = () => { const width = Math.max(container.value?.clientWidth ?? 1, 1), height = Math.max(container.value?.clientHeight ?? 520, 1); camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height, false); composer?.setSize(width, height) }
    const observer = new ResizeObserver(resize); observer.observe(container.value)
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
      if (frameId || !canvasVisible || !pageVisible) return
      renderedFrames = 0
      previousRenderTime = 0
      lastCheck = performance.now()
      frameId = requestAnimationFrame(animate)
    }
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      canvasVisible = entry?.isIntersecting ?? true
      if (canvasVisible) startRendering()
      else if (frameId) { cancelAnimationFrame(frameId); frameId = 0 }
      syncRenderState()
    }, { rootMargin: '120px' })
    visibilityObserver.observe(container.value)
    const onDocumentVisibility = () => {
      pageVisible = !document.hidden
      if (pageVisible) startRendering()
      else if (frameId) { cancelAnimationFrame(frameId); frameId = 0 }
      syncRenderState()
    }
    document.addEventListener('visibilitychange', onDocumentVisibility)
    function animate(time: number) {
      frameId = 0
      if (!canvasVisible || !pageVisible) return
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
      controls.update(); renderedFrames += 1
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
        cloudMaterial.uniforms.uPulse.value = !reducedMotion && (animationState === 'points-idle' || animationState === 'points-intro') ? .5 + Math.sin(time * .00042) * .5 : 0
        if (pointResponseAllowed) {
          raycaster.setFromCamera(pointerNdc, camera)
          if (raycaster.ray.intersectPlane(pointerPlane, pointerIntersection)) pointerWorld.set(pointerIntersection.x, pointerIntersection.y)
        }
        cloudMaterial.uniforms.uPointer.value.copy(pointerWorld)
        cloudMaterial.uniforms.uPointerStrength.value = pointResponseAllowed ? pointerStrength : 0
      }
      if (dust) { dust.rotation.y = reducedMotion ? 0 : time * .00006; (dust.material as import('three').PointsMaterial).opacity = activeMode === 'points' || !introComplete ? .64 : .16 }
      if (modelRevealStartedAt !== undefined && artifact) {
        const reveal = clamp((time - modelRevealStartedAt) / 850)
        setModelOpacity(easeOut(reveal))
        if (reveal >= 1) modelRevealStartedAt = undefined
      }
      if (introStartedAt !== undefined && cloudMaterial && cloud && artifact) {
        const elapsed = time - introStartedAt, revealDuration = 240, scatterDuration = 660, driftDuration = 750, settleDuration = 750, totalDuration = revealDuration + scatterDuration + driftDuration + settleDuration
        let progress = 1, cloudOpacity = 0, modelOpacity = 1
        if (elapsed < revealDuration) {
          cloudOpacity = easeOut(elapsed / revealDuration) * .22
        } else if (elapsed < revealDuration + scatterDuration) {
          const phase = easeOut((elapsed - revealDuration) / scatterDuration)
          progress = 1 - phase
          cloudOpacity = .22 + phase * .78
          modelOpacity = 1 - phase * .88
        } else if (elapsed < revealDuration + scatterDuration + driftDuration) {
          progress = 0
          cloudOpacity = 1
          modelOpacity = .12
        } else {
          progress = easeOut((elapsed - revealDuration - scatterDuration - driftDuration) / settleDuration)
          cloudOpacity = 1
          modelOpacity = .12 * (1 - progress)
        }
        cloudMaterial.uniforms.uProgress.value = progress
        cloudMaterial.uniforms.uOpacity.value = cloudOpacity
        cloudMaterial.uniforms.uTransition.value = cloudOpacity
        cloud.visible = cloudOpacity > .002
        artifact.visible = modelOpacity > .002
        setModelOpacity(modelOpacity)
        if (elapsed >= totalDuration) {
          introStartedAt = undefined
          introComplete = true
          animationState = 'points-idle'
          activeMode = 'points'
          cloud.visible = true
          artifact.visible = false
          cloudMaterial.uniforms.uProgress.value = 1
          cloudMaterial.uniforms.uOpacity.value = 1
          cloudMaterial.uniforms.uTransition.value = 1
          setModelOpacity(0)
        }
      }
      if (transition && cloudMaterial) {
        const progress = clamp((time - transition.start) / transition.duration), mix = transition.from + (transition.to - transition.from) * easeOut(progress)
        setMix(mix)
        if (progress >= 1) {
          const target = transition.to
          transition = undefined
          if (target > .5) {
            introComplete = true
            animationState = 'points-idle'
            activeMode = 'points'
            setMix(1)
          } else {
            completeSolid()
          }
        }
      }
      if (!downgraded && time - lastCheck >= 2500) {
        const fps = renderedFrames / ((time - lastCheck) / 1000); renderedFrames = 0; lastCheck = time
        if (fps < 35 && quality !== 'fallback') { quality = downgradePointCloudQuality(quality); downgraded = true; emit('quality-change', quality); if (quality === 'medium' && cloud) { cloud.geometry.setDrawRange(0, POINT_COUNTS.medium); composer?.dispose?.(); composer = undefined } else if (quality === 'fallback') { pointCloudAvailable = false; animationState = 'fallback'; completeSolid(); animationState = 'fallback' } }
      }
      if (composer) composer.render(); else renderer.render(scene, camera)
      frameId = requestAnimationFrame(animate)
    }
    resize(); startRendering()
    cleanup = () => { disposed = true; cancelAnimationFrame(frameId); observer.disconnect(); visibilityObserver.disconnect(); document.removeEventListener('visibilitychange', onDocumentVisibility); renderer.domElement.removeEventListener('dblclick', resetView); renderer.domElement.removeEventListener('pointermove', onCanvasPointerMove); renderer.domElement.removeEventListener('pointerleave', onCanvasPointerLeave); controls.removeEventListener('start', onControlsStart); controls.removeEventListener('end', onControlsEnd); removeAppliedPointerOffset(); controls.dispose(); cameraTransition = undefined; pointerInteractionRef = undefined; composer?.dispose?.(); environmentTarget.dispose(); disposeScene(scene); renderer.renderLists.dispose(); renderer.dispose(); renderer.domElement.remove(); container.value?.removeAttribute('data-render-state'); controlsRef = undefined; cameraRef = undefined; targetRef = undefined; changeMode = () => undefined; cleanup = undefined }
  } catch {
    if (version !== initializationVersion) return
    error.value = viewerCopy.value.unavailable
    loading.value = false
  }
}

onMounted(initialize)
watch(() => props.modelUrl, initialize)
onBeforeUnmount(() => { initializationVersion += 1; cleanup?.() })
</script>

<template>
  <div class="three-viewer">
    <div ref="container" class="three-canvas" role="img" data-cursor="native" :aria-label="`${alt}${viewerCopy.aria}`"></div>
    <div v-if="loading" class="three-overlay" role="status" aria-live="polite"><div class="exhibit-loader" data-glass="dark"><span class="exhibit-loader__artifact" aria-hidden="true"><i></i><b></b></span><div class="exhibit-loader__copy"><small>DIGITAL OBJECT</small><strong>{{ viewerCopy.loading }}</strong><span class="exhibit-loader__track" aria-hidden="true"><i :style="{ width: `${loadingProgress || 12}%` }"></i></span><em>{{ loadingProgress ? `${loadingProgress}%` : 'LOADING' }}</em></div></div></div>
    <div v-if="error" class="three-fallback" role="alert" aria-live="assertive"><img :src="coverImageUrl" :alt="alt" decoding="async" /><p>{{ error }}</p><button type="button" @click="initialize">{{ viewerCopy.retry }}</button></div>
  </div>
</template>
