import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ThreeExhibitViewer from './ThreeExhibitViewer.vue'

const threeState = vi.hoisted(() => ({
  controls: [] as Array<{
    autoRotate: boolean
    dispose: ReturnType<typeof vi.fn>
    emit: (type: string) => void
    listenerCount: () => number
    maxAzimuthAngle: number
    maxPolarAngle: number
    minAzimuthAngle: number
    minPolarAngle: number
  }>,
  renderers: [] as Array<{
    camera?: { position: { x: number; y: number; z: number } }
    compileAsync: ReturnType<typeof vi.fn>
    disposed: ReturnType<typeof vi.fn>
    domElement: HTMLCanvasElement
    options: { antialias?: boolean }
    render: ReturnType<typeof vi.fn>
    scene?: import('three').Scene
    shadowMap: { enabled: boolean; type: number }
  }>,
  compileResolvers: [] as Array<() => void>,
  compileSnapshots: [] as Array<{ pointCloud?: import('three').Points; dust?: import('three').Points; visible?: boolean; opacity?: number; depthWrite?: boolean }>,
  modelLoads: [] as Array<(gltf: { scene: import('three').Group }) => void>,
  modelErrors: [] as Array<() => void>,
  failEnvironment: false,
  meshoptDecoders: [] as unknown[],
  samplerBuilds: 0,
}))

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>()

  class MockWebGLRenderer {
    readonly domElement = document.createElement('canvas')
    readonly shadowMap = { enabled: false, type: 0 }
    readonly renderLists = { dispose: vi.fn() }
    readonly disposed = vi.fn()
    camera?: { position: { x: number; y: number; z: number } }
    scene?: import('three').Scene
    outputColorSpace = ''
    toneMapping = 0
    toneMappingExposure = 1
    readonly options: { antialias?: boolean }

    constructor(options: { antialias?: boolean }) {
      this.options = options
      this.domElement.getBoundingClientRect = () => ({
        x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 100,
        width: 200, height: 100, toJSON: () => ({}),
      })
      threeState.renderers.push(this)
    }

    setPixelRatio() {}
    setSize() {}
    compileAsync = vi.fn((scene: import('three').Scene) => {
      this.scene = scene
      const pointCloud = scene.children.find((child) => child instanceof actual.Points && child.material instanceof actual.ShaderMaterial) as import('three').Points<import('three').BufferGeometry, import('three').ShaderMaterial> | undefined
      const dust = scene.children.find((child) => child instanceof actual.Points && child.material instanceof actual.PointsMaterial) as import('three').Points | undefined
      threeState.compileSnapshots.push({ pointCloud, dust, visible: pointCloud?.visible, opacity: pointCloud?.material.uniforms.uOpacity.value, depthWrite: pointCloud?.material.depthWrite })
      return new Promise<void>((resolve) => { threeState.compileResolvers.push(resolve) })
    })
    render = vi.fn((_scene: unknown, camera: { position: { x: number; y: number; z: number } }) => { this.camera = camera })
    dispose() { this.disposed() }
  }

  class MockPMREMGenerator {
    fromScene() {
      if (threeState.failEnvironment) throw new Error('Environment unavailable')
      return { texture: {}, dispose: vi.fn() }
    }
    dispose() {}
  }

  return { ...actual, WebGLRenderer: MockWebGLRenderer, PMREMGenerator: MockPMREMGenerator }
})

vi.mock('three/examples/jsm/controls/OrbitControls.js', async () => {
  const { Vector3 } = await import('three')

  class MockOrbitControls {
    readonly target = new Vector3()
    readonly touches = { ONE: 0, TWO: 0 }
    readonly dispose = vi.fn()
    autoRotate = false
    enableDamping = false
    enablePan = false
    dampingFactor = 0
    minDistance = 0
    maxDistance = 0
    minPolarAngle = 0
    maxPolarAngle = 0
    minAzimuthAngle = 0
    maxAzimuthAngle = 0
    private readonly listeners = new Map<string, Set<() => void>>()

    constructor(_camera: unknown, _element: HTMLElement) { threeState.controls.push(this) }
    update() {}
    addEventListener(type: string, listener: () => void) {
      const listeners = this.listeners.get(type) ?? new Set()
      listeners.add(listener)
      this.listeners.set(type, listeners)
    }
    removeEventListener(type: string, listener: () => void) { this.listeners.get(type)?.delete(listener) }
    emit(type: string) { this.listeners.get(type)?.forEach((listener) => listener()) }
    listenerCount() { return [...this.listeners.values()].reduce((total, listeners) => total + listeners.size, 0) }
  }

  return { OrbitControls: MockOrbitControls }
})

vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    setMeshoptDecoder(decoder: unknown) { threeState.meshoptDecoders.push(decoder); return this }
    load(_url: string, onLoad: (gltf: { scene: import('three').Group }) => void, _onProgress: unknown, onError: () => void) {
      threeState.modelLoads.push(onLoad)
      threeState.modelErrors.push(onError)
    }
  },
}))
vi.mock('three/examples/jsm/math/MeshSurfaceSampler.js', () => ({
  MeshSurfaceSampler: class { build() { threeState.samplerBuilds += 1; return this } sample() {} },
}))
vi.mock('three/examples/jsm/libs/meshopt_decoder.module.js', () => ({
  MeshoptDecoder: { ready: Promise.resolve(), supported: true },
}))
vi.mock('three/examples/jsm/environments/RoomEnvironment.js', () => ({
  RoomEnvironment: class {},
}))

describe('ThreeExhibitViewer pointer ownership', () => {
  let callbacks: Map<number, FrameRequestCallback>
  let frameId: number
  let now: number
  let hidden: boolean
  let originalHidden: PropertyDescriptor | undefined

  beforeEach(() => {
    callbacks = new Map()
    frameId = 0
    now = 1000
    hidden = true
    threeState.controls.length = 0
    threeState.renderers.length = 0
    threeState.modelLoads.length = 0
    threeState.modelErrors.length = 0
    threeState.failEnvironment = false
    threeState.compileResolvers.length = 0
    threeState.compileSnapshots.length = 0
    threeState.meshoptDecoders.length = 0
    threeState.samplerBuilds = 0
    originalHidden = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden')

    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
    Object.defineProperty(window, 'WebGLRenderingContext', { configurable: true, value: class {} })
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      const id = ++frameId
      callbacks.set(id, callback)
      return id
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => { callbacks.delete(id) }))
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query === '(pointer: fine)' || query === '(hover: hover)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })))
    document.documentElement.dataset.motionTier = 'full'
    document.documentElement.dataset.theme = 'light'
  })

  afterEach(() => {
    delete document.documentElement.dataset.motionTier
    delete document.documentElement.dataset.theme
    if (originalHidden) Object.defineProperty(document, 'hidden', originalHidden)
    else Reflect.deleteProperty(document, 'hidden')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function runFrame(time: number) {
    const entry = callbacks.entries().next().value as [number, FrameRequestCallback] | undefined
    expect(entry).toBeDefined()
    if (!entry) return
    callbacks.delete(entry[0])
    entry[1](time)
  }

  it('recovers from a hidden mount, lets OrbitControls interrupt, and cleans up on unmount', async () => {
    const wrapper = mount(ThreeExhibitViewer, {
      props: { modelUrl: '/model.glb', coverImageUrl: '/cover.png', alt: '青铜鼎' },
      attachTo: document.body,
    })
    await flushPromises()
    await flushPromises()

    await vi.waitFor(() => {
      const alert = wrapper.find('[role="alert"]')
      expect(alert.exists() ? alert.text() : '').toBe('')
    expect(threeState.controls).toHaveLength(1)
    })
    expect(threeState.renderers).toHaveLength(1)
    expect(threeState.meshoptDecoders).toHaveLength(1)
    expect(threeState.renderers[0]?.options.antialias).toBe(true)
    expect(callbacks.size).toBe(0)
    expect(wrapper.get('.three-canvas').attributes('data-render-state')).toBe('paused-hidden')

    hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
    expect(callbacks.size).toBe(1)
    expect(wrapper.get('.three-canvas').attributes('data-render-state')).toBe('running')

    const controls = threeState.controls[0]
    const renderer = threeState.renderers[0]
    expect(controls.minAzimuthAngle).toBe(-Infinity)
    expect(controls.maxAzimuthAngle).toBe(Infinity)
    expect(controls.minPolarAngle).toBe(.08)
    expect(controls.maxPolarAngle).toBe(1.62)
    const exposed = wrapper.vm as unknown as { setView: (view: 'left') => void }
    exposed.setView('left')
    controls.emit('start')
    runFrame(1260)
    expect(renderer.camera?.position.x).toBeCloseTo(0, 6)

    controls.emit('end')
    const move = new MouseEvent('pointermove', { clientX: 190, clientY: 50 })
    Object.defineProperty(move, 'pointerType', { value: 'mouse' })
    renderer.domElement.dispatchEvent(move)

    runFrame(1319)
    expect(renderer.camera?.position.x).toBeCloseTo(0, 6)
    runFrame(1400)
    expect(renderer.camera?.position.x ?? 0).toBeGreaterThan(0)

    document.documentElement.dataset.motionTier = 'static'
    runFrame(1420)
    expect(renderer.camera?.position.x).toBeCloseTo(0, 6)

    wrapper.unmount()
    expect(callbacks.size).toBe(0)
    expect(controls.dispose).toHaveBeenCalledOnce()
    expect(controls.listenerCount()).toBe(0)
    expect(renderer.disposed).toHaveBeenCalledOnce()
    expect(renderer.domElement.isConnected).toBe(false)
  })

  it('updates the ambient hall fog when the active theme changes and cleans up the listener', async () => {
    hidden = false
    const wrapper = mount(ThreeExhibitViewer, {
      props: { modelUrl: '/model.glb', coverImageUrl: '/cover.png', alt: '青铜鼎', enablePointCloud: false },
      attachTo: document.body,
    })
    await flushPromises()
    await vi.waitFor(() => expect(threeState.modelLoads).toHaveLength(1))

    const THREE = await import('three')
    const model = new THREE.Group()
    model.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial()))
    threeState.modelLoads[0]?.({ scene: model })
    await vi.waitFor(() => expect(threeState.renderers[0]?.scene).toBeDefined())

    const fog = threeState.renderers[0]?.scene?.fog as import('three').FogExp2
    expect(fog.color.getHexString()).toBe('eee9df')
    expect(wrapper.get('.three-canvas').attributes('data-theme-fog')).toBe('light')

    document.documentElement.dataset.theme = 'dark'
    window.dispatchEvent(new CustomEvent('heluo:theme-change', { detail: 'dark' }))
    expect(fog.color.getHexString()).toBe('0c1815')
    expect(wrapper.get('.three-canvas').attributes('data-theme-fog')).toBe('dark')

    threeState.compileResolvers[0]?.()
    await flushPromises()
    wrapper.unmount()
    document.documentElement.dataset.theme = 'light'
    window.dispatchEvent(new CustomEvent('heluo:theme-change', { detail: 'light' }))
    expect(fog.color.getHexString()).toBe('0c1815')
  })

  it('uses the lower fixed-cost renderer profile on a phone viewport', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    const wrapper = mount(ThreeExhibitViewer, {
      props: { modelUrl: '/model-mobile.glb', coverImageUrl: '/cover.png', alt: '青铜鼎' },
      attachTo: document.body,
    })
    await flushPromises()
    await vi.waitFor(() => expect(threeState.modelLoads).toHaveLength(1))

    const renderer = threeState.renderers[0]
    expect(renderer?.options.antialias).toBe(false)
    expect(renderer?.shadowMap.enabled).toBe(false)
    expect(threeState.samplerBuilds).toBe(0)
    expect(threeState.meshoptDecoders).toHaveLength(1)

    const THREE = await import('three')
    const artifactMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial())
    const scene = new THREE.Group()
    scene.add(artifactMesh)
    threeState.modelLoads[0]?.({ scene })
    await flushPromises()
    expect(artifactMesh.castShadow).toBe(false)
    expect(artifactMesh.receiveShadow).toBe(false)
    threeState.compileResolvers[0]?.()
    await flushPromises()

    const exposed = wrapper.vm as unknown as { setMode: (mode: 'points') => void }
    exposed.setMode('points')
    await vi.waitFor(() => expect(threeState.compileSnapshots).toHaveLength(2))
    expect(threeState.compileSnapshots[1]?.dust).toBeUndefined()
    threeState.compileResolvers[1]?.()
    await flushPromises()
    wrapper.unmount()
  })

  it('disposes a model that resolves after the viewer was unmounted', async () => {
    const wrapper = mount(ThreeExhibitViewer, {
      props: { modelUrl: '/slow-model.glb', coverImageUrl: '/cover.png', alt: '青铜鼎' },
      attachTo: document.body,
    })
    await flushPromises()
    await flushPromises()
    await vi.waitFor(() => expect(threeState.modelLoads).toHaveLength(1))

    const THREE = await import('three')
    const geometry = new THREE.BoxGeometry()
    const material = new THREE.MeshBasicMaterial()
    const disposeGeometry = vi.spyOn(geometry, 'dispose')
    const disposeMaterial = vi.spyOn(material, 'dispose')
    const scene = new THREE.Group()
    scene.add(new THREE.Mesh(geometry, material))

    wrapper.unmount()
    threeState.modelLoads[0]?.({ scene })

    expect(disposeGeometry).toHaveBeenCalledOnce()
    expect(disposeMaterial).toHaveBeenCalledOnce()
  })

  it('cleans resources when initialization fails before controls and observers exist', async () => {
    threeState.failEnvironment = true
    const wrapper = mount(ThreeExhibitViewer, {
      props: { modelUrl: '/model.glb', coverImageUrl: '/cover.png', alt: '青铜鼎' },
      attachTo: document.body,
    })
    await vi.waitFor(() => expect(threeState.renderers).toHaveLength(1))
    await flushPromises()
    expect(wrapper.find('.three-fallback').exists()).toBe(true)
    expect(wrapper.find('canvas').exists()).toBe(false)
    expect(threeState.renderers[0]!.disposed).toHaveBeenCalledOnce()
    wrapper.unmount()
    expect(threeState.renderers[0]!.disposed).toHaveBeenCalledOnce()
  })

  it('stops a failed model runtime and retry creates only one new canvas', async () => {
    hidden = false
    const wrapper = mount(ThreeExhibitViewer, {
      props: { modelUrl: '/model.glb', coverImageUrl: '/cover.png', alt: '青铜鼎' },
      attachTo: document.body,
    })
    await vi.waitFor(() => expect(threeState.modelLoads).toHaveLength(1))
    threeState.modelErrors[0]!()
    await flushPromises()
    expect(callbacks.size).toBe(0)
    expect(threeState.controls[0]!.listenerCount()).toBe(0)
    expect(threeState.renderers[0]!.disposed).toHaveBeenCalledOnce()
    await wrapper.get('.three-fallback button').trigger('click')
    await vi.waitFor(() => expect(threeState.renderers).toHaveLength(2))
    expect(wrapper.findAll('canvas')).toHaveLength(1)
    wrapper.unmount()
    expect(threeState.renderers[0]!.disposed).toHaveBeenCalledOnce()
    expect(threeState.renderers[1]!.disposed).toHaveBeenCalledOnce()
  })

  it('shows a retryable poster after context loss and stops submissions', async () => {
    hidden = false
    const wrapper = mount(ThreeExhibitViewer, {
      props: { modelUrl: '/model.glb', coverImageUrl: '/cover.png', alt: '青铜鼎' },
      attachTo: document.body,
    })
    await vi.waitFor(() => expect(threeState.modelLoads).toHaveLength(1))
    runFrame(1100)
    expect(wrapper.get('.three-canvas').attributes('data-render-submissions')).toBe('1')
    const lost = new Event('webglcontextlost', { cancelable: true })
    threeState.renderers[0]!.domElement.dispatchEvent(lost)
    await flushPromises()
    expect(lost.defaultPrevented).toBe(true)
    expect(wrapper.get('.three-fallback img').attributes('src')).toBe('/cover.png')
    expect(wrapper.get('.three-canvas').attributes('data-render-state')).toBe('stopped')
    expect(callbacks.size).toBe(0)
    expect(threeState.renderers[0]!.disposed).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('disposes a shared texture and geometry only once across cloned model materials', async () => {
    const wrapper = mount(ThreeExhibitViewer, {
      props: { modelUrl: '/model.glb', coverImageUrl: '/cover.png', alt: '青铜鼎' },
      attachTo: document.body,
    })
    await vi.waitFor(() => expect(threeState.modelLoads).toHaveLength(1))
    const THREE = await import('three')
    const geometry = new THREE.BoxGeometry()
    const texture = new THREE.Texture()
    const material = new THREE.MeshStandardMaterial({ map: texture, roughnessMap: texture })
    const scene = new THREE.Group()
    scene.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material))
    const releaseGeometry = vi.spyOn(geometry, 'dispose')
    const releaseTexture = vi.spyOn(texture, 'dispose')
    const releaseMaterial = vi.spyOn(material, 'dispose')
    threeState.modelLoads[0]!({ scene })
    await flushPromises()
    wrapper.unmount()
    threeState.compileResolvers[0]!()
    await flushPromises()
    expect(releaseGeometry).toHaveBeenCalledOnce()
    expect(releaseTexture).toHaveBeenCalledOnce()
    expect(releaseMaterial).toHaveBeenCalledOnce()
  })

  it('cancels point sampling on unmount without creating or compiling a late cloud', async () => {
    const wrapper = mount(ThreeExhibitViewer, {
      props: { modelUrl: '/model.glb', coverImageUrl: '/cover.png', alt: '青铜鼎' },
      attachTo: document.body,
    })
    await vi.waitFor(() => expect(threeState.modelLoads).toHaveLength(1))
    const THREE = await import('three')
    const scene = new THREE.Group()
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()))
    threeState.modelLoads[0]!({ scene })
    await flushPromises()
    threeState.compileResolvers[0]!()
    await flushPromises()
    const exposed = wrapper.vm as unknown as { setMode: (mode: 'points') => void }
    exposed.setMode('points')
    expect(wrapper.emitted('point-cloud-state')?.at(-1)).toEqual(['loading'])
    expect(wrapper.get('.three-canvas').attributes('data-point-cloud-state')).toBe('loading')
    wrapper.unmount()
    await flushPromises()
    expect(threeState.samplerBuilds).toBe(0)
    expect(threeState.compileSnapshots).toHaveLength(1)
    expect(threeState.renderers[0]!.disposed).toHaveBeenCalledOnce()
  })

  it('cancels a pending cloud when returning to solid and allows a fresh retry', async () => {
    const wrapper = mount(ThreeExhibitViewer, {
      props: { modelUrl: '/model.glb', coverImageUrl: '/cover.png', alt: '青铜鼎' },
      attachTo: document.body,
    })
    await vi.waitFor(() => expect(threeState.modelLoads).toHaveLength(1))
    const THREE = await import('three')
    const scene = new THREE.Group()
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()))
    threeState.modelLoads[0]!({ scene })
    await flushPromises()
    threeState.compileResolvers[0]!()
    await flushPromises()
    const exposed = wrapper.vm as unknown as { setMode: (mode: 'solid' | 'points') => void }
    exposed.setMode('points')
    exposed.setMode('solid')
    await flushPromises()
    expect(threeState.samplerBuilds).toBe(0)
    expect(wrapper.emitted('point-cloud-state')?.at(-1)).toEqual(['idle'])
    exposed.setMode('points')
    await vi.waitFor(() => expect(threeState.compileSnapshots).toHaveLength(2))
    threeState.compileResolvers[1]!()
    await flushPromises()
    expect(wrapper.emitted('point-cloud-state')?.at(-1)).toEqual(['ready'])
    wrapper.unmount()
  })

  it('excludes loading from quality decisions and counts actual submitted frames', async () => {
    hidden = false
    const wrapper = mount(ThreeExhibitViewer, {
      props: { modelUrl: '/model.glb', coverImageUrl: '/cover.png', alt: '青铜鼎' },
      attachTo: document.body,
    })
    await vi.waitFor(() => expect(threeState.modelLoads).toHaveLength(1))
    for (let time = 1000; time <= 10000; time += 100) runFrame(time)
    expect(wrapper.emitted('quality-change')).toEqual([['medium']])
    expect(wrapper.get('.three-canvas').attributes('data-render-fps-window')).toBeUndefined()
    const THREE = await import('three')
    const scene = new THREE.Group()
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()))
    threeState.modelLoads[0]!({ scene })
    await flushPromises()
    threeState.compileResolvers[0]!()
    await flushPromises()
    for (let time = 10100; time <= 17000; time += 100) runFrame(time)
    expect(wrapper.emitted('quality-change')).toEqual([['medium'], ['fallback']])
    expect(Number(wrapper.get('.three-canvas').attributes('data-render-submissions'))).toBe(threeState.renderers[0]!.render.mock.calls.length)
    expect(wrapper.get('.three-canvas').attributes('data-quality')).toBe('fallback')
    wrapper.unmount()
  })

  it('keeps the loading veil until the complete opaque first frame is compiled and rendered', async () => {
    const firstFrameEvents: Array<Event> = []
    const onFirstFrame = (event: Event) => firstFrameEvents.push(event)
    window.addEventListener('heluo:three-first-frame-ready', onFirstFrame)
    const wrapper = mount(ThreeExhibitViewer, {
      props: { modelUrl: '/model.glb', coverImageUrl: '/cover.png', alt: '青铜鼎', enablePointCloud: false },
      attachTo: document.body,
    })
    await flushPromises()
    await vi.waitFor(() => expect(threeState.modelLoads).toHaveLength(1))

    const THREE = await import('three')
    const material = new THREE.MeshStandardMaterial({ opacity: 1 })
    const scene = new THREE.Group()
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), material))
    threeState.modelLoads[0]?.({ scene })
    await flushPromises()

    const renderer = threeState.renderers[0]
    expect(renderer.compileAsync).toHaveBeenCalledOnce()
    expect(wrapper.find('.three-overlay').exists()).toBe(true)
    expect(threeState.compileResolvers).toHaveLength(1)
    expect(performance.getEntriesByName('heluo-three-first-frame-ready', 'mark')).toHaveLength(0)
    expect(wrapper.get('.three-canvas').attributes('data-three-ready')).toBeUndefined()

    threeState.compileResolvers[0]?.()
    await flushPromises()

    expect(renderer.render).toHaveBeenCalled()
    expect(performance.getEntriesByName('heluo-three-first-frame-ready', 'mark')).toHaveLength(1)
    expect(wrapper.get('.three-canvas').attributes('data-three-ready')).toBe('true')
    expect(Number(wrapper.get('.three-canvas').attributes('data-three-ready-at'))).toBe(now)
    expect(firstFrameEvents).toHaveLength(1)
    expect(wrapper.find('.three-overlay').exists()).toBe(false)
    const loadedMaterial = (scene.children[0] as import('three').Mesh).material as import('three').Material & { opacity: number }
    expect(loadedMaterial.opacity).toBe(1)

    const exposed = wrapper.vm as unknown as { rotate: () => void }
    expect(wrapper.get('.three-canvas').attributes('data-auto-rotate')).toBe('false')
    exposed.rotate()
    expect(wrapper.get('.three-canvas').attributes('data-auto-rotate')).toBe('true')
    wrapper.unmount()
    window.removeEventListener('heluo:three-first-frame-ready', onFirstFrame)
  })

  it('loads and compiles the point cloud only after the first request, then reverses without snapping', async () => {
    hidden = false
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    const wrapper = mount(ThreeExhibitViewer, {
      props: { modelUrl: '/model.glb', coverImageUrl: '/cover.png', alt: '青铜鼎' },
      attachTo: document.body,
    })
    await flushPromises()
    await vi.waitFor(() => expect(threeState.modelLoads).toHaveLength(1))

    const THREE = await import('three')
    const scene = new THREE.Group()
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial()))
    threeState.modelLoads[0]?.({ scene })
    await flushPromises()

    const solidCompile = threeState.compileSnapshots[0]
    expect(solidCompile.pointCloud).toBeUndefined()
    expect(threeState.samplerBuilds).toBe(0)
    threeState.compileResolvers[0]?.()
    await flushPromises()

    const exposed = wrapper.vm as unknown as { setMode: (mode: 'solid' | 'points') => void }
    exposed.setMode('points')
    exposed.setMode('points')
    await vi.waitFor(() => expect(threeState.compileSnapshots).toHaveLength(2))

    const prewarm = threeState.compileSnapshots[1]
    expect(prewarm.visible).toBe(true)
    expect(prewarm.opacity).toBe(0)
    expect(prewarm.depthWrite).toBe(true)
    expect(threeState.samplerBuilds).toBe(1)
    threeState.compileResolvers[1]?.()
    await flushPromises()
    expect(prewarm.pointCloud?.visible).toBe(false)

    runFrame(1900)
    const material = prewarm.pointCloud?.material as import('three').ShaderMaterial
    expect(material.uniforms.uJade.value.toArray()).toEqual([.018, .18, .105])
    expect(material.uniforms.uCopper.value.toArray()).toEqual([.48, .24, .055])
    expect(material.uniforms.uPointSize.value).toBe(.92)

    document.documentElement.dataset.theme = 'dark'
    window.dispatchEvent(new CustomEvent('heluo:theme-change', { detail: 'dark' }))
    expect(material.uniforms.uJade.value.toArray()).toEqual([.09, .58, .31])
    expect(material.uniforms.uCopper.value.toArray()).toEqual([.92, .46, .09])
    expect(material.uniforms.uPointOpacity.value).toBe(.94)
    expect(material.uniforms.uPointSize.value).toBe(1.16)

    document.documentElement.dataset.theme = 'light'
    window.dispatchEvent(new CustomEvent('heluo:theme-change', { detail: 'light' }))
    expect(material.uniforms.uJade.value.toArray()).toEqual([.018, .18, .105])
    expect(material.uniforms.uPointSize.value).toBe(.92)
    const gatherBeforeReverse = Number(material.uniforms.uProgress.value)
    const opacityBeforeReverse = Number(material.uniforms.uOpacity.value)
    const revealBeforeReverse = Number(material.uniforms.uTransition.value)
    expect(gatherBeforeReverse).toBeGreaterThan(.18)
    expect(gatherBeforeReverse).toBeLessThan(.26)
    expect(opacityBeforeReverse).toBe(1)
    expect(revealBeforeReverse).toBeCloseTo(.5, 1)
    expect(material.fragmentShader).toContain('vSeed>uTransition')
    expect(material.fragmentShader).toContain('pow(disc,1.25)*uPointOpacity')
    expect(material.fragmentShader).not.toContain('disc*uOpacity*uPointOpacity')

    now = 1900
    exposed.setMode('solid')
    runFrame(1916)
    expect(Number(material.uniforms.uProgress.value)).toBeCloseTo(gatherBeforeReverse, 2)
    expect(Number(material.uniforms.uOpacity.value)).toBeCloseTo(opacityBeforeReverse, 2)
    expect(Number(material.uniforms.uTransition.value)).toBeCloseTo(revealBeforeReverse, 2)
    runFrame(2600)
    expect(prewarm.pointCloud?.visible).toBe(false)
    expect((scene.children[0] as import('three').Mesh).visible).toBe(true)
    const solidMaterial = (scene.children[0] as import('three').Mesh).material as import('three').Material & { opacity: number }
    expect(solidMaterial.opacity).toBe(1)
    wrapper.unmount()
  })

  it('continues from the current diffusion frame when reversing twice', async () => {
    hidden = false
    const wrapper = mount(ThreeExhibitViewer, {
      props: { modelUrl: '/model.glb', coverImageUrl: '/cover.png', alt: '青铜鼎' },
      attachTo: document.body,
    })
    await flushPromises()
    await vi.waitFor(() => expect(threeState.modelLoads).toHaveLength(1))

    const THREE = await import('three')
    const scene = new THREE.Group()
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial()))
    threeState.modelLoads[0]?.({ scene })
    await flushPromises()
    expect(threeState.compileSnapshots[0]?.pointCloud).toBeUndefined()
    threeState.compileResolvers[0]?.()
    await flushPromises()

    const exposed = wrapper.vm as unknown as { setMode: (mode: 'solid' | 'points') => void }
    exposed.setMode('points')
    await vi.waitFor(() => expect(threeState.compileSnapshots).toHaveLength(2))
    const prewarm = threeState.compileSnapshots[1]
    threeState.compileResolvers[1]?.()
    await flushPromises()
    const material = prewarm.pointCloud?.material as import('three').ShaderMaterial
    runFrame(1900)
    now = 1900
    exposed.setMode('solid')
    runFrame(2100)
    const gatherDuringReturn = Number(material.uniforms.uProgress.value)
    const revealDuringReturn = Number(material.uniforms.uTransition.value)

    now = 2100
    exposed.setMode('points')
    runFrame(2116)
    expect(Number(material.uniforms.uProgress.value)).toBeCloseTo(gatherDuringReturn, 2)
    expect(Number(material.uniforms.uOpacity.value)).toBe(1)
    expect(Number(material.uniforms.uTransition.value)).toBeCloseTo(revealDuringReturn, 2)
    runFrame(2700)
    expect(Number(material.uniforms.uProgress.value)).toBe(1)
    expect(Number(material.uniforms.uOpacity.value)).toBe(1)
    wrapper.unmount()
  })
})
