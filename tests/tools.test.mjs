import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeConfig } from '../lib/config.js'
import { registerTools } from '../lib/tools.js'

function fakeCtx() {
  const definitions = new Map()
  return {
    definitions,
    tools: {
      register(definition) {
        definitions.set(definition.name, definition)
        return () => definitions.delete(definition.name)
      },
    },
  }
}

const config = normalizeConfig({ bridgePort: 0 }).config

test('registers exactly the C1 read-only tools', () => {
  const ctx = fakeCtx()
  const dispose = registerTools(ctx, {
    bridge: { status: () => ({ ready: true, online: false, clients: [] }), send: async () => ({ ok: true }) },
    config,
    logger: {},
    version: '0.1.0',
  })
  assert.deepEqual(
    [...ctx.definitions.keys()].sort(),
    ['browser_use_open', 'browser_use_read', 'browser_use_status'],
  )
  for (const definition of ctx.definitions.values()) {
    assert.equal(typeof definition.execute, 'function')
    assert.equal(definition.parameters.type, 'object')
    assert.ok(definition.output && typeof definition.output.render === 'function')
  }
  dispose()
  assert.equal(ctx.definitions.size, 0)
})

test('status reports bridge state and read-only capabilities', async () => {
  const ctx = fakeCtx()
  registerTools(ctx, {
    bridge: { status: () => ({ ready: true, online: false, clients: [] }), send: async () => ({ ok: true }) },
    config,
    logger: {},
    version: '0.1.0',
  })
  const definition = ctx.definitions.get('browser_use_status')
  const value = await definition.execute({ detail: 'summary' }, {})
  assert.equal(value.ok, true)
  assert.equal(value.supported, true)
  assert.equal(value.capabilities.read, true)
  assert.equal(value.capabilities.act, false)
  assert.equal(value.capabilities.visual, false)
  assert.equal(typeof value.hint, 'string')
})

test('open rejects non-http(s) URLs without touching the bridge', async () => {
  const ctx = fakeCtx()
  let calls = 0
  registerTools(ctx, {
    bridge: {
      status: () => ({ ready: true, online: true, clients: [] }),
      send: async () => {
        calls += 1
        return { ok: true }
      },
    },
    config,
    logger: {},
    version: '0.1.0',
  })
  const definition = ctx.definitions.get('browser_use_open')
  const value = await definition.execute({ url: 'javascript:alert(1)' }, {})
  assert.equal(value.ok, false)
  assert.equal(value.code, 'E_BAD_REQUEST')
  assert.equal(calls, 0)
})

test('read output wraps page text as untrusted content', async () => {
  const ctx = fakeCtx()
  registerTools(ctx, {
    bridge: {
      status: () => ({ ready: true, online: true, clients: [] }),
      send: async (op, args) => ({
        ok: true,
        mode: args.mode,
        url: 'https://example.com',
        title: 'Example',
        generation: 'g-1',
        text: 'hello page',
        nodes: [],
      }),
    },
    config,
    logger: {},
    version: '0.1.0',
  })
  const definition = ctx.definitions.get('browser_use_read')
  const value = await definition.execute({ mode: 'text' }, {})
  const rendered = definition.output.render({ mode: 'text' }, value)
  assert.equal(value.ok, true)
  assert.equal(rendered.length, 1)
  assert.match(rendered[0].text, /untrusted-page-content/u)
  assert.match(rendered[0].text, /hello page/u)
})
