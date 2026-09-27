import type { BufferGeometry, Matrix4 } from 'three'
import { runInTimeSlices } from './exhibitLifecycle'

export interface PointCloudSurface { geometry: BufferGeometry; area: number }

/** Bound the synchronous MeshSurfaceSampler.build cost by limiting each input mesh. */
export async function createWorldSamplingSurfaces(
  source: BufferGeometry,
  matrix: Matrix4,
  THREE: typeof import('three'),
  signal: AbortSignal,
): Promise<PointCloudSurface[]> {
  const position = source.getAttribute('position')
  if (!position || position.itemSize < 3) return []
  const index = source.getIndex()
  const triangleCount = Math.floor((index?.count ?? position.count) / 3)
  const surfaces: PointCloudSurface[] = []
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  const edge = new THREE.Vector3(), cross = new THREE.Vector3()
  const trianglesPerSurface = 2048
  let positions = new Float32Array(Math.min(triangleCount, trianglesPerSurface) * 9)
  let area = 0
  try {
    await runInTimeSlices(triangleCount, (triangle) => {
      const offset = triangle * 3
      a.fromBufferAttribute(position, index ? index.getX(offset) : offset).applyMatrix4(matrix)
      b.fromBufferAttribute(position, index ? index.getX(offset + 1) : offset + 1).applyMatrix4(matrix)
      c.fromBufferAttribute(position, index ? index.getX(offset + 2) : offset + 2).applyMatrix4(matrix)
      const localOffset = triangle % trianglesPerSurface * 9
      a.toArray(positions, localOffset)
      b.toArray(positions, localOffset + 3)
      c.toArray(positions, localOffset + 6)
      area += edge.subVectors(b, a).cross(cross.subVectors(c, a)).length() * .5
      if ((triangle + 1) % trianglesPerSurface === 0 || triangle + 1 === triangleCount) {
        if (area > 0) {
          const geometry = new THREE.BufferGeometry()
          geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
          surfaces.push({ geometry, area })
        }
        positions = new Float32Array(Math.min(triangleCount - triangle - 1, trianglesPerSurface) * 9)
        area = 0
      }
    }, { signal })
    return surfaces
  } catch (error) {
    surfaces.forEach((surface) => surface.geometry.dispose())
    throw error
  }
}

/**
 * Decode quantized glTF positions before applying a world transform.
 * Normalized integer attributes cannot safely receive transformed coordinates:
 * BufferAttribute.setXYZ would quantize them again and overflow once the
 * transformed coordinates leave the normalized [-1, 1] range.
 */
export function cloneWorldPositionGeometry(
  source: BufferGeometry,
  matrix: Matrix4,
  THREE: typeof import('three'),
): BufferGeometry {
  const position = source.getAttribute('position')
  const geometry = new THREE.BufferGeometry()
  if (!position || position.itemSize < 3) return geometry

  const positions = new Float32Array(position.count * 3)
  for (let index = 0; index < position.count; index += 1) {
    const offset = index * 3
    positions[offset] = position.getX(index)
    positions[offset + 1] = position.getY(index)
    positions[offset + 2] = position.getZ(index)
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const sourceIndex = source.getIndex()
  if (sourceIndex) geometry.setIndex(sourceIndex.clone())
  geometry.applyMatrix4(matrix)
  return geometry
}
