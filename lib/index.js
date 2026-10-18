/**
 * Host half entry point for @gxx-labs/browser-use-dsh.
 *
 * Responsibilities in C1:
 * - normalize plugin config;
 * - own the loopback Host <-> Client bridge;
 * - register the read-only browser_use_* tools;
 * - inject the bridge descriptor into the Web index;
 * - add a concise system-prompt section.
 */

import { normalizeConfig } from './config.js'
import { BrowserBridge } from './bridge.js'
import { registerTools } from './tools.js'
import { SYSTEM_PROMPT } from './prompt.js'
import * as cdp from './cdp.js'

export const name = 'browser-use-dsh'
export const inject = ['tools']
export const PLUGIN_VERSION = '0.1.0'

/**
 * @param {any} ctx Cordis plugin context
 * @param {unknown} rawConfig row config from cordis.patch.yml
 */
export function apply(ctx, rawConfig) {
  const { config, warnings } = normalizeConfig(rawConfig)
  const logger = ctx && ctx.logger && typeof ctx.logger === 'object' ? ctx.logger : {}
  for (const warning of warnings) {
    logger.warn?.(`[browser-use-dsh] ${warning}`)
  }

  const bridge = new BrowserBridge({ config, logger })

  const disposeTools = registerTools(ctx, {
    bridge,
    config,
    logger,
    version: PLUGIN_VERSION,
    cdp,
  })
  if (typeof disposeTools === 'function') {
    ctx.effect(() => () => {
      try {
        disposeTools()
      } catch {
        /* ignore */
      }
    })
  }

  // Start listening whether or not the Web page is open yet. Tools report
  // E_BRIDGE_UNAVAILABLE until it succeeds, and status keeps the reason.
  void bridge.start().catch((error) => {
    logger.error?.(
      `[browser-use-dsh] bridge failed to start: ${error && error.message ? error.message : error}`,
    )
  })
  ctx.effect(() => () => {
    void bridge.stop()
  })

  if (config.promptSection) {
    ctx.inject(['systemPrompt'], (systemCtx) =>
      systemCtx.effect(() =>
        systemCtx.systemPrompt.section({
          name: 'browser-use-dsh',
          order: 60,
          text: SYSTEM_PROMPT,
        }),
      ),
    )
  }

  // Deliver the bridge port/token through a meta tag. The Client falls back to
  // GET /v1/config when the tag is missing (for example during a hot reload).
  ctx.inject(['webServer'], (webCtx) =>
    webCtx.effect(() => {
      const dispose = webCtx.webServer.tapIndex((html) => bridge.injectMeta(html))
      return () => {
        try {
          dispose()
        } catch {
          /* ignore */
        }
      }
    }),
  )
}
