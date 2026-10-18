#!/usr/bin/env node
/**
 * Validate the published tarball file list without publishing.
 * Runs `npm pack --dry-run --json` and asserts the required artifacts and the
 * absence of dev-only paths.
 */

import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const win = process.platform === 'win32'
const command = win ? process.env.ComSpec || 'cmd.exe' : 'npm'
const args = win ? ['/d', '/s', '/c', 'npm pack --dry-run --json'] : ['pack', '--dry-run', '--json']
const result = spawnSync(command, args, {
  cwd: root,
  encoding: 'utf8',
  timeout: 120000,
})
if (result.status !== 0) {
  console.error('npm pack --dry-run failed')
  console.error(result.stdout || '')
  console.error(result.stderr || '')
  process.exit(1)
}
const text = String(result.stdout || '')
const start = text.indexOf('[')
const end = text.lastIndexOf(']')
if (start === -1 || end === -1 || end <= start) {
  console.error('cannot parse npm pack JSON output')
  process.exit(1)
}
let packed
try {
  packed = JSON.parse(text.slice(start, end + 1))[0]
} catch (error) {
  console.error(`cannot parse npm pack JSON: ${error.message}`)
  process.exit(1)
}
const files = (packed.files || []).map((entry) => entry.path)
const required = [
  'package.json',
  'lib/index.js',
  'client.js',
  'cordis.patch.yml',
  'locale/en.json',
  'locale/zh.json',
  'icon.svg',
  'README.md',
  'LICENSE',
  'CHANGELOG.md',
  'docs/compatibility.md',
]
const forbidden = files.filter(
  (name) =>
    name === 'node_modules' ||
    name.startsWith('node_modules/') ||
    name.startsWith('tests/') ||
    name.startsWith('scripts/') ||
    name.startsWith('.git') ||
    name.endsWith('.tgz'),
)
const failures = []
for (const name of required) {
  if (!files.includes(name)) failures.push(`missing packed file: ${name}`)
}
for (const name of forbidden) failures.push(`dev-only file packed: ${name}`)
console.log(`pack check: ${packed.filename || '(dry-run)'}`)
console.log(`  files: ${files.length}`)
console.log(`  size: ${packed.size || 0} bytes (unpacked ${packed.unpackedSize || 0})`)
if (failures.length > 0) {
  for (const failure of failures) console.log(`  FAIL ${failure}`)
  process.exit(1)
}
console.log('  PASS required files present, dev-only files excluded')
