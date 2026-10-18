/**
 * CDP helpers for screenshots.
 *
 * DSH Desktop must be launched with `--remote-debugging-port=<port>` for this
 * to work; otherwise the tools report E_CDP_UNAVAILABLE. We only talk to
 * 127.0.0.1 and only select `type:"webview"` targets (never the DSH shell).
 */

import { BrowserUseError } from './errors.js'

export const DEFAULT_CDP_PORT = 9222

async function fetchJson(url, signal) {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

/**
 * Probe a CDP endpoint.
 * @param {number} port
 * @param {number} timeoutMs
 */
export async function probeCdp(port = DEFAULT_CDP_PORT, timeoutMs = 800) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const [version, list] = await Promise.all([
      fetchJson(`http://127.0.0.1:${port}/json/version`, controller.signal),
      fetchJson(`http://127.0.0.1:${port}/json/list`, controller.signal),
    ])
    const targets = Array.isArray(list)
      ? list
          .filter((target) => target && typeof target === 'object')
          .map((target) => ({
            id: String(target.id || ''),
            type: String(target.type || ''),
            url: String(target.url || ''),
            title: String(target.title || ''),
            webSocketDebuggerUrl: target.webSocketDebuggerUrl ? String(target.webSocketDebuggerUrl) : undefined,
          }))
      : []
    return {
      available: true,
      port,
      browser: version && version.Browser ? String(version.Browser) : undefined,
      protocolVersion: version && version['Protocol-Version'] ? String(version['Protocol-Version']) : undefined,
      targets,
    }
  } catch (error) {
    return {
      available: false,
      port,
      error: error && error.name === 'AbortError' ? `timed out after ${timeoutMs}ms` : String((error && error.message) || error),
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Discover a loopback CDP endpoint, preferring the configured port and falling
 * back to common alternatives when a proxy or another tool occupies it.
 * @param {number} preferredPort
 * @param {number} timeoutMs
 */
export async function discoverCdp(preferredPort = DEFAULT_CDP_PORT, timeoutMs = 700) {
  const candidates = [...new Set([preferredPort, 9223, 9333, 9334, 9224, 9225].filter((port) => Number.isInteger(port) && port > 0))]
  let firstAvailable = null
  const errors = []
  for (const port of candidates) {
    const result = await probeCdp(port, timeoutMs)
    if (!result.available) {
      errors.push(`${port}: ${result.error}`)
      continue
    }
    if (!firstAvailable) firstAvailable = result
    if (Array.isArray(result.targets) && result.targets.some((target) => target.type === 'webview')) {
      return { ...result, discovered: port !== preferredPort, candidates }
    }
  }
  if (firstAvailable) return { ...firstAvailable, discovered: firstAvailable.port !== preferredPort, candidates }
  return {
    available: false,
    port: preferredPort,
    candidates,
    error: `no CDP endpoint among ${candidates.join(', ')} (${errors.join('; ')})`,
  }
}

/** Pick a webview target, preferring the one whose URL matches. */
export function pickWebviewTarget(targets, pageUrl) {
  if (!Array.isArray(targets)) return null
  const webviews = targets.filter((target) => target.type === 'webview' && target.webSocketDebuggerUrl)
  if (webviews.length === 0) return null
  if (pageUrl) {
    const normalized = normalizeUrl(pageUrl)
    const match = webviews.find((target) => normalizeUrl(target.url) === normalized)
    if (match) return match
  }
  return webviews[0]
}

function normalizeUrl(value) {
  try {
    const url = new URL(String(value))
    url.hash = ''
    return url.toString().replace(/\/$/u, '')
  } catch {
    return String(value || '')
  }
}

/**
 * Capture a PNG screenshot through the CDP Page domain.
 * @param {{ port?: number, url?: string, fullPage?: boolean, timeoutMs?: number }} options
 * @returns {Promise<{ ok: true, data: Uint8Array, bytes: number, mediaType: 'image/png', target: object, probe: object }>}
 */
export async function captureScreenshot(options = {}) {
  const port = options.port || DEFAULT_CDP_PORT
  const timeoutMs = options.timeoutMs || 15000
  if (typeof WebSocket !== 'function') {
    throw new BrowserUseError(
      'E_CDP_UNAVAILABLE',
      'the Host runtime does not expose a WebSocket implementation for CDP',
      'screenshots require a DSH Desktop build with CDP support',
    )
  }
  const probe = await probeCdp(port, 1500)
  if (!probe.available) {
    throw new BrowserUseError(
      'E_CDP_UNAVAILABLE',
      `CDP endpoint 127.0.0.1:${port} is not available (${probe.error || 'connection refused'})`,
      'restart DSH Desktop with --remote-debugging-port=9222 (or set config.cdpPort to an open loopback port)',
    )
  }
  const target = pickWebviewTarget(probe.targets, options.url)
  if (!target) {
    throw new BrowserUseError(
      'E_CDP_NO_TARGET',
      'no webview target was found on the CDP endpoint',
      'open the Sidebar browser page first; screenshots only target type:"webview", never the DSH shell',
    )
  }
  const data = await withCdpSession(target.webSocketDebuggerUrl, timeoutMs, async (send) => {
    await send('Page.enable', {})
    const result = await send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: Boolean(options.fullPage),
    })
    if (!result || typeof result.data !== 'string') {
      throw new BrowserUseError('E_CDP_CAPTURE_FAILED', 'Page.captureScreenshot returned no data')
    }
    return Buffer.from(result.data, 'base64')
  })
  return {
    ok: true,
    data,
    bytes: data.length,
    mediaType: 'image/png',
    target: { id: target.id, url: target.url, title: target.title },
    probe: { port: probe.port, browser: probe.browser, protocolVersion: probe.protocolVersion },
  }
}

