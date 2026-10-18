/**
 * Loopback bridge between the Host half and the Client half.
 *
 * The Host owns the HTTP server and the command queue; the Client (renderer)
 * polls for commands, executes them against the DSH Sidebar browser, and posts
 * results back. Authentication is a random bearer token generated per plugin
 * activation; the token is only delivered through the page meta tag or the
 * origin-gated `/v1/config` fallback, never through URLs or logs.
 */

import http from 'node:http'
import crypto from 'node:crypto'
import { BrowserUseError } from './errors.js'
import {
  META_NAME,
  PROTOCOL_VERSION,
  ROUTES,
  corsHeaders,
  encodeMeta,
  isLoopback,
  safeEqual,
  tokenFromRequest,
} from './protocol.js'

const MAX_RENDERER_ID_LENGTH = 128
const CLIENT_STALE_MS = 120000

export class BrowserBridge {
  /**
   * @param {{ config: Record<string, any>, logger?: { warn?: Function, error?: Function }, BufferImpl?: any }} options
   */
  constructor({ config, logger, BufferImpl }) {
    this.config = config
    this.logger = logger || {}
    this.BufferImpl = BufferImpl || Buffer
    this.token = crypto.randomBytes(24).toString('base64url')
    this.server = null
    this.port = config.bridgePort
    this.clients = new Map()
    this.pending = new Map()
    this.waiters = []
    this.queue = []
    this.nextId = 1
    this.ready = false
    this.stopped = false
    this.startError = null
  }

  get url() {
    return `http://127.0.0.1:${this.port}`
  }

  /** Start the loopback HTTP server. */
  async start() {
    if (this.server) return
    if (this.stopped) throw new BrowserUseError('E_BRIDGE_STOPPED', 'bridge is already stopped')
    const server = http.createServer((request, response) => {
      this.handle(request, response).catch((error) => {
        this.logger.warn?.(`[browser-use-dsh] bridge request failed: ${error && error.message ? error.message : error}`)
        this.respond(request, response, 500, {
          ok: false,
          error: { code: 'E_BRIDGE_INTERNAL', message: 'bridge request failed' },
        })
      })
    })
    server.on('clientError', (_error, socket) => {
      try {
        socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
      } catch {
        /* ignore */
      }
    })
    this.server = server
    await new Promise((resolve, reject) => {
      const onError = (error) => {
        this.startError = error
        reject(error)
      }
      server.once('error', onError)
      server.listen(this.port, '127.0.0.1', () => {
        server.off('error', onError)
        const address = server.address()
        if (address && typeof address === 'object') this.port = address.port
        this.ready = true
        resolve()
      })
    })
    return this.port
  }

