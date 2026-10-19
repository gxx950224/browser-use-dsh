import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeConfig } from '../lib/config.js'
import { BrowserUseError } from '../lib/errors.js'
import { registerTools } from '../lib/tools.js'

const config = normalizeConfig({ bridgePort: 0 }).config

function fakeCtx(options = {}) {
  const definitions = new Map()
  return {
    definitions,
    approval: options.approval,
    attachments: options.attachments,
    get(name) {
      if (name === 'approval') return options.approval
      if (name === 'attachments') return options.attachments
      return undefined
    },
    tools: {
      register(definition) {
        definitions.set(definition.name, definition)
        return () => definitions.delete(definition.name)
      },
    },
  }
}

function fakeCdp(overrides = {}) {
  return {
    probeCdp: async () => ({ available: true, port: 9222, targets: [{ type: 'webview', url: 'https://example.com/' }] }),
    captureScreenshot: async () => ({
      ok: true,
      data: new Uint8Array([137, 80, 78, 71]),
      bytes: 4,
      mediaType: 'image/png',
      target: { url: 'https://example.com/', title: 'Example' },
    }),
    ...overrides,
  }
}

function fakeBridge(overrides = {}) {
  const calls = []
  const replies = {
    status: { ok: true, webviewCount: 1, webview: { url: 'https://example.com/', title: 'Example' } },
    open: { ok: true, url: 'https://example.com/', title: 'Example', generation: 'g-1', reused: false },
    resolve: { ok: true, url: 'https://example.com/', title: 'Example', target: { ref: 'e1', tag: 'a', role: 'link', name: 'Learn more' } },
    act: { ok: true, action: 'click', url: 'https://example.com/', title: 'Example', generation: 'g-1' },
    find: { ok: true, count: 1, matches: [{ tag: 'input', role: 'textbox', name: '开发人员' }] },
    extract: { ok: true, kind: 'table', count: 1, headers: ['开发人员'], rows: [['郭晓曦']] },
    verify: { ok: true, passed: true, checks: [{ name: 'title', expected: 'Example', actual: 'Example', pass: true }] },
    openPanel: { ok: true },
    uiState: { ok: true },
    ...overrides,
  }
  return {
    calls,
    status() {
      return { ready: true, online: true, clients: [], queue: 0, pending: 0 }
    },
    async send(op, args) {
      calls.push({ op, args })
      return replies[op]
    },
  }
}

function setup(options = {}) {
  const ctx = fakeCtx(options)
  const bridge = fakeBridge(options.bridgeOverrides)
  const dispose = registerTools(ctx, {
    bridge,
    config: normalizeConfig(options.config).config,
    logger: {},
    version: '0.3.0',
    cdp: options.cdp || fakeCdp(options.cdpOverrides),
  })
  return { ctx, bridge, dispose }
}

test('registers the C4 tool set', () => {
  const { ctx, dispose } = setup()
  assert.deepEqual([...ctx.definitions.keys()].sort(), [
    'browser_use_act',
    'browser_use_extract',
    'browser_use_find',
    'browser_use_open',
    'browser_use_panel',
    'browser_use_read',
    'browser_use_screenshot',
    'browser_use_status',
    'browser_use_verify',
  ])
  dispose()
  assert.equal(ctx.definitions.size, 0)
})

test('find requires a query and dispatches to the Client', async () => {
  const { ctx, bridge } = setup()
  const missing = await ctx.definitions.get('browser_use_find').execute({}, {})
  assert.equal(missing.ok, false)
  assert.equal(missing.code, 'E_BAD_REQUEST')

  const value = await ctx.definitions
    .get('browser_use_find')
    .execute({ query: '开发人员', limit: 5 }, {})
  assert.equal(value.ok, true)
  assert.deepEqual(
    bridge.calls.filter((call) => call.op === 'find').map((call) => call.args),
    [{ query: '开发人员', limit: 5 }],
  )
})

test('extract requires a selector and dispatches to the Client', async () => {
  const { ctx, bridge } = setup()
  const missing = await ctx.definitions.get('browser_use_extract').execute({}, {})
  assert.equal(missing.ok, false)
  assert.equal(missing.code, 'E_BAD_REQUEST')

  const value = await ctx.definitions
    .get('browser_use_extract')
    .execute({ selector: '.el-table__body', kind: 'table', limit: 20 }, {})
  assert.equal(value.ok, true)
  assert.equal(value.kind, 'table')
  assert.deepEqual(
    bridge.calls.filter((call) => call.op === 'extract').map((call) => call.args),
    [{ selector: '.el-table__body', kind: 'table', limit: 20, maxChars: 8000 }],
  )
})

