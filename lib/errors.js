/**
 * Error helpers shared by the Host half.
 *
 * Errors that cross the bridge keep a stable machine-readable `code` so tools
 * can return actionable diagnostics instead of throwing raw exceptions.
 */

export class BrowserUseError extends Error {
  /**
   * @param {string} code stable error code, e.g. E_CLIENT_OFFLINE
   * @param {string} message human readable message
   * @param {string} [hint] optional next-step hint
   */
  constructor(code, message, hint) {
    super(message || code || 'browser-use error')
    this.name = 'BrowserUseError'
    this.code = code || 'E_BROWSER_USE'
    if (hint) this.hint = hint
  }
}

/** Convert any thrown value into a JSON-safe payload. */
export function toErrorPayload(error) {
  if (error instanceof BrowserUseError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.hint ? { hint: error.hint } : {}),
    }
  }
  return {
    code: 'E_INTERNAL',
    message: error && error.message ? String(error.message) : String(error),
  }
}

/** Stable JSON body for tool results. */
export function errorResult(error) {
  return { ok: false, ...toErrorPayload(error) }
}

/** True when an abort signal cancelled the operation. */
export function isAbortError(error) {
  return Boolean(
    error &&
    (error.name === 'AbortError' ||
      error.code === 'ABORT_ERR' ||
      error.code === 'E_CANCELLED'),
  )
}
