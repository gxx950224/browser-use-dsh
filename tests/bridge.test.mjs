import test from 'node:test'
import assert from 'node:assert/strict'
import { BrowserBridge } from '../lib/bridge.js'
import { normalizeConfig } from '../lib/config.js'

const baseConfig = normalizeConfig({
  bridgePort: 0,
  allowedOrigins: ['dsh-app://app'],
  commandTimeoutMs: 2000,
  pollTimeoutMs: 800,
}).config

async function startBridge(overrides = {}) {
  const bridge = new BrowserBridge({ config: { ...baseConfig, ...overrides }, logger: {} })
  await bridge.start()
  return bridge
}

function auth(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

async function handshake(bridge, rendererId = 'r1') {
  const response = await fetch(`http://127.0.0.1:${bridge.port}/v1/handshake`, {
    method: 'POST',
    headers: auth(bridge.token),
    body: JSON.stringify({ rendererId, platform: 'web' }),
  })
  assert.equal(response.status, 200)
  return response.json()
}

test('config endpoint is origin-gated and returns the token', async () => {
  const bridge = await startBridge()
  try {
    const good = await fetch(`http://127.0.0.1:${bridge.port}/v1/config`, {
      headers: { Origin: 'dsh-app://app' },
    })
    assert.equal(good.status, 200)
    assert.equal(good.headers.get('access-control-allow-origin'), 'dsh-app://app')
    const data = await good.json()
    assert.equal(data.token, bridge.token)
    assert.equal(data.port, bridge.port)
    assert.equal(data.features.floatingPickButton, false)
    assert.equal(data.features.annotationSendMode, 'insert')
    assert.equal(data.features.annotationScreenshot, 'viewport')

    const bad = await fetch(`http://127.0.0.1:${bridge.port}/v1/config`, {
      headers: { Origin: 'https://evil.example' },
    })
    assert.equal(bad.status, 403)
  } finally {
    await bridge.stop()
  }
})

test('CORS preflight answers 204 with allow headers', async () => {
  const bridge = await startBridge()
  try {
    const response = await fetch(`http://127.0.0.1:${bridge.port}/v1/handshake`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'dsh-app://app',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    })
    assert.equal(response.status, 204)
    assert.equal(response.headers.get('access-control-allow-origin'), 'dsh-app://app')
    assert.match(response.headers.get('access-control-allow-headers'), /Authorization/)
  } finally {
    await bridge.stop()
  }
})

test('send fails with E_CLIENT_OFFLINE without a handshake', async () => {
  const bridge = await startBridge()
  try {
    assert.throws(
      () => bridge.send('status'),
      (error) => error && error.code === 'E_CLIENT_OFFLINE',
    )
  } finally {
    await bridge.stop()
  }
})

test('bad token is rejected', async () => {
  const bridge = await startBridge()
  try {
    const response = await fetch(`http://127.0.0.1:${bridge.port}/v1/handshake`, {
      method: 'POST',
      headers: auth('wrong-token'),
      body: JSON.stringify({ rendererId: 'r1' }),
    })
    assert.equal(response.status, 401)
  } finally {
    await bridge.stop()
  }
})

test('poll requires a handshake', async () => {
  const bridge = await startBridge()
  try {
    const response = await fetch(`http://127.0.0.1:${bridge.port}/v1/poll?rendererId=missing`, {
      headers: { Authorization: `Bearer ${bridge.token}` },
    })
    assert.equal(response.status, 401)
    const payload = await response.json()
    assert.equal(payload.error.code, 'E_NOT_HANDSHAKEN')
  } finally {
    await bridge.stop()
  }
})

