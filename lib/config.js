/**
 * Host-side configuration.
 *
 * DSH plugins receive the row `config` verbatim. We validate and normalize it
 * here without importing any `@deepseek-ai/*` package, so the plugin keeps a
 * zero-runtime-dependency host half.
 */

export const DEFAULTS = Object.freeze({
  /** Loopback port for the Host <-> Client bridge. */
  bridgePort: 8817,
  /** Page origins allowed to fetch the bridge config (Desktop app origin). */
  allowedOrigins: ['dsh-app://app'],
  /** Origins that skip the new-origin approval prompt. Empty by default. */
  trustedOrigins: [],
  /** Add a system-prompt section describing Browser Use. */
  promptSection: true,
  /** Reuse an existing matching Sidebar browser tab when opening a URL. */
  openReuseTab: true,
  /** Approval policy for sensitive actions: sensitive (default), all, off. */
  approvalPolicy: 'sensitive',
  /** Approval policy for first access to a new origin: ask (default) or off. */
  originApproval: 'ask',
  /** Per-command timeout for a Client round trip. */
  commandTimeoutMs: 30000,
  /** Loopback CDP port used for screenshots (requires --remote-debugging-port). */
  cdpPort: 9222,
  /** Show the in-page agent cursor/target highlight while acting. */
  visualFeedback: true,
  /** Inject a small "选取元素" button into the current web page. */
  floatingPickButton: true,
  /** Long-poll hold time for Client command polling. */
  pollTimeoutMs: 25000,
  /** Hard limit for bridge request bodies. */
  maxBodyBytes: 128 * 1024,
})

const BOOLEAN_KEYS = ['promptSection', 'openReuseTab', 'visualFeedback', 'floatingPickButton']
const ENUM_KEYS = {
  approvalPolicy: ['sensitive', 'all', 'off'],
  originApproval: ['ask', 'off'],
}
const INT_KEYS = {
  bridgePort: [0, 65535],
  cdpPort: [1024, 65535],
  commandTimeoutMs: [1000, 120000],
  pollTimeoutMs: [1000, 55000],
  maxBodyBytes: [1024, 1024 * 1024],
}

function toInt(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === 'string' && /^\d+$/u.test(value.trim())) return Number.parseInt(value.trim(), 10)
  return undefined
}

/**
 * Normalize raw plugin config.
 * @param {unknown} input
 * @returns {{ config: typeof DEFAULTS, warnings: string[] }}
 */
export function normalizeConfig(input) {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const warnings = []
  const config = { ...DEFAULTS, allowedOrigins: [...DEFAULTS.allowedOrigins], trustedOrigins: [...DEFAULTS.trustedOrigins] }

  for (const key of BOOLEAN_KEYS) {
    if (raw[key] === undefined) continue
    if (typeof raw[key] === 'boolean') config[key] = raw[key]
    else warnings.push(`config.${key} must be a boolean; using default ${DEFAULTS[key]}`)
  }

  for (const [key, allowed] of Object.entries(ENUM_KEYS)) {
    if (raw[key] === undefined) continue
    if (allowed.includes(raw[key])) config[key] = raw[key]
    else warnings.push(`config.${key} must be one of ${allowed.join(', ')}; using default ${DEFAULTS[key]}`)
  }

  for (const [key, [min, max]] of Object.entries(INT_KEYS)) {
    if (raw[key] === undefined) continue
    const value = toInt(raw[key])
    if (value === undefined || value < min || value > max) {
      warnings.push(`config.${key} must be an integer in [${min}, ${max}]; using default ${DEFAULTS[key]}`)
      continue
    }
    config[key] = value
  }

  if (Array.isArray(raw.allowedOrigins)) {
    const origins = raw.allowedOrigins
      .filter((origin) => typeof origin === 'string' && /^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/iu.test(origin.trim()))
      .map((origin) => origin.trim())
    if (origins.length > 0) config.allowedOrigins = origins
    else warnings.push('config.allowedOrigins has no valid URL origin; using default')
  } else if (raw.allowedOrigins !== undefined) {
    warnings.push('config.allowedOrigins must be an array of origins; using default')
  }

  if (Array.isArray(raw.trustedOrigins)) {
    const origins = raw.trustedOrigins
      .filter((origin) => typeof origin === 'string' && /^https?:\/\/[^\s]+$/iu.test(origin.trim()))
      .map((origin) => origin.trim().replace(/\/$/u, ''))
    config.trustedOrigins = origins
  } else if (raw.trustedOrigins !== undefined) {
    warnings.push('config.trustedOrigins must be an array of http(s) origins; using default')
  }

  // The Desktop renderer origin is required for the Client config fallback.
  if (!config.allowedOrigins.includes('dsh-app://app')) {
    config.allowedOrigins = [...config.allowedOrigins, 'dsh-app://app']
    warnings.push('config.allowedOrigins is missing the Desktop origin dsh-app://app; added automatically')
  }

  for (const key of Object.keys(raw)) {
    if (!(key in DEFAULTS)) warnings.push(`unknown config key "${key}" is ignored`)
  }

  return { config, warnings }
}
