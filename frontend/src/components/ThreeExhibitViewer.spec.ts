import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ThreeExhibitViewer from './ThreeExhibitViewer.vue'

const threeState = vi.hoisted(() => ({
  controls: [] as Array<{
    autoRotate: boolean
    dispose: ReturnType<typeof vi.fn>
    emit: (type: string) => void
    listenerCount: () => number
  }>,
  renderers: [] as Array<{
    camera?: { position: { x: number; y: number; z: number } }
    disposed: ReturnType<typeof vi.fn>
    domElement: HTMLCanvasElement
  }>,
  modelLoads: [] as Array<(gltf: { scene: import('three').Group }) => void>,
}))

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>()

  class MockWebGLRenderer {
    readonly domElement = document.createElement('canvas')
    readonly shadowMap = { enabled: false, type: 0 }
    readonly renderLists = { dispose: vi.fn() }
    readonly disposed = vi.fn()
    camera?: { position: { x: number; y: number; z: number } }
    outputColorSpace = ''
    toneMapping = 0
    toneMappingExposure = 1

    constructor() {
      this.domElement.getBoundingClientRect = () => ({
        x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 100,
        width: 200, height: 100, toJSON: () => ({}),
      })
      threeState.renderers.push(this)
    }

    setPixelRatio() {}
    setSize() {}
    render(_scene: unknown, camera: { position: { x: number; y: number; z: number } }) { this.camera = camera }
    dispose() { this.disposed() }
  }

  class MockPMREMGenerator {
    fromScene() { return { texture: {}, dispose: vi.fn() } }
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
    load(_url: string, onLoad: (gltf: { scene: import('three').Group }) => void) { threeState.modelLoads.push(onLoad) }
  },
}))
vi.mock('three/examples/jsm/math/MeshSurfaceSampler.js', () => ({
  MeshSurfaceSampler: class { build() { return this } sample() {} },
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
  })

  afterEach(() => {
    delete document.documentElement.dataset.motionTier
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
    expect(callbacks.size).toBe(0)
    expect(wrapper.get('.three-canvas').attributes('data-render-state')).toBe('paused-hidden')

    hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
    expect(callbacks.size).toBe(1)
    expect(wrapper.get('.three-canvas').attributes('data-render-state')).toBe('running')

    const controls = threeState.controls[0]
    const renderer = threeState.renderers[0]
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
})