test('command round trip: send -> poll -> result', async () => {
  const bridge = await startBridge()
  try {
    await handshake(bridge)
    const pending = bridge.send('status', {}, { timeoutMs: 1500 })
    const poll = await fetch(`http://127.0.0.1:${bridge.port}/v1/poll?rendererId=r1`, {
      headers: { Authorization: `Bearer ${bridge.token}` },
    })
    assert.equal(poll.status, 200)
    const command = await poll.json()
    assert.equal(command.op, 'status')
    const result = await fetch(`http://127.0.0.1:${bridge.port}/v1/result`, {
      method: 'POST',
      headers: auth(bridge.token),
      body: JSON.stringify({ id: command.id, ok: true, data: { ok: true, url: 'https://example.com' } }),
    })
    assert.equal(result.status, 200)
    assert.deepEqual(await pending, { ok: true, url: 'https://example.com' })
  } finally {
    await bridge.stop()
  }
})

test('long poll wakes when a command is queued', async () => {
  const bridge = await startBridge()
  try {
    await handshake(bridge)
    const pollPromise = fetch(`http://127.0.0.1:${bridge.port}/v1/poll?rendererId=r1`, {
      headers: { Authorization: `Bearer ${bridge.token}` },
    })
    await new Promise((resolve) => setTimeout(resolve, 100))
    const pending = bridge.send('read', { mode: 'ax' }, { timeoutMs: 1500 })
    const poll = await pollPromise
    assert.equal(poll.status, 200)
    const command = await poll.json()
    assert.equal(command.op, 'read')
    await fetch(`http://127.0.0.1:${bridge.port}/v1/result`, {
      method: 'POST',
      headers: auth(bridge.token),
      body: JSON.stringify({ id: command.id, ok: true, data: { ok: true, mode: 'ax' } }),
    })
    assert.deepEqual(await pending, { ok: true, mode: 'ax' })
  } finally {
    await bridge.stop()
  }
})

test('remote errors reject the pending command', async () => {
  const bridge = await startBridge()
  try {
    await handshake(bridge)
    const pending = bridge.send('read', {}, { timeoutMs: 1500 })
    const rejected = assert.rejects(pending, (error) => error && error.code === 'E_NO_WEBVIEW')
    const poll = await fetch(`http://127.0.0.1:${bridge.port}/v1/poll?rendererId=r1`, {
      headers: { Authorization: `Bearer ${bridge.token}` },
    })
    const command = await poll.json()
    await fetch(`http://127.0.0.1:${bridge.port}/v1/result`, {
      method: 'POST',
      headers: auth(bridge.token),
      body: JSON.stringify({
        id: command.id,
        ok: false,
        error: { code: 'E_NO_WEBVIEW', message: 'no webview' },
      }),
    })
    await rejected
  } finally {
    await bridge.stop()
  }
})

test('multiple clients: focused renderer is preferred', async () => {
  const bridge = await startBridge({ pollTimeoutMs: 400 })
  try {
    await handshake(bridge, 'r1')
    await handshake(bridge, 'r2')
    const poll = fetch(`http://127.0.0.1:${bridge.port}/v1/poll?rendererId=r2&focused=1`, {
      headers: { Authorization: `Bearer ${bridge.token}` },
    })
    await new Promise((resolve) => setTimeout(resolve, 120))
    assert.equal(bridge.pickClient().rendererId, 'r2')
    await bridge.stop()
    await poll.catch(() => {})
  } finally {
    await bridge.stop()
  }
})

test('multiple clients without focus fail explicitly', async () => {
  const bridge = await startBridge()
  try {
    await handshake(bridge, 'r1')
    await handshake(bridge, 'r2')
    assert.throws(
      () => bridge.pickClient(),
      (error) => error && error.code === 'E_MULTIPLE_RENDERERS',
    )
  } finally {
    await bridge.stop()
  }
})

test('stop rejects queued work and rejects later sends', async () => {
  const bridge = await startBridge()
  await handshake(bridge)
  const pending = bridge.send('open', { url: 'https://example.com' }, { timeoutMs: 5000 })
  await bridge.stop()
  await assert.rejects(pending, (error) => error && error.code === 'E_BRIDGE_STOPPED')
  assert.throws(
    () => bridge.send('status'),
    (error) => error && error.code === 'E_BRIDGE_UNAVAILABLE',
  )
})
