#!/usr/bin/env node
/**
 * Bundle self-check: manifest, patch, Client bundle shape, display resources.
 * Fails non-zero so it can gate a commit/install.
 */

import { readFileSync, statSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const failures = []
const checks = []

function check(name, condition, detail) {
  if (condition) checks.push(name)
  else failures.push(`${name}${detail ? `: ${detail}` : ''}`)
}

function readJson(relative) {
  return JSON.parse(readFileSync(join(root, relative), 'utf8'))
}

function readText(relative) {
  return readFileSync(join(root, relative), 'utf8')
}

const pkg = readJson('package.json')

check('package name is @gxx-labs/browser-use-dsh', pkg.name === '@gxx-labs/browser-use-dsh', pkg.name)
check('package type is module', pkg.type === 'module')
check('main points to lib/index.js', pkg.main === 'lib/index.js', pkg.main)
check('exports "." is lib/index.js', pkg.exports?.['.'] === './lib/index.js')
check('exports "./client" is client.js', pkg.exports?.['./client'] === './client.js')
check('exports "./locale/*.json"', pkg.exports?.['./locale/*.json'] === './locale/*.json')
check('exports "./icon"', pkg.exports?.['./icon'] === './icon.svg')
check('dsh.bundle.patch declared', pkg.dsh?.bundle?.patch === './cordis.patch.yml')
check('dsh.client.platform is web', pkg.dsh?.client?.platform === 'web')
check(
  'dsh.client.inject is a package-name array',
  Array.isArray(pkg.dsh?.client?.inject) && pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-sidebar-right'),
)
check('publish access public', pkg.publishConfig?.access === 'public')

const requiredFiles = [
  'lib/',
  'client.js',
  'cordis.patch.yml',
  'locale/*.json',
  'icon.svg',
  'README.md',
  'LICENSE',
  'CHANGELOG.md',
  'docs/',
]
for (const entry of requiredFiles) {
  check(`files includes ${entry}`, Array.isArray(pkg.files) && pkg.files.includes(entry))
}

const patch = readText('cordis.patch.yml')
check('patch inserts bundle row id', patch.includes('id: browser-use-dsh'))
check('patch row names this package', patch.includes("@gxx-labs/browser-use-dsh"))

const hostEntry = readText('lib/index.js')
check('host exports apply()', /export\s+function\s+apply\s*\(/u.test(hostEntry))
check('host declares inject tools', /export\s+const\s+inject\s*=\s*\[\s*'tools'\s*\]/u.test(hostEntry))

const client = readText('client.js')
check('client registers through ModuleLoader', client.includes('window.__ModuleLoader__.load'))
check('client bundle id matches package', client.includes("id: '@gxx-labs/browser-use-dsh'"))
check('client declares sidebarRight injection', client.includes("inject: ['sidebarRight']"))
check('client does not import Harness client packages', !client.includes('@deepseek-ai/'))
check('client does not call capturePage', !client.includes('capturePage'))
check('client has an apply()', client.includes('apply: function apply'))
check('client has no ESM export statements', !/^\s*export\s/mu.test(client))

for (const locale of ['en', 'zh']) {
  const data = readJson(`locale/${locale}.json`)
  check(`${locale} locale has meta.title`, typeof data.meta?.title === 'string' && data.meta.title.trim().length > 0)
  check(
    `${locale} locale has meta.description`,
    typeof data.meta?.description === 'string' && data.meta.description.trim().length > 0,
  )
}

check('icon.svg exists', existsSync(join(root, 'icon.svg')))
if (existsSync(join(root, 'icon.svg'))) {
  const size = statSync(join(root, 'icon.svg')).size
  check('icon.svg is under 256 KiB', size > 0 && size <= 256 * 1024, `${size} bytes`)
  check('icon.svg looks like SVG', readText('icon.svg').includes('<svg'))
}

check('README.md exists', existsSync(join(root, 'README.md')))
check('LICENSE exists', existsSync(join(root, 'LICENSE')))
check('client.js exists', existsSync(join(root, 'client.js')))

const report = [
  `bundle verify: ${checks.length} passed, ${failures.length} failed`,
  ...checks.map((name) => `  PASS ${name}`),
  ...failures.map((name) => `  FAIL ${name}`),
]
for (const line of report) console.log(line)
if (failures.length > 0) process.exit(1)
