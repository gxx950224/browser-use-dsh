import test from 'node:test'
import assert from 'node:assert/strict'
import {
  corsHeaders,
  encodeMeta,
  isLoopback,
  safeEqual,
  tokenFromRequest,
} from '../lib/protocol.js'

test('isLoopback accepts only loopback forms', () => {
  assert.equal(isLoopback('127.0.0.1'), true)
  assert.equal(isLoopback('::1'), true)
  assert.equal(isLoopback('::ffff:127.0.0.1'), true)
  assert.equal(isLoopback('localhost'), true)
  assert.equal(isLoopback('192.168.1.2'), false)
  assert.equal(isLoopback(''), false)
  assert.equal(isLoopback(undefined), false)
})

test('safeEqual compares tokens without length leaks', () => {
  assert.equal(safeEqual('abc123', 'abc123'), true)
  assert.equal(safeEqual('abc123', 'abc124'), false)
  assert.equal(safeEqual('abc', 'abcd'), false)
  assert.equal(safeEqual(undefined, 'abc'), false)
})

test('corsHeaders echoes only allowed origins', () => {
  const allowed = corsHeaders('dsh-app://app', ['dsh-app://app'])
  assert.equal(allowed['Access-Control-Allow-Origin'], 'dsh-app://app')
  assert.match(allowed['Access-Control-Allow-Headers'], /Authorization/)
  assert.match(allowed['Access-Control-Allow-Methods'], /POST/)

  const denied = corsHeaders('https://evil.example', ['dsh-app://app'])
  assert.equal(denied['Access-Control-Allow-Origin'], undefined)
})

test('tokenFromRequest parses bearer headers', () => {
  assert.equal(tokenFromRequest({ headers: { authorization: 'Bearer abc' } }), 'abc')
  assert.equal(tokenFromRequest({ headers: { authorization: 'bearer xyz' } }), 'xyz')
  assert.equal(tokenFromRequest({ headers: {} }), null)
  assert.equal(tokenFromRequest({}), null)
})

test('encodeMeta produces parseable base64 JSON', () => {
  const encoded = encodeMeta({ port: 8817, token: 't' })
  const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))
  assert.deepEqual(decoded, { port: 8817, token: 't' })
})
