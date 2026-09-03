import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

export const KEY = 1.0 // footprint at the base
export const KEY_H = 0.46 // cap height
export const TAPER = 0.8 // top face as a fraction of the base
export const PITCH = 1.12 // centre-to-centre spacing

/**
 * A keycap: a rounded box narrowed toward the top.
 *
 * RoundedBoxGeometry cannot taper, so the vertices are scaled in x/z by their height —
 * that single pass is the difference between a rounded die and something that reads as a
 * key. Normals have to be recomputed afterwards, since moving vertices invalidates them.
 *
 * The origin is moved to the base so a press is just a translation on y.
 */
export function makeKeycapGeometry() {
  const geo = new RoundedBoxGeometry(KEY, KEY_H, KEY, 4, 0.062)
  const pos = geo.attributes.position
  const half = KEY_H / 2
  const v = new THREE.Vector3()

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const t = (v.y + half) / KEY_H // 0 at the base, 1 at the top
    const s = THREE.MathUtils.lerp(1, TAPER, t)
    pos.setXYZ(i, v.x * s, v.y, v.z * s)
  }

  pos.needsUpdate = true
  geo.computeVertexNormals()
  geo.translate(0, half, 0)
  return geo
}

/** Grid position of key `i` in board-local space. */
export function keyPosition(i, grid) {
  const col = i % grid
  const row = Math.floor(i / grid)
  const c = (grid - 1) / 2
  return [(col - c) * PITCH, 0, (row - c) * PITCH]
}
