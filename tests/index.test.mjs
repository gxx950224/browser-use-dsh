import test from 'node:test'
import assert from 'node:assert/strict'
import { apply, inject, name } from '../lib/index.js'

function fakeCtx() {
  const state = {
    tools: [],
    effects: [],
    injections: [],
    sections: 0,
    taps: 0,
    warnings: [],
    errors: [],
  }
  const effect = (fn) => {
    const cleanup = fn()
    state.effects.push(cleanup)
    return () => {}
  }
  const systemCtx = {
    effect,
    systemPrompt: {
      section() {
        state.sections += 1
        return () => {
          state.sections -= 1
        }
      },
    },
  }
  const webCtx = {
    effect,
    webServer: {
      tapIndex(transform) {
        state.taps += 1
        assert.equal(typeof transform, 'function')
        const html = transform('<html><head></head><body></body></html>')
        assert.match(html, /dsh-browser-use/)
        return () => {
          state.taps -= 1
        }
      },
    },
  }
  const ctx = {
    logger: {
      warn(message) {
        state.warnings.push(String(message))
      },
      error(message) {
        state.errors.push(String(message))
      },
    },
    effect,
    tools: {
      register(definition) {
        state.tools.push(definition)
        return () => {}
      },
    },
    inject(deps, callback) {
      state.injections.push([...deps])
      if (deps.includes('systemPrompt')) callback(systemCtx)
      if (deps.includes('webServer')) callback(webCtx)
    },
  }
  return { ctx, state }
}

test('host entry exports the bundle contract', () => {
  assert.equal(name, 'browser-use-dsh')
  assert.deepEqual(inject, ['tools'])
  assert.equal(typeof apply, 'function')
})

test('apply wires tools, system prompt, meta injection and cleanup', async () => {
  const { ctx, state } = fakeCtx()
  apply(ctx, { bridgePort: 0, openReuseTab: false })
  assert.deepEqual(
    state.tools.map((definition) => definition.name).sort(),
    [
      'browser_use_act',
      'browser_use_open',
      'browser_use_read',
      'browser_use_screenshot',
      'browser_use_status',
      'browser_use_verify',
    ],
  )
  assert.deepEqual(
    state.injections.map((deps) => deps.join('+')).sort(),
    ['systemPrompt', 'webServer'],
  )
  assert.equal(state.sections, 1)
  assert.equal(state.taps, 1)
  // Give the bridge server a moment to bind or fail; both outcomes must not
  // surface an unhandled error or a warning from config normalization.
  await new Promise((resolve) => setTimeout(resolve, 120))
  assert.deepEqual(state.errors, [])
  assert.deepEqual(state.warnings, [])

  for (const cleanup of state.effects.reverse()) {
    if (typeof cleanup === 'function') await cleanup()
  }
  assert.equal(state.sections, 0)
  assert.equal(state.taps, 0)
})

test('invalid config warns but still activates', () => {
  const { ctx, state } = fakeCtx()
  apply(ctx, { bridgePort: 999999, promptSection: false })
  assert.ok(state.warnings.some((warning) => warning.includes('bridgePort')))
  assert.equal(state.tools.length, 6)
  assert.deepEqual(
    state.injections.map((deps) => deps.join('+')),
    ['webServer'],
  )
  for (const cleanup of state.effects.reverse()) {
    if (typeof cleanup === 'function') cleanup()
  }
})
