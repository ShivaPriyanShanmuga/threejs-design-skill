#!/usr/bin/env node
/**
 * audit.mjs <url> [--wait ms] [--out shot.png] [--dist dir] [--size WxH]
 *
 * Renders a running Three.js page and reports the things that are easy to assert and
 * easy to forget. It is not a substitute for looking at the screenshot — a scene can
 * pass every number here and still be ugly — but it catches the class of defect that is
 * invisible in source and tedious to eyeball:
 *
 *   - deprecation warnings from Three itself (this is how r185 told us that Clock and
 *     PCFSoftShadowMap had been retired, while the skill was still recommending them)
 *   - draw calls per frame, counted by patching the GL context, so it works on any page
 *     without the page cooperating
 *   - exposure and saturation statistics, which catch "washed out", "too dark", and the
 *     over-lit pastel failure that reads as a colour problem rather than a light problem
 *   - shipped JS weight, where one namespace import can quietly cost megabytes
 *
 * Requires: npm i -D playwright pngjs   (and `npx playwright install chromium`)
 */

import { existsSync, readdirSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const argv = process.argv.slice(2)
const url = argv.find((a) => !a.startsWith('--'))
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? dflt : argv[i + 1]
}

if (!url) {
  console.error('usage: audit.mjs <url> [--wait ms] [--out shot.png] [--dist dir] [--size WxH]')
  process.exit(2)
}

let chromium, PNG
try {
  ;({ chromium } = await import('playwright'))
  ;({ PNG } = await import('pngjs'))
} catch {
  console.error('missing deps. run: npm i -D playwright pngjs && npx playwright install chromium')
  process.exit(2)
}

const wait = Number(flag('wait', 8000))
const out = flag('out', null)
const dist = flag('dist', null)
const [W, H] = flag('size', '1440x900').split('x').map(Number)

// ---------------------------------------------------------------- browser

const browser = await chromium.launch({
  // Software rendering, so this behaves the same on a machine with no GPU (CI included).
  // It is slow: expect single-digit fps, and read the fps number as "it ran", not as a
  // performance measurement.
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })

const warnings = []
const errors = []
page.on('console', (m) => {
  const t = m.text()
  if (/GPU stall|DevTools|\[vite\]|React DevTools/.test(t)) return
  if (m.type() === 'error') errors.push(t)
  else if (m.type() === 'warning') warnings.push(t)
})
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

