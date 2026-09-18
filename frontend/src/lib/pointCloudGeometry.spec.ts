import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { cloneWorldPositionGeometry, createWorldSamplingSurfaces } from './pointCloudGeometry'

describe('point cloud geometry transforms', () => {
  it('decodes normalized integer positions before applying a world transform', () => {
    const source = new THREE.BufferGeometry()
    source.setAttribute('position', new THREE.BufferAttribute(new Int16Array([
      0, 0, 0,
      32767, 0, 0,
      0, -32767, 0,
    ]), 3, true))
    source.setIndex([0, 1, 2])

    const matrix = new THREE.Matrix4().makeScale(2, 2, 2)
    matrix.setPosition(3, 4, 5)
    const transformed = cloneWorldPositionGeometry(source, matrix, THREE)
    const position = transformed.getAttribute('position')

    expect(position.array).toBeInstanceOf(Float32Array)
    expect(position.getX(0)).toBeCloseTo(3)
    expect(position.getY(0)).toBeCloseTo(4)
    expect(position.getZ(0)).toBeCloseTo(5)
    expect(position.getX(1)).toBeCloseTo(5)
    expect(position.getY(2)).toBeCloseTo(2)
    expect(source.getAttribute('position').array).toBeInstanceOf(Int16Array)
  })

  it('retains transformed surface area and bounds while limiting sampler build batches', async () => {
    const geometry = new THREE.PlaneGeometry(1, 1, 64, 64)
    const matrix = new THREE.Matrix4().makeScale(2, 3, 1)
    matrix.setPosition(5, 6, 7)
    const surfaces = await createWorldSamplingSurfaces(geometry, matrix, THREE, new AbortController().signal)
    expect(surfaces.length).toBeGreaterThan(1)
    expect(surfaces.reduce((sum, surface) => sum + surface.area, 0)).toBeCloseTo(6)
    const bounds = new THREE.Box3()
    for (const surface of surfaces) {
      expect(surface.geometry.getAttribute('position').count).toBeLessThanOrEqual(2048 * 3)
      surface.geometry.computeBoundingBox()
      bounds.union(surface.geometry.boundingBox!)
      surface.geometry.dispose()
    }
    expect(bounds.min.toArray()).toEqual([4, 4.5, 7])
    expect(bounds.max.toArray()).toEqual([6, 7.5, 7])
    geometry.dispose()
  })

  it('releases prepared geometries when interrupted between mesh batches', async () => {
    const geometry = new THREE.PlaneGeometry(1, 1, 128, 128)
    const controller = new AbortController()
    const original = THREE.BufferGeometry.prototype.dispose
    const dispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose').mockImplementation(original)
    const assigned: THREE.BufferGeometry[] = []
    const realSet = THREE.BufferGeometry.prototype.setAttribute
    vi.spyOn(THREE.BufferGeometry.prototype, 'setAttribute').mockImplementation(function (this: THREE.BufferGeometry, name, attribute) {
      assigned.push(this)
      if (assigned.length === 2) controller.abort()
      return realSet.call(this, name, attribute)
    })
    await expect(createWorldSamplingSurfaces(geometry, new THREE.Matrix4(), THREE, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(assigned).toHaveLength(2)
    expect(dispose).toHaveBeenCalledTimes(2)
    vi.restoreAllMocks()
    geometry.dispose()
  })
})
