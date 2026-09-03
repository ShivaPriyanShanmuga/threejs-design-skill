import * as THREE from 'three'
import { GRID, TECH } from './tech'

const CELL = 256

/**
 * Draws all 25 logos into one 1280x1280 canvas texture.
 *
 * The alternative — one texture per keycap — would mean 25 materials and 25 draw calls for
 * what is one geometry repeated. With an atlas, every decal shares a single material and the
 * whole set instances into one call; each instance just carries the UV offset of its cell.
 */
export function buildLogoAtlas() {
  const size = CELL * GRID
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')

  TECH.forEach((tech, i) => {
    const col = i % GRID
    const row = Math.floor(i / GRID)
    const x = col * CELL
    const y = row * CELL

    ctx.save()
    ctx.translate(x, y)

    // simple-icons paths are authored against a 24x24 viewBox. Inset a little so the
    // logo does not run to the edge of the cell (and so the mip chain has room).
    const inset = CELL * 0.1
    const scale = (CELL - inset * 2) / 24
    ctx.translate(inset, inset)
    ctx.scale(scale, scale)

    ctx.fillStyle = tech.ink
    ctx.fill(new Path2D(tech.path))
    ctx.restore()
  })

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace // it is colour, not data
  texture.anisotropy = 8
  texture.needsUpdate = true
  return texture
}

/** UV offset of cell `i`, accounting for the default flipY on textures. */
export function atlasOffset(i) {
  const col = i % GRID
  const row = Math.floor(i / GRID)
  return [col / GRID, 1 - (row + 1) / GRID]
}

export const ATLAS_CELL = 1 / GRID

/** A soft radial sprite used as the glow behind a hovered key. */
export function buildGlowTexture() {
  const s = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = s
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  g.addColorStop(0.0, 'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.42)')
  g.addColorStop(1.0, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}
