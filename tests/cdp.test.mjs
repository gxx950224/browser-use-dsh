import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { pickWebviewTarget, probeCdp } from '../lib/cdp.js'

function startCdpStub(handler) {
  const server = http.createServer(handler)
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port })
    })
  })
}

test('probeCdp reports availability and targets from a loopback endpoint', async () => {
  const { server, port } = await startCdpStub((request, response) => {
    response.setHeader('Content-Type', 'application/json')
    if (request.url === '/json/version') {
      response.end(JSON.stringify({ Browser: 'Chrome/999', 'Protocol-Version': '1.3' }))
      return
    }
    if (request.url === '/json/list') {
      response.end(
        JSON.stringify([
          {
            id: 'page-1',
            type: 'webview',
            url: 'https://example.com/',
            title: 'Example',
            webSocketDebuggerUrl: 'ws://127.0.0.1:1/devtools/page/page-1',
          },
          { id: 'shell', type: 'page', url: 'dsh-app://app/' },
        ]),
      )
      return
    }
    response.statusCode = 404
    response.end('{}')
  })
  try {
    const probe = await probeCdp(port, 1000)
    assert.equal(probe.available, true)
    assert.equal(probe.port, port)
    assert.equal(probe.browser, 'Chrome/999')
    assert.equal(probe.targets.length, 2)
    const target = pickWebviewTarget(probe.targets, 'https://example.com/')
    assert.equal(target.type, 'webview')
    assert.equal(target.id, 'page-1')
    assert.equal(pickWebviewTarget(probe.targets, 'https://other.example/').id, 'page-1')
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('probeCdp degrades to available:false when nothing listens', async () => {
  // Bind then release a loopback port so the probe has a deterministic closed port.
  const { server, port } = await startCdpStub((_request, response) => response.end('{}'))
  await new Promise((resolve) => server.close(resolve))
  const probe = await probeCdp(port, 400)
  assert.equal(probe.available, false)
  assert.equal(typeof probe.error, 'string')
})

test('pickWebviewTarget never selects the shell page', () => {
  const targets = [
    { id: 'shell', type: 'page', url: 'dsh-app://app/', webSocketDebuggerUrl: 'ws://x' },
    { id: 'wv', type: 'webview', url: 'https://example.com/', webSocketDebuggerUrl: 'ws://y' },
  ]
  assert.equal(pickWebviewTarget(targets, 'dsh-app://app/').id, 'wv')
  assert.equal(pickWebviewTarget([targets[0]], 'dsh-app://app/'), null)
})
