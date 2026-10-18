import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULTS, normalizeConfig } from '../lib/config.js'

test('defaults: desktop bridge defaults are stable', () => {
  const { config, warnings } = normalizeConfig(undefined)
  assert.deepEqual(warnings, [])
  assert.equal(config.bridgePort, DEFAULTS.bridgePort)
  assert.equal(config.commandTimeoutMs, DEFAULTS.commandTimeoutMs)
  assert.equal(config.pollTimeoutMs, DEFAULTS.pollTimeoutMs)
  assert.equal(config.promptSection, true)
  assert.equal(config.openReuseTab, true)
  assert.equal(config.approvalPolicy, 'sensitive')
  assert.equal(config.originApproval, 'ask')
  assert.deepEqual(config.allowedOrigins, ['dsh-app://app'])
})

test('invalid values fall back with warnings', () => {
  const { config, warnings } = normalizeConfig({
    bridgePort: 700000,
    commandTimeoutMs: 5,
    pollTimeoutMs: 'abc',
    promptSection: 'yes',
    openReuseTab: 0,
    maxBodyBytes: 10,
    approvalPolicy: 'yolo',
    originApproval: 'maybe',
  })
  assert.equal(config.bridgePort, DEFAULTS.bridgePort)
  assert.equal(config.commandTimeoutMs, DEFAULTS.commandTimeoutMs)
  assert.equal(config.pollTimeoutMs, DEFAULTS.pollTimeoutMs)
  assert.equal(config.promptSection, DEFAULTS.promptSection)
  assert.equal(config.openReuseTab, DEFAULTS.openReuseTab)
  assert.equal(config.maxBodyBytes, DEFAULTS.maxBodyBytes)
  assert.equal(config.approvalPolicy, DEFAULTS.approvalPolicy)
  assert.equal(config.originApproval, DEFAULTS.originApproval)
  assert.equal(warnings.length, 8)
})

test('valid overrides are kept and the desktop origin is always allowed', () => {
  const { config } = normalizeConfig({
    bridgePort: 9900,
    allowedOrigins: ['https://example.com'],
    commandTimeoutMs: 12000,
    pollTimeoutMs: 4000,
    promptSection: false,
    openReuseTab: false,
    maxBodyBytes: 4096,
    approvalPolicy: 'all',
    originApproval: 'off',
  })
  assert.equal(config.bridgePort, 9900)
  assert.equal(config.commandTimeoutMs, 12000)
  assert.equal(config.pollTimeoutMs, 4000)
  assert.equal(config.promptSection, false)
  assert.equal(config.openReuseTab, false)
  assert.equal(config.maxBodyBytes, 4096)
  assert.equal(config.approvalPolicy, 'all')
  assert.equal(config.originApproval, 'off')
  assert.deepEqual(config.allowedOrigins, ['https://example.com', 'dsh-app://app'])
})

test('invalid origins fall back and unknown keys warn', () => {
  const { config, warnings } = normalizeConfig({ allowedOrigins: ['not-a-url'], someKey: 1 })
  assert.deepEqual(config.allowedOrigins, ['dsh-app://app'])
  assert.equal(warnings.length, 2)
  assert.ok(warnings.some((warning) => warning.includes('someKey')))
})

test('ephemeral port 0 is accepted for tests', () => {
  const { config } = normalizeConfig({ bridgePort: 0 })
  assert.equal(config.bridgePort, 0)
})
