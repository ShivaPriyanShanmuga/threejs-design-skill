#!/usr/bin/env node
/**
 * run.mjs [--suite trigger|routing] [--cases cases.json]
 *
 * Drives the trigger and routing suites through the Claude Code CLI. Each case is a fresh
 * headless session, so the skill has to be discovered from its own frontmatter — which is
 * the thing under test.
 *
 * Requires the `claude` CLI on PATH and the skill installed (see the repo README).
 * If the CLI is missing this exits 2 and tells you, rather than pretending to pass.
 */

import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const flag = (n, d) => {
  const i = argv.indexOf(`--${n}`)
  return i === -1 ? d : argv[i + 1]
}
const suiteName = flag('suite', 'trigger')
const cases = JSON.parse(await readFile(join(here, flag('cases', 'cases.json')), 'utf8'))

const have = await new Promise((res) => {
  const p = spawn('claude', ['--version'], { shell: true })
  p.on('error', () => res(false))
  p.on('close', (c) => res(c === 0))
})
if (!have) {
  console.error(
    'The `claude` CLI is not on PATH, so these suites cannot run here.\n' +
      'Install Claude Code, put the skill in ~/.claude/skills/, then re-run.\n' +
      'The `output` suite does not need the CLI — use score-output.mjs for that.',
  )
  process.exit(2)
}

const ask = (prompt) =>
  new Promise((res) => {
    // --verbose + stream-json is what exposes which skill fired and which files it read.
    const p = spawn('claude', ['-p', prompt, '--output-format', 'json', '--verbose'], {
      shell: true,
      maxBuffer: 1 << 26,
    })
    let out = ''
    p.stdout.on('data', (d) => (out += d))
    p.on('close', () => res(out))
  })

const suite = cases[suiteName]
if (!suite) {
  console.error(`no suite "${suiteName}" in cases.json`)
  process.exit(2)
}

let pass = 0
for (const c of suite) {
  const raw = await ask(c.prompt)
  const fired = /threejs-design/i.test(raw)
  const loaded = (name) => new RegExp(`references[\\\\/]${name.replace('.', '\\.')}`, 'i').test(raw)

  let ok
  let detail
  if (suiteName === 'trigger') {
    ok = c.expect === 'activate' ? fired : !fired
    detail = fired ? 'fired' : 'did not fire'
  } else {
    const missing = (c.expectLoaded ?? []).filter((f) => !loaded(f))
    const leaked = (c.expectNotLoaded ?? []).filter((f) => loaded(f))
    ok = fired && missing.length === 0 && leaked.length === 0
    detail = [
      !fired && 'skill did not fire',
      missing.length && `missing: ${missing.join(',')}`,
      leaked.length && `loaded unnecessarily: ${leaked.join(',')}`,
    ]
      .filter(Boolean)
      .join('; ') || 'routed correctly'
  }

  if (ok) pass++
  console.log(`${ok ? '  ok' : 'FAIL'}  ${c.id.padEnd(28)} ${detail}`)
}

console.log(`\n${pass}/${suite.length} passed in "${suiteName}"`)
process.exit(pass === suite.length ? 0 : 1)