  /** Stop the server and fail every in-flight command. */
  async stop() {
    if (this.stopped) return
    this.stopped = true
    this.ready = false
    for (const waiter of this.waiters.splice(0)) {
      waiter.finish(503, { ok: false, error: { code: 'E_BRIDGE_STOPPED', message: 'bridge stopped' } })
    }
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer)
      entry.cleanup?.()
      entry.reject(new BrowserUseError('E_BRIDGE_STOPPED', 'bridge stopped before the command completed'))
    }
    this.pending.clear()
    this.queue.length = 0
    this.clients.clear()
    const server = this.server
    this.server = null
    if (!server) return
    await new Promise((resolve) => {
      let settled = false
      const done = () => {
        if (settled) return
        settled = true
        resolve()
      }
      server.close(() => done())
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections()
      setTimeout(done, 500)
    })
  }

  /** Inject the bridge descriptor into the Web index HTML. */
  injectMeta(html) {
    if (typeof html !== 'string') return html
    if (html.includes(`name="${META_NAME}"`)) return html
    const payload = encodeMeta(
      {
        version: PROTOCOL_VERSION,
        port: this.port,
        token: this.token,
        features: {
          floatingPickButton: Boolean(this.config.floatingPickButton),
          annotationSendMode: this.config.annotationSendMode,
        },
      },
      this.BufferImpl,
    )
    const tag = `<meta name="${META_NAME}" content="${payload}">`
    if (html.includes('</head>')) return html.replace('</head>', `${tag}</head>`)
    return tag + html
  }

  /** Snapshot for diagnostics. */
  status() {
    const now = Date.now()
    const clients = []
    for (const client of this.clients.values()) {
      clients.push({
        rendererId: client.rendererId,
        platform: client.platform,
        focused: Boolean(client.focused),
        connectedAt: client.connectedAt,
        lastSeen: client.lastSeen,
        stale: now - client.lastSeen > CLIENT_STALE_MS,
      })
    }
    return {
      port: this.port,
      url: this.url,
      ready: this.ready,
      startError: this.startError ? String(this.startError.message || this.startError) : null,
      online: clients.some((client) => !client.stale),
      clients,
      queue: this.queue.length,
      pending: this.pending.size,
    }
  }

  /**
   * Send one command to the single connected Client and await its result.
   * @param {string} op
   * @param {object} args
   * @param {{ timeoutMs?: number, signal?: AbortSignal }} [options]
   */
  send(op, args = {}, options = {}) {
    if (this.startError) {
      throw new BrowserUseError(
        'E_BRIDGE_UNAVAILABLE',
        `host bridge failed to start: ${this.startError.message || this.startError}`,
        'check config.bridgePort and whether another process owns it',
      )
    }
    if (!this.ready || !this.server) {
      throw new BrowserUseError('E_BRIDGE_UNAVAILABLE', 'host bridge is not listening yet', 'retry after the plugin finishes loading')
    }
    this.pickClient()
    const timeoutMs =
      Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
        ? Math.floor(options.timeoutMs)
        : this.config.commandTimeoutMs
    const id = String(this.nextId)
    this.nextId += 1
    const signal = options.signal
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) {
        reject(new BrowserUseError('E_CANCELLED', 'browser command cancelled'))
        return
      }
      const entry = {
        id,
        resolve,
        reject,
        timer: null,
        cleanup: null,
      }
      const fail = (error) => {
        if (!this.pending.has(id)) return
        this.pending.delete(id)
        clearTimeout(entry.timer)
        entry.cleanup?.()
        this.removeQueued(id)
        reject(error)
      }
      entry.timer = setTimeout(() => {
        fail(new BrowserUseError('E_TIMEOUT', `browser command "${op}" timed out after ${timeoutMs}ms`, 'the Client may be busy, offline, or the page is loading'))
      }, timeoutMs)
      if (signal) {
        const onAbort = () => fail(new BrowserUseError('E_CANCELLED', 'browser command cancelled'))
        signal.addEventListener('abort', onAbort, { once: true })
        entry.cleanup = () => signal.removeEventListener('abort', onAbort)
      }
      this.pending.set(id, entry)
      this.queue.push({ id, op, args })
      this.flushWaiters()
    })
  }

  /** HTTP routing. */
  async handle(request, response) {
    if (!isLoopback(request.socket?.remoteAddress)) {
      this.respond(request, response, 403, { ok: false, error: { code: 'E_FORBIDDEN', message: 'loopback only' } })
      return
    }
    if (request.method === 'OPTIONS') {
      this.respond(request, response, 204, null)
      return
    }
    const url = new URL(request.url || '/', 'http://127.0.0.1')
    if (url.pathname === ROUTES.health && request.method === 'GET') {
      this.respond(request, response, 200, { ok: true, version: PROTOCOL_VERSION, port: this.port })
      return
    }
    if (url.pathname === ROUTES.config && request.method === 'GET') {
      if (!this.originAllowed(request)) {
        this.respond(request, response, 403, { ok: false, error: { code: 'E_ORIGIN_NOT_ALLOWED', message: 'origin is not in config.allowedOrigins' } })
        return
      }
      this.respond(request, response, 200, {
        ok: true,
        version: PROTOCOL_VERSION,
        port: this.port,
        token: this.token,
        pollTimeoutMs: this.config.pollTimeoutMs,
        features: {
          floatingPickButton: Boolean(this.config.floatingPickButton),
          annotationSendMode: this.config.annotationSendMode,
        },
      })
      return
    }
    if (url.pathname === ROUTES.handshake && request.method === 'POST') {
      if (!this.authorize(request)) {
        this.respond(request, response, 401, { ok: false, error: { code: 'E_UNAUTHORIZED', message: 'bad bridge token' } })
        return
      }
      const body = await this.readJson(request)
      const rendererId = normalizeRendererId(body.rendererId)
      this.clients.set(rendererId, {
        rendererId,
        platform: typeof body.platform === 'string' ? body.platform.slice(0, 32) : 'unknown',
        href: typeof body.href === 'string' ? body.href.slice(0, 2048) : undefined,
        focused: body.focused === true,
        connectedAt: Date.now(),
        lastSeen: Date.now(),
      })
      this.respond(request, response, 200, {
        ok: true,
        version: PROTOCOL_VERSION,
        server: { version: PROTOCOL_VERSION, port: this.port },
        config: { pollTimeoutMs: this.config.pollTimeoutMs, commandTimeoutMs: this.config.commandTimeoutMs },
      })
      return
    }
    if (url.pathname === ROUTES.poll && request.method === 'GET') {
      if (!this.authorize(request)) {
        this.respond(request, response, 401, { ok: false, error: { code: 'E_UNAUTHORIZED', message: 'bad bridge token' } })
        return
      }
      const rendererId = url.searchParams.get('rendererId') || ''
      const client = this.clients.get(rendererId)
      if (!client) {
        this.respond(request, response, 401, { ok: false, error: { code: 'E_NOT_HANDSHAKEN', message: 'handshake required' } })
        return
      }
      client.lastSeen = Date.now()
      client.focused = url.searchParams.get('focused') === '1'
      this.pruneClients()
      if (this.queue.length > 0) {
        this.respond(request, response, 200, this.queue.shift())
        return
      }
      this.holdPoll(request, response)
      return
    }
    if (url.pathname === ROUTES.result && request.method === 'POST') {
      if (!this.authorize(request)) {
        this.respond(request, response, 401, { ok: false, error: { code: 'E_UNAUTHORIZED', message: 'bad bridge token' } })
        return
      }
      const body = await this.readJson(request)
      const id = typeof body.id === 'string' ? body.id : String(body.id ?? '')
      const entry = this.pending.get(id)
      if (!entry) {
        this.respond(request, response, 200, { ok: true, ignored: true })
        return
      }
      this.pending.delete(id)
      clearTimeout(entry.timer)
      entry.cleanup?.()
      if (body.ok === false) {
        const payload = body.error && typeof body.error === 'object' ? body.error : {}
        entry.reject(
          new BrowserUseError(
            typeof payload.code === 'string' ? payload.code : 'E_REMOTE',
            typeof payload.message === 'string' ? payload.message : 'browser command failed',
            typeof payload.hint === 'string' ? payload.hint : undefined,
          ),
        )
      } else {
        entry.resolve(body.data)
      }
      this.respond(request, response, 200, { ok: true })
      return
    }
    this.respond(request, response, 404, { ok: false, error: { code: 'E_NOT_FOUND', message: 'unknown bridge route' } })
  }

  /** Hold a long-poll until a command arrives or the timeout elapses. */
  holdPoll(request, response) {
    let finished = false
    const finish = (status, payload) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      const index = this.waiters.indexOf(waiter)
      if (index >= 0) this.waiters.splice(index, 1)
      response.off?.('close', onClose)
      this.respond(request, response, status, payload)
    }
    const onClose = () => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      const index = this.waiters.indexOf(waiter)
      if (index >= 0) this.waiters.splice(index, 1)
    }
    const timer = setTimeout(() => finish(204, null), this.config.pollTimeoutMs)
    const waiter = { finish }
    response.once('close', onClose)
    this.waiters.push(waiter)
  }

  /** Wake held polls while commands are queued. */
  flushWaiters() {
    while (this.waiters.length > 0 && this.queue.length > 0) {
      const waiter = this.waiters.shift()
      if (!waiter) break
      const command = this.queue.shift()
      waiter.finish(200, command)
    }
  }

  /** Drop queued commands that can no longer be delivered. */
  removeQueued(id) {
    for (let index = 0; index < this.queue.length; index += 1) {
      if (this.queue[index].id === id) {
        this.queue.splice(index, 1)
        return
      }
    }
  }

  /** Select the single online Client, preferring the focused DSH window. */
  pickClient() {
    this.pruneClients()
    const online = []
    for (const client of this.clients.values()) {
      if (Date.now() - client.lastSeen <= CLIENT_STALE_MS) online.push(client)
    }
    if (online.length === 0) {
      throw new BrowserUseError(
        'E_CLIENT_OFFLINE',
        'no Browser Use Client is connected',
        'open the DSH Desktop window and make sure the Browser Use plugin is enabled',
      )
    }
    if (online.length === 1) return online[0]
    const focused = online.filter((client) => client.focused)
    if (focused.length === 1) return focused[0]
    throw new BrowserUseError(
      'E_MULTIPLE_RENDERERS',
      `multiple DSH windows are connected (${online.map((client) => client.rendererId).join(', ')})`,
      'focus the DSH window that owns the Sidebar browser, or close extra DSH Web tabs; C1 routes to the focused window only',
    )
  }

  pruneClients() {
    const threshold = Date.now() - CLIENT_STALE_MS
    for (const [rendererId, client] of this.clients) {
      if (client.lastSeen < threshold) this.clients.delete(rendererId)
    }
  }

  authorize(request) {
    return safeEqual(tokenFromRequest(request) || '', this.token)
  }

  originAllowed(request) {
    const origin = request.headers.origin
    if (typeof origin === 'string') return this.config.allowedOrigins.includes(origin)
    return isLoopback(request.socket?.remoteAddress)
  }

  async readJson(request) {
    const chunks = []
    let size = 0
    for await (const chunk of request) {
      size += chunk.length
      if (size > this.config.maxBodyBytes) {
        throw new BrowserUseError('E_BODY_TOO_LARGE', `request body exceeds ${this.config.maxBodyBytes} bytes`)
      }
      chunks.push(chunk)
    }
    if (size === 0) return {}
    let parsed
    try {
      parsed = JSON.parse(this.BufferImpl.concat(chunks).toString('utf8'))
    } catch {
      throw new BrowserUseError('E_BAD_JSON', 'request body is not valid JSON')
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new BrowserUseError('E_BAD_JSON', 'request body must be a JSON object')
    }
    return parsed
  }

  respond(request, response, status, payload) {
    if (response.writableEnded) return
    const headers = {
      ...corsHeaders(request.headers.origin, this.config.allowedOrigins),
      'Cache-Control': 'no-store',
    }
    let body = null
    if (payload !== null && payload !== undefined) {
      body = this.BufferImpl.from(JSON.stringify(payload), 'utf8')
      headers['Content-Type'] = 'application/json; charset=utf-8'
      headers['Content-Length'] = String(body.length)
    }
    try {
      response.writeHead(status, headers)
      if (body) response.end(body)
      else response.end()
    } catch {
      /* connection already closed */
    }
  }
}

function normalizeRendererId(value) {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim().slice(0, MAX_RENDERER_ID_LENGTH)
  }
  return `renderer-${crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(8).toString('hex')}`
}
