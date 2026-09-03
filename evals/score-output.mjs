#!/usr/bin/env node
/**
 * score-output.mjs <file.js> [file2.js ...]
 *
 * Scores generated Three.js code against the defaults SKILL.md claims decide the look.
 * This is the `output` suite in cases.json, and it is what makes an A/B possible: run the
 * same prompt with and without the skill, score both, compare.
 *
 * These are regex heuristics over source, not a type checker. They can be fooled, and a
 * file can score 10/10 and still look bad — the checks assert that the decisions were
 * *made*, not that they were made well. Read the code and render it too.
 */

import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'

const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ')

const CHECKS = [
  {
    id: 'fov',
    label: 'camera fov <= 50 (not the default 75)',
    run(src) {
      const vals = []
      for (const m of src.matchAll(/PerspectiveCamera\s*\(\s*([\d.]+)/g)) vals.push(+m[1])
      for (const m of src.matchAll(/\bfov\s*[:=]\s*([\d.]+)/g)) vals.push(+m[1])
      if (!vals.length) return [false, 'no fov found']
      const min = Math.min(...vals)
      return [min <= 50, `fov ${vals.join(', ')}`]
    },
  },
  {
    id: 'environment',
    label: 'scene.environment set (env map, not just lights)',
    run(src) {
      const has =
        /scene\.environment\s*=/.test(src) ||
        /RoomEnvironment|PMREMGenerator|RGBELoader|fromScene\s*\(|<Environment\b/.test(src)
      return [has, has ? 'env map present' : 'lights only — this is the flat-scene bug']
    },
  },
  {
    id: 'dpr',
    label: 'device pixel ratio capped',
    run(src) {
      const has =
        /setPixelRatio\s*\(\s*Math\.min/.test(src) ||
        /dpr\s*[:=]\s*\[\s*1\s*,\s*2\s*\]/.test(src) ||
        /Math\.min\s*\(\s*window\.devicePixelRatio\s*,\s*2/.test(src)
      const uncapped = /setPixelRatio\s*\(\s*window\.devicePixelRatio\s*\)/.test(src)
      return [has && !uncapped, uncapped ? 'uncapped setPixelRatio' : has ? 'capped' : 'not set']
    },
  },
  {
    id: 'tonemapping',
    label: 'tone mapping enabled (ACES / AgX / Neutral)',
    run(src) {
      const m = src.match(/toneMapping\s*[:=]\s*(?:THREE\.)?(\w+)/)
      if (!m) return [false, 'not set']
      return [/ACESFilmic|AgX|Neutral|Cineon/.test(m[1]), m[1]]
    },
  },
  {
    id: 'delta',
    label: 'animation driven by delta, not a fixed increment',
    run(src) {
      const usesDelta = /getDelta\s*\(|\bdelta\b|\bdt\b/.test(src)
      // a rotation advanced by a bare literal is the tell
      const fixed = /rotation\.[xyz]\s*\+=\s*0?\.\d+\s*;?\s*$/m.test(src)
      return [usesDelta && !fixed, fixed ? 'fixed per-frame increment found' : usesDelta ? 'delta-driven' : 'no delta']
    },
  },
  {
    id: 'damping',
    label: 'easing is frame-rate independent (damp / 1 - exp)',
    run(src) {
      const good = /MathUtils\.damp|damp3|dampE|1\s*-\s*Math\.exp\s*\(|Math\.exp\s*\(\s*-/.test(src)
      const bareLerp = /\.lerp\w*\s*\([^)]*,\s*0?\.\d+\s*\)/.test(src)
      if (good) return [true, 'exponential damping']
      if (bareLerp) return [false, 'bare lerp with a constant factor — 2x fast at 120Hz']
      return [null, 'no easing present']
    },
  },
  {
    id: 'colorspace',
    label: 'no data map mistagged as sRGB',
    run(src) {
      const bad = src.match(
        /(roughness|metalness|normal|ao|displacement|bump)Map\s*\.\s*colorSpace\s*=\s*(?:THREE\.)?SRGBColorSpace/i,
      )
      const anyTexture = /TextureLoader|\.load\s*\(|useTexture/.test(src)
      if (!anyTexture) return [null, 'no textures loaded']
      return [!bad, bad ? `mistagged: ${bad[1]}Map` : 'tagging looks right']
    },
  },
  {
    id: 'shadowfrustum',
    label: 'shadow frustum tightened (if shadows are on)',
    run(src) {
      if (!/castShadow|shadowMap\.enabled|<Canvas[^>]*\bshadows\b/.test(src)) return [null, 'no shadows']
      const tight = /shadow\.camera\.(left|right|top|bottom)|shadow-camera-(left|right|top|bottom)/.test(src)
      return [tight, tight ? 'frustum set' : 'default 10-unit box — blocky shadows']
    },
  },
  {
    id: 'timer',
    label: 'Timer, or a clamped Clock delta',
    run(src) {
      if (/THREE\.Timer|new Timer\s*\(/.test(src)) return [true, 'Timer']
      if (/Math\.min\s*\(\s*[\w.]*(?:getDelta\s*\(\s*\)|delta)/.test(src)) return [true, 'clamped delta']
      if (/getDelta\s*\(/.test(src)) return [false, 'unclamped Clock — a tab switch jumps the scene']
      if (/useFrame/.test(src)) return [null, 'R3F supplies the delta']
      return [null, 'no clock']
    },
  },
  {
    id: 'roughness',
    label: 'metal roughness above 0 (0 reads as untextured chrome)',
    run(src) {
      const vals = [...src.matchAll(/roughness\s*[:=]\s*([\d.]+)/g)].map((m) => +m[1])
      if (!vals.length) return [null, 'no roughness set']
      const zeroish = vals.filter((v) => v <= 0.02)
      return [zeroish.length === 0, `roughness ${vals.join(', ')}`]
    },
  },
]

const files = process.argv.slice(2)
if (!files.length) {
  console.error('usage: score-output.mjs <file.js> [file2.js ...]')
  process.exit(2)
}

const rows = []
for (const f of files) {
  const src = strip(await readFile(f, 'utf8'))
  const results = CHECKS.map((c) => {
    const [pass, note] = c.run(src)
    return { id: c.id, label: c.label, pass, note }
  })
  const applicable = results.filter((r) => r.pass !== null)
  const passed = applicable.filter((r) => r.pass).length
  rows.push({ file: basename(f), path: f, results, passed, of: applicable.length })
}

for (const r of rows) {
  console.log(`\n=== ${r.file} — ${r.passed}/${r.of} ===`)
  for (const c of r.results) {
    const mark = c.pass === null ? ' n/a' : c.pass ? '  ok' : 'FAIL'
    console.log(`${mark}  ${c.label.padEnd(52)} ${c.note}`)
  }
}

if (rows.length > 1) {
  console.log('\n=== comparison ===')
  for (const c of CHECKS) {
    const cells = rows.map((r) => {
      const x = r.results.find((y) => y.id === c.id)
      return x.pass === null ? '-' : x.pass ? 'Y' : 'N'
    })
    console.log(`${cells.join('  ')}   ${c.label}`)
  }
  console.log(`${rows.map((r) => r.passed).join('  ')}   TOTAL (of applicable)`)
  console.log(`\ncolumns: ${rows.map((r) => r.file).join(', ')}`)
}
