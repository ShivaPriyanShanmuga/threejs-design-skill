import * as THREE from 'three'

/**
 * Draws a kabuto into a canvas and returns it as a texture.
 *
 * This is a deliberate retreat from geometry. Five drafts of a full samurai built from
 * primitives — and then five more as a hand-coded silhouette — all read as a mascot:
 * anatomy is where a procedural figure falls apart, and small holes near a face turn
 * anything comic. Reducing to the single most recognisable object removes every one of
 * those failure modes and gains authority instead of losing it.
 *
 * The rule worth keeping: reduce to the form you can execute perfectly, then execute it
 * perfectly. A confident simple mark beats an ambitious bad one every time.
 */

const W = 1200
const H = 1000

export function drawKabuto(g) {
  g.clearRect(0, 0, W, H)
  g.fillStyle = '#ffffff'
  g.strokeStyle = '#ffffff'
  g.lineJoin = 'round'
  g.lineCap = 'round'

  const CX = 600

  // Bowl and shikoro as one arch, with the face left as background. evenodd punches the
  // void, and the void is what makes it a helmet rather than a lump.
  g.beginPath()
  g.moveTo(232, 812)
  g.lineTo(282, 590)
  g.bezierCurveTo(300, 402, 428, 296, CX, 296)
  g.bezierCurveTo(772, 296, 900, 402, 918, 590)
  g.lineTo(968, 812)
  g.lineTo(232, 812)
  g.closePath()
  // Wide and shallow. Tall and narrow reads as a horseshoe.
  g.moveTo(452, 812)
  g.lineTo(462, 640)
  g.bezierCurveTo(470, 546, 520, 498, CX, 498)
  g.bezierCurveTo(680, 498, 730, 546, 738, 640)
  g.lineTo(748, 812)
  g.lineTo(452, 812)
  g.closePath()
  g.fill('evenodd')

  // Lamellar steps: notches of background, or the shikoro is a plain band.
  g.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < 3; i++) {
    const y = 636 + i * 60
    g.fillRect(232, y, 226, 10)
    g.fillRect(742, y, 226, 10)
  }
  g.globalCompositeOperation = 'source-over'

  // fukigaeshi, rooted into the shikoro rather than floating beside it
  const wing = (s) => {
    g.beginPath()
    g.moveTo(CX + s * 296, 566)
    g.lineTo(CX + s * 446, 470)
    g.lineTo(CX + s * 470, 596)
    g.lineTo(CX + s * 330, 664)
    g.closePath()
    g.fill()
  }
  wing(1)
  wing(-1)

  // mempo, filling the lower void so the eyes stay a band of shadow
  g.beginPath()
  g.moveTo(462, 688)
  g.lineTo(738, 688)
  g.lineTo(716, 790)
  g.bezierCurveTo(668, 830, 532, 830, 484, 790)
  g.closePath()
  g.fill()

  // kuwagata: the horns carry the identity, so they get the weight
  g.lineWidth = 42
  g.beginPath()
  g.moveTo(CX - 62, 340)
  g.bezierCurveTo(CX - 190, 250, CX - 250, 158, CX - 268, 74)
  g.stroke()
  g.beginPath()
  g.moveTo(CX + 62, 340)
  g.bezierCurveTo(CX + 190, 250, CX + 250, 158, CX + 268, 74)
  g.stroke()

  // maedate
  g.beginPath()
  g.moveTo(CX, 208)
  g.lineTo(CX + 52, 330)
  g.lineTo(CX, 372)
  g.lineTo(CX - 52, 330)
  g.closePath()
  g.fill()
}

export function makeKabutoTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  drawKabuto(canvas.getContext('2d'))

  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  // The shader samples neighbours to build an edge; clamping stops those taps wrapping
  // round and lighting the opposite side of the mark.
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
  t.needsUpdate = true
  return { texture: t, aspect: W / H }
}