test('status advertises act/verify/screenshot/visual capabilities', async () => {
  const { ctx } = setup()
  const value = await ctx.definitions.get('browser_use_status').execute({ detail: 'summary' }, {})
  assert.equal(value.ok, true)
  assert.equal(value.capabilities.read, true)
  assert.equal(value.capabilities.act, true)
  assert.equal(value.capabilities.verify, true)
  assert.equal(value.capabilities.screenshot, true)
  assert.equal(value.capabilities.visual, true)
  assert.equal(value.capabilities.panel, true)
  assert.equal(value.capabilities.approval.sensitiveActions, 'sensitive')
  assert.equal(value.capabilities.approval.newOrigins, 'ask')
  assert.equal(value.capabilities.annotationSendMode, 'insert')
  assert.equal(typeof value.official, 'object')
  assert.equal(typeof value.compat, 'object')
  assert.equal(value.compat.protocol, 1)
})

test('setText always asks approval and fails closed when rejected', async () => {
  let asked = 0
  const { ctx, bridge } = setup({
    approval: {
      async request() {
        asked += 1
        return 'rejected'
      },
    },
    bridgeOverrides: {
      resolve: {
        ok: true,
        url: 'https://example.com/',
        target: { tag: 'h2', role: 'heading', name: '标题' },
      },
    },
  })
  const value = await ctx.definitions.get('browser_use_act').execute(
    { action: 'setText', target: { selector: 'h2' }, value: '666' },
    {},
  )
  assert.equal(value.ok, false)
  assert.equal(value.code, 'E_APPROVAL_DENIED')
  assert.equal(asked, 1)
  assert.deepEqual(
    bridge.calls.filter((call) => call.op !== 'uiState').map((call) => call.op),
    ['resolve'],
  )
})

test('act requires expectedGeneration when a ref is used', async () => {
  const { ctx, bridge } = setup()
  const value = await ctx.definitions
    .get('browser_use_act')
    .execute({ action: 'click', target: { ref: 'e1' } }, {})
  assert.equal(value.ok, false)
  assert.equal(value.code, 'E_BAD_REQUEST')
  assert.equal(bridge.calls.length, 0)
})

test('non-sensitive click runs without approval', async () => {
  const { ctx, bridge } = setup()
  const value = await ctx.definitions.get('browser_use_act').execute(
    { action: 'click', target: { ref: 'e1' }, expectedGeneration: 'g-1' },
    {},
  )
  assert.equal(value.ok, true)
  assert.equal(value.approval, undefined)
  assert.deepEqual(
    bridge.calls.map((call) => call.op),
    ['resolve', 'act'],
  )
})

test('sensitive click asks approval and stops when rejected', async () => {
  let asked = 0
  const { ctx, bridge } = setup({
    approval: {
      async request(request) {
        asked += 1
        assert.match(request.displayReason, /敏感操作/u)
        return 'rejected'
      },
    },
    bridgeOverrides: {
      resolve: {
        ok: true,
        url: 'https://example.com/',
        target: { ref: 'e9', tag: 'button', role: 'button', name: '提交订单' },
      },
    },
  })
  const value = await ctx.definitions.get('browser_use_act').execute(
    { action: 'click', target: { ref: 'e9' }, expectedGeneration: 'g-1' },
    {},
  )
  assert.equal(value.ok, false)
  assert.equal(value.code, 'E_APPROVAL_DENIED')
  assert.equal(asked, 1)
  assert.deepEqual(
    bridge.calls.filter((call) => call.op !== 'uiState').map((call) => call.op),
    ['resolve'],
    'act must not run after a rejected approval',
  )
})

test('sensitive click proceeds after approval and reports it', async () => {
  const { ctx, bridge } = setup({
    approval: {
      async request() {
        return 'allowed-once'
      },
    },
    bridgeOverrides: {
      resolve: {
        ok: true,
        url: 'https://example.com/',
        target: { ref: 'e9', tag: 'button', role: 'button', name: '提交订单' },
      },
    },
  })
  const value = await ctx.definitions.get('browser_use_act').execute(
    { action: 'click', target: { ref: 'e9' }, expectedGeneration: 'g-1' },
    {},
  )
  assert.equal(value.ok, true)
  assert.equal(value.approval.required, true)
  assert.equal(value.approval.outcome, 'allowed-once')
  assert.deepEqual(
    bridge.calls.filter((call) => call.op !== 'uiState').map((call) => call.op),
    ['resolve', 'act'],
  )
})