// Count real GL draw calls per animation frame by patching the context prototypes. This
// needs no cooperation from the page, and unlike renderer.info it is not reset per pass,
// so post-processing is included automatically.
await page.addInitScript(() => {
  window.__audit = { calls: 0, frames: 0, peak: 0, t0: 0, samples: [] }
  const patch = (proto) => {
    if (!proto) return
    for (const fn of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      const orig = proto[fn]
      if (!orig) continue
      proto[fn] = function (...args) {
        window.__audit.calls++
        return orig.apply(this, args)
      }
    }
  }
  patch(window.WebGL2RenderingContext && WebGL2RenderingContext.prototype)
  patch(window.WebGLRenderingContext && WebGLRenderingContext.prototype)

  // Registered before the app's own loop, so each tick closes the previous frame.
  // Samples are kept and reported as a median: a single frame is a poor sample, and
  // startup frames (shader compiles, first passes) are not representative.
  const tick = () => {
    const a = window.__audit
    if (a.t0 === 0) a.t0 = performance.now()
    if (a.calls > a.peak) a.peak = a.calls
    if (a.calls > 0) {
      a.samples.push(a.calls)
      if (a.samples.length > 60) a.samples.shift()
    }
    a.calls = 0
    a.frames++
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})

await page.goto(url, { waitUntil: 'domcontentloaded' })
// A dev server can hot-reload mid-audit and destroy the execution context; that is a
// timing artifact, not a finding.
try {
  await page.evaluate(() => document.fonts?.ready)
} catch {
  await page.waitForTimeout(1500)
}
await page.waitForTimeout(wait)

const runtime = await page.evaluate(() => {
  const a = window.__audit
  const secs = (performance.now() - a.t0) / 1000
  const canvas = document.querySelector('canvas')
  const gl = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'))
  const sorted = [...a.samples].sort((x, y) => x - y)
  return {
    hasCanvas: !!canvas,
    // GL-level, so it needs no cooperation from the page and cannot be fooled by
    // `renderer.info` resetting per pass. On a scene with a full post chain this agreed
    // exactly with a careful `info.render` reading, so treat a large gap between the two
    // as a sign you measured `info.render` wrong rather than as new information.
    // The peak is usually a startup frame — shader compiles, PMREM — not steady state.
    drawCallsMedian: sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0,
    drawCallsPeak: a.peak,
    framesSampled: sorted.length,
    fps: +(a.frames / Math.max(secs, 0.001)).toFixed(1),
    contextLost: gl ? gl.isContextLost() : null,
  }
})

const buf = await page.screenshot({ path: out ?? undefined, timeout: 120000 })
await browser.close()

// ---------------------------------------------------------------- image stats

const png = PNG.sync.read(buf)
let lumSum = 0
let satSum = 0
let clipped = 0
let crushed = 0
const n = png.width * png.height
for (let i = 0; i < png.data.length; i += 4) {
  const r = png.data[i] / 255
  const g = png.data[i + 1] / 255
  const b = png.data[i + 2] / 255
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  lumSum += l
  satSum += max === 0 ? 0 : (max - min) / max // HSV saturation
  if (min > 0.98) clipped++
  if (max < 0.02) crushed++
}
const image = {
  meanLuminance: +(lumSum / n).toFixed(4),
  meanSaturation: +(satSum / n).toFixed(4),
  clippedWhitePct: +((100 * clipped) / n).toFixed(2),
  pureBlackPct: +((100 * crushed) / n).toFixed(2),
}

// ---------------------------------------------------------------- bundle

let bundle = null
if (dist) {
  const walk = (d) =>
    readdirSync(d).flatMap((f) => {
      const p = join(d, f)
      return statSync(p).isDirectory() ? walk(p) : [p]
    })
  if (existsSync(dist)) {
    const js = walk(dist).filter((f) => f.endsWith('.js'))
    let raw = 0
    let gz = 0
    for (const f of js) {
      const b = await readFile(f)
      raw += b.length
      gz += gzipSync(b).length
    }
    bundle = { files: js.length, rawKB: Math.round(raw / 1024), gzipKB: Math.round(gz / 1024) }
  }
}

// ---------------------------------------------------------------- report

const threeWarnings = warnings.filter((w) => /THREE\./.test(w))
const findings = []

if (errors.length) findings.push(`${errors.length} page error(s) — the scene is broken`)
if (threeWarnings.length) findings.push(`${threeWarnings.length} Three.js warning(s) — likely a deprecation`)
if (!runtime.hasCanvas) findings.push('no <canvas> on the page')
if (runtime.contextLost) findings.push('WebGL context is lost')
if (image.meanLuminance > 0.62) findings.push('very bright overall — check tone mapping is on, and light intensities')
if (image.clippedWhitePct > 8) findings.push(`${image.clippedWhitePct}% of pixels are clipped white — NoToneMapping, or over-lit`)
if (image.pureBlackPct > 88) findings.push('almost the whole frame is black — is anything actually lit?')
if (runtime.drawCallsMedian > 300) findings.push(`${runtime.drawCallsMedian} draw calls per frame — look at instancing and merging`)
if (runtime.framesSampled === 0) findings.push('no frames drew — the loop may not be running')
if (bundle && bundle.gzipKB > 900) findings.push(`${bundle.gzipKB} KB gzipped JS — check for a namespace import defeating tree-shaking`)

console.log(JSON.stringify({ url, runtime, image, bundle }, null, 2))
console.log('\n--- three.js warnings ---')
console.log(threeWarnings.length ? threeWarnings.join('\n') : '(none)')
if (errors.length) {
  console.log('\n--- errors ---')
  console.log(errors.join('\n'))
}
console.log('\n--- findings ---')
console.log(findings.length ? findings.map((f) => '! ' + f).join('\n') : 'nothing flagged')
console.log(
  '\nNumbers are a floor, not a verdict. Open the screenshot and look at it before calling this done.',
)

process.exit(errors.length ? 1 : 0)
