#!/usr/bin/env node
/** Run the Node test suite (node:test) for this bundle. */

import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const testsDir = join(root, 'tests')
let files
try {
  files = readdirSync(testsDir)
    .filter((name) => name.endsWith('.test.mjs'))
    .sort()
    .map((name) => join(testsDir, name))
} catch (error) {
  console.error(`cannot read tests directory: ${error.message}`)
  process.exit(1)
}
if (files.length === 0) {
  console.error('no tests found')
  process.exit(1)
}
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' })
process.exit(result.status === null ? 1 : result.status)