test('open asks for a new origin and fails closed without approval', async () => {
  const denied = setup({
    approval: {
      async request() {
        return 'rejected'
      },
    },
  })
  const deniedValue = await denied.ctx.definitions
    .get('browser_use_open')
    .execute({ url: 'https://example.com/' }, {})
  assert.equal(deniedValue.ok, false)
  assert.equal(deniedValue.code, 'E_APPROVAL_DENIED')

  const noService = setup()
  const noServiceValue = await noService.ctx.definitions
    .get('browser_use_open')
    .execute({ url: 'https://example.com/' }, {})
  assert.equal(noServiceValue.ok, false)
  assert.equal(noServiceValue.code, 'E_APPROVAL_UNAVAILABLE')
})

test('open proceeds after origin approval and remembers it per session', async () => {
  let asked = 0
  const { ctx, bridge } = setup({
    approval: {
      async request() {
        asked += 1
        return 'allowed-once'
      },
    },
  })
  const exec = { agent: { id: 'session-1' } }
  const first = await ctx.definitions.get('browser_use_open').execute({ url: 'https://example.com/' }, exec)
  assert.equal(first.ok, true)
  const second = await ctx.definitions.get('browser_use_open').execute({ url: 'https://example.com/' }, exec)
  assert.equal(second.ok, true)
  assert.equal(asked, 1, 'the same session should not be asked twice for the same origin')
  assert.deepEqual(
    bridge.calls.filter((call) => call.op === 'open').length,
    2,
  )
})

test('open skips origin approval for a trusted origin without an approval service', async () => {
  const { ctx, bridge } = setup({ config: { trustedOrigins: ['https://example.com'] } })
  const value = await ctx.definitions.get('browser_use_open').execute({ url: 'https://example.com/' }, {})
  assert.equal(value.ok, true)
  assert.equal(value.origin, 'https://example.com')
  assert.equal(bridge.calls.filter((call) => call.op === 'open').length, 1)
})

test('screenshot stores an image attachment and renders an image block', async () => {
  const saved = []
  const attachments = {
    async saveImage(input) {
      saved.push(input)
      return {
        attachmentId: 'att-1',
        mediaType: 'image/png',
        bytes: input.data.length,
        width: 10,
        height: 10,
        name: input.name,
      }
    },
  }
  const { ctx } = setup({ attachments })
  const definition = ctx.definitions.get('browser_use_screenshot')
  const value = await definition.execute({}, {})
  assert.equal(value.ok, true)
  assert.equal(value.attachment.attachmentId, 'att-1')
  assert.equal(saved.length, 1)
  assert.equal(saved[0].mediaType, 'image/png')
  const rendered = definition.output.render({}, value)
  assert.equal(rendered.length, 2)
  assert.equal(rendered[1].type, 'image')
  assert.equal(rendered[1].attachment.attachmentId, 'att-1')
})

test('screenshot reports E_CDP_UNAVAILABLE when CDP is off', async () => {
  const { ctx } = setup({
    cdp: {
      probeCdp: async () => ({ available: false, port: 9222, error: 'connection refused' }),
      captureScreenshot: async () => {
        throw new BrowserUseError('E_CDP_UNAVAILABLE', 'CDP endpoint is not available')
      },
    },
  })
  const value = await ctx.definitions.get('browser_use_screenshot').execute({}, {})
  assert.equal(value.ok, false)
  assert.equal(value.code, 'E_CDP_UNAVAILABLE')
  assert.match(value.hint || '', /remote-debugging-port/u)
})

test('screenshot fails closed without an attachment service', async () => {
  const { ctx } = setup()
  const value = await ctx.definitions.get('browser_use_screenshot').execute({}, {})
  assert.equal(value.ok, false)
  assert.equal(value.code, 'E_ATTACHMENT_UNAVAILABLE')
})

test('panel tool opens the sidebar panel through the bridge', async () => {
  const { ctx, bridge } = setup()
  const value = await ctx.definitions.get('browser_use_panel').execute({}, {})
  assert.equal(value.ok, true)
  assert.equal(value.panel, 'browser-use-panel')
  assert.equal(bridge.calls.filter((call) => call.op === 'openPanel').length, 1)
})

test('verify passes structured checks through', async () => {
  const { ctx } = setup()
  const value = await ctx.definitions
    .get('browser_use_verify')
    .execute({ title: 'Example', text: 'hello' }, {})
  assert.equal(value.ok, true)
  assert.equal(value.passed, true)
  assert.equal(value.checks[0].name, 'title')
})
