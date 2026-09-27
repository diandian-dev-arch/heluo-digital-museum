import { chromium } from '@playwright/test'
import { readdir, mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const assets = await readdir('dist/assets')
const asset = prefix => '/assets/' + assets.find(n => n.startsWith(prefix) && n.endsWith('.js'))
const modules = { three: asset('three.module-'), room: asset('RoomEnvironment-'), loader: asset('GLTFLoader-'), meshopt: asset('meshopt_decoder.module-') }
const output = resolve('../artifacts/real-device', `three-isolation-${Date.now()}`)
await mkdir(output, { recursive: true })
const browser = await chromium.connectOverCDP('http://127.0.0.1:19222')
const results = []
try {
  const page = browser.contexts()[0].pages().find(p => p.url().startsWith('http://127.0.0.1:4189/'))
  if (!page) throw new Error('Candidate tab missing')
  await page.route('**/__three-isolation', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>3D diagnosis</title><body style="margin:0">' }))
  await page.route('**/__raw-image-*', route => route.fulfill({path:resolve('../artifacts/real-device/png-model-trial',`image-${route.request().url().split('__raw-image-')[1]}.rgba`),contentType:'application/octet-stream'}))
  const source=await readFile('public/media/models/heluo-bronze-ding-v5.5-mobile.glb')
  const sourceDoc=JSON.parse(source.subarray(20,20+source.readUInt32LE(12)).toString())
  const textureSources=sourceDoc.textures.map(t=>t.extensions?.EXT_texture_webp?.source??t.source)
  const stages = process.argv.slice(2)
  for (const stage of stages.length ? stages : ['basic', 'pbr', 'environment', 'model']) {
    await page.goto('http://127.0.0.1:4189/__three-isolation')
    const result = await page.evaluate(async ({ modules, stage, textureSources }) => {
      const events = []
      const THREE = await import(modules.three)
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'high-performance' })
      renderer.setSize(360, 500)
      renderer.setPixelRatio(1.25)
      document.body.append(renderer.domElement)
      renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); events.push('contextlost') })
      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(37, 360 / 500, .1, 80)
      camera.position.set(0, 1, 7)
      scene.add(new THREE.AmbientLight(0xffffff, 2))
      let object = new THREE.Mesh(new THREE.BoxGeometry(), stage === 'basic' ? new THREE.MeshBasicMaterial({ color: 0x559966 }) : new THREE.MeshStandardMaterial({ color: 0x559966, roughness: .76, metalness: .62 }))
      if (stage.startsWith('synthetic-')) {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = Number(stage.split('-').at(-1))
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#559966'; ctx.fillRect(0, 0, canvas.width, canvas.height)
        object.material = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas) })
      }
      if (stage === 'environment' || stage === 'model' || stage === 'model-no-textures' || stage === 'model-html-images-env' || stage === 'model-raw-env') {
        const { RoomEnvironment } = await import(modules.room)
        const pmrem = new THREE.PMREMGenerator(renderer)
        const room = new RoomEnvironment()
        scene.environment = pmrem.fromScene(room, .04).texture
        pmrem.dispose(); room.dispose()
      }
      if (stage.startsWith('model') || stage === 'cube-source-texture') {
        if (stage.startsWith('model-html-images')) window.createImageBitmap = undefined
        const { GLTFLoader } = await import(modules.loader)
        const { MeshoptDecoder } = await import(modules.meshopt)
        const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
        const gltf = await loader.loadAsync('/media/models/heluo-bronze-ding-v5.5-mobile.glb')
        object = gltf.scene
        if(stage === 'model-raw-env') {
          const replacements=new Map()
          const pending=[]
          object.traverse(mesh=>{if(mesh.isMesh)for(const key of ['map','normalMap','roughnessMap','metalnessMap','aoMap']) {
            const texture=mesh.material[key]; if(!texture)continue
            if(!replacements.has(texture)) {
              const index=gltf.parser.associations.get(texture)?.textures
              if(index===undefined)throw new Error('Texture association missing')
              replacements.set(texture,(async()=>{
                const rgba=new Uint8Array(await (await fetch('/__raw-image-'+textureSources[index])).arrayBuffer())
                const copy=new THREE.DataTexture(rgba,texture.image.width,texture.image.height)
                for(const prop of ['colorSpace','wrapS','wrapT','minFilter','magFilter','generateMipmaps','anisotropy','channel'])copy[prop]=texture[prop]
                copy.flipY=false;copy.needsUpdate=true;return copy
              })())
            }
            pending.push(replacements.get(texture).then(copy=>{mesh.material[key]=copy}))
          }})
          await Promise.all(pending)
        }
        if (stage === 'model-synthetic1024' || stage === 'cube-source-texture') {
          let map
          object.traverse(mesh => { if (mesh.isMesh && mesh.material.map) map = mesh.material.map })
          if (!map) throw new Error('Source texture missing; cannot test texture isolation')
          if (stage === 'cube-source-texture') object = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ map }))
          else {
            const canvas = document.createElement('canvas')
            canvas.width = canvas.height = 1024
            const ctx = canvas.getContext('2d')
            ctx.fillStyle = '#559966'; ctx.fillRect(0, 0, 1024, 1024)
            object.traverse(mesh => { if (mesh.isMesh) mesh.material = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas) }) })
          }
        }
        object.traverse(mesh => { if (mesh.isMesh) for (const key of ['map', 'normalMap', 'roughnessMap']) if (mesh.material[key]) { const t = mesh.material[key]; events.push({ texture: key, width: t.image.width, height: t.image.height, source: t.image.constructor.name, format: t.format, type: t.type, colorSpace: t.colorSpace, flipY: t.flipY, wrapS: t.wrapS, minFilter: t.minFilter, anisotropy: t.anisotropy }) } })
        if (stage.startsWith('model-textures-') || ['model-data-textures', 'model-canvas-textures', 'model-no-mip', 'model-color-only', 'model-basic-map', 'model-no-srgb'].includes(stage)) object.traverse(mesh => {
          if (!mesh.isMesh) return
          mesh.material = mesh.material.clone()
          for (const key of ['map', 'normalMap', 'aoMap', 'roughnessMap', 'metalnessMap']) {
            const texture = mesh.material[key]
            if (!texture) continue
            if (stage === 'model-color-only' && key !== 'map') { mesh.material[key] = null; continue }
            let copy = texture.clone()
            if (stage === 'model-data-textures') {
              const canvas = document.createElement('canvas')
              canvas.width = texture.image.width; canvas.height = texture.image.height
              const ctx = canvas.getContext('2d', { willReadFrequently: true })
              ctx.drawImage(texture.image, 0, 0)
              copy = new THREE.DataTexture(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)
              for (const prop of ['colorSpace', 'wrapS', 'wrapT', 'minFilter', 'magFilter', 'generateMipmaps', 'anisotropy', 'channel']) copy[prop] = texture[prop]
              copy.flipY = false
            }
            if (stage === 'model-canvas-textures' || stage.startsWith('model-textures-')) {
              const canvas = document.createElement('canvas')
              const limit = stage.startsWith('model-textures-') ? Number(stage.split('-').at(-1)) : texture.image.width
              canvas.width = Math.min(limit, texture.image.width); canvas.height = Math.min(limit, texture.image.height)
              canvas.getContext('2d').drawImage(texture.image, 0, 0, canvas.width, canvas.height)
              copy.image = canvas
              copy.flipY = false
            }
            if (stage === 'model-no-mip') { copy.generateMipmaps = false; copy.minFilter = THREE.LinearFilter }
            if (stage === 'model-no-srgb') copy.colorSpace = THREE.NoColorSpace
            copy.needsUpdate = true
            mesh.material[key] = copy
          }
          if (stage === 'model-basic-map') mesh.material = new THREE.MeshBasicMaterial({ map: mesh.material.map })
        })
        if (stage === 'model-original-no-textures' || stage === 'model-standard-textures') object.traverse(mesh => {
          if (!mesh.isMesh) return
          const original = mesh.material
          if (stage === 'model-original-no-textures') {
            mesh.material = original.clone()
            for (const key of ['map', 'normalMap', 'aoMap', 'roughnessMap', 'metalnessMap']) mesh.material[key] = null
          } else {
            mesh.material = new THREE.MeshStandardMaterial({ color: original.color, roughness: .76, metalness: .62 })
            for (const key of ['map', 'normalMap', 'aoMap', 'roughnessMap', 'metalnessMap']) mesh.material[key] = original[key]
          }
        })
        if (stage === 'model-basic' || stage === 'model-no-textures') object.traverse(mesh => {
          if (!mesh.isMesh) return
          mesh.material = stage === 'model-basic' ? new THREE.MeshBasicMaterial({ color: 0x559966 }) : new THREE.MeshStandardMaterial({ color: 0x559966, roughness: .76, metalness: .62 })
        })
        const bounds = new THREE.Box3().setFromObject(object)
        const size = bounds.getSize(new THREE.Vector3())
        const center = bounds.getCenter(new THREE.Vector3())
        const scale = 3.35 / Math.max(size.x, size.y, size.z)
        object.scale.setScalar(scale)
        object.position.copy(center.multiplyScalar(-scale))
      }
      scene.add(object)
      renderer.render(scene, camera)
      await new Promise(resolve => setTimeout(resolve, 1800))
      return { stage, events, lost: renderer.getContext().isContextLost(), calls: renderer.info.render.calls, textures: renderer.info.memory.textures }
    }, { modules, stage, textureSources }).catch(e => ({ stage, error: e.message }))
    results.push(result)
    await page.screenshot({ path: resolve(output, stage + '.png'), timeout: 10000 }).catch(() => {})
    console.log(JSON.stringify(result))
  }
  await page.unroute('**/__three-isolation')
  await page.goto('http://127.0.0.1:4189/exhibits/heluo-bronze-ding-3d')
} finally {
  await writeFile(resolve(output, 'results.json'), JSON.stringify({ modules, results }, null, 2))
  console.log(output)
  await browser.close()
}