function withCdpSession(webSocketDebuggerUrl, timeoutMs, work) {
  return new Promise((resolve, reject) => {
    let settled = false
    let nextId = 1
    const pending = new Map()
    let socket
    const timer = setTimeout(() => finish(new BrowserUseError('E_CDP_TIMEOUT', `CDP session timed out after ${timeoutMs}ms`)), timeoutMs)
    function finish(error, value) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        if (socket && socket.readyState === 1) socket.close()
      } catch {
        /* ignore */
      }
      for (const entry of pending.values()) {
        clearTimeout(entry.timer)
        entry.reject(error || new BrowserUseError('E_CDP_CLOSED', 'CDP session closed'))
      }
      pending.clear()
      if (error) reject(error)
      else resolve(value)
    }
    function send(method, params) {
      return new Promise((resolveSend, rejectSend) => {
        const id = nextId
        nextId += 1
        const entryTimer = setTimeout(() => {
          pending.delete(id)
          rejectSend(new BrowserUseError('E_CDP_TIMEOUT', `CDP command ${method} timed out`))
        }, timeoutMs)
        pending.set(id, { resolve: resolveSend, reject: rejectSend, timer: entryTimer })
        try {
          socket.send(JSON.stringify({ id, method, params: params || {} }))
        } catch (error) {
          clearTimeout(entryTimer)
          pending.delete(id)
          rejectSend(new BrowserUseError('E_CDP_SEND_FAILED', `CDP send failed: ${error && error.message ? error.message : error}`))
        }
      })
    }
    try {
      socket = new WebSocket(webSocketDebuggerUrl)
    } catch (error) {
      finish(new BrowserUseError('E_CDP_CONNECT_FAILED', `cannot connect to CDP WebSocket: ${error && error.message ? error.message : error}`))
      return
    }
    socket.addEventListener('open', () => {
      Promise.resolve()
        .then(() => work(send))
        .then((value) => finish(null, value))
        .catch((error) => finish(error instanceof BrowserUseError ? error : new BrowserUseError('E_CDP_CAPTURE_FAILED', String((error && error.message) || error))))
    })
    socket.addEventListener('message', (event) => {
      let message
      try {
        message = JSON.parse(typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString('utf8'))
      } catch {
        return
      }
      if (!message || typeof message.id !== 'number') return
      const entry = pending.get(message.id)
      if (!entry) return
      pending.delete(message.id)
      clearTimeout(entry.timer)
      if (message.error) {
        entry.reject(new BrowserUseError('E_CDP_CAPTURE_FAILED', String(message.error.message || 'CDP command failed')))
      } else {
        entry.resolve(message.result)
      }
    })
    socket.addEventListener('error', () => {
      finish(new BrowserUseError('E_CDP_CONNECT_FAILED', 'CDP WebSocket error'))
    })
    socket.addEventListener('close', () => {
      finish(new BrowserUseError('E_CDP_CLOSED', 'CDP WebSocket closed before the command finished'))
    })
  })
}
