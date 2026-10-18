/**
 * Bridge wire protocol helpers and constants.
 *
 * Keep this file dependency-free: the Client bundle inlines the same
 * constants, so it must stay small and plain.
 */

export const PROTOCOL_VERSION = 1
export const META_NAME = 'dsh-browser-use'
export const DEFAULT_PORT = 8817

export const ROUTES = Object.freeze({
  config: '/v1/config',
  handshake: '/v1/handshake',
  poll: '/v1/poll',
  result: '/v1/result',
  health: '/v1/health',
})

export const LIMITS = Object.freeze({
  maxBodyBytes: 128 * 1024,
  pollTimeoutMs: 25000,
  commandTimeoutMs: 30000,
})

/** True for a loopback socket address. */
export function isLoopback(address) {
  if (typeof address !== 'string' || address.length === 0) return false
  const normalized = address.replace(/^::ffff:/u, '')
  return normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost'
}

/** Case-insensitive token comparison that does not short-circuit on length mismatch. */
export function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false
  if (left.length !== right.length) return false
  let diff = 0
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i)
  return diff === 0
}

/** Read a bearer token from an HTTP request. */
export function tokenFromRequest(request) {
  const header = request && request.headers ? request.headers.authorization : undefined
  if (typeof header !== 'string') return null
  const match = /^Bearer\s+(.+)$/iu.exec(header.trim())
  return match ? match[1] : null
}

/** Build CORS headers; echoes the origin only when allowed. */
export function corsHeaders(origin, allowedOrigins) {
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  }
  if (typeof origin === 'string' && Array.isArray(allowedOrigins) && allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

/** Encode the bridge meta payload injected into the Web index. */
export function encodeMeta(value, base64 = globalThis.Buffer) {
  if (!base64 || typeof base64.from !== 'function') {
    throw new Error('encodeMeta requires a Buffer implementation')
  }
  return base64.from(JSON.stringify(value), 'utf8').toString('base64')
}
