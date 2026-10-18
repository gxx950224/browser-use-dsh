# Changelog

All notable changes to `@gxx-labs/browser-use-dsh` are recorded here.
The plugin targets DSH Desktop and is installed with `plugin_manager install_bundle`.

## 0.5.0 — 2026-10-18

Feature-complete C1–C4 milestone (local install, not yet published to npm).

### Added

- C1: loopback Host↔Client bridge (random token, CORS, long-poll, reconnect), Sidebar
  webview discovery through light DOM + open shadow roots, `browser_use_status/open/read`,
  AX-style node list with stable `eN` refs, CSS-pixel boxes and `generation`.
- C2: `browser_use_act` (click / fill / type / press / scroll / hover / select / check /
  uncheck / reload / back / forward / waitFor), `expectedGeneration` ref-staleness checks
  (`E_REF_STALE`), Origin approval, sensitive-action approval, `trustedOrigins` allowlist,
  `browser_use_verify`.
- C3: `browser_use_screenshot` through loopback CDP (`type:"webview"` only) with image
  attachment rendering; in-page agent cursor, target highlight, label and click ripple that
  respect `prefers-reduced-motion`.
- C4: self-registered `browser-use-panel` Sidebar tab (`sidebar.right.pane.tab`) with
  six-state glow, page info, recent actions, takeover/return control, `browser_use_panel`
  tool, `uiState` updates around approvals and an `E_TAKEOVER` guard while the user is in
  control.
- Config: `bridgePort`, `allowedOrigins`, `trustedOrigins`, `promptSection`, `openReuseTab`,
  `approvalPolicy`, `originApproval`, `cdpPort`, `visualFeedback`, `commandTimeoutMs`,
  `pollTimeoutMs`, `maxBodyBytes`.
- Docs: `README.md`, `docs/probe.md` live-probe table, `docs/compatibility.md`,
  `examples/test-page.html` + `examples/serve-test-page.mjs` for local E2E, and
  `scripts/verify-pack.mjs` for a `npm pack --dry-run` artifact check.
- C5: local E2E passed (open → read → fill/type/select/check/click → verify → reload →
  type → waitFor → stale-ref); temporary test override bundle was removed afterwards and
  the default approval policy was restored.

### Fixed during real-machine testing

- `links` reader was not self-contained inside `executeJavaScript` (`E_EXECUTE_FAILED`).
- page hot reload created new renderer ids and briefly produced `E_MULTIPLE_RENDERERS`;
  renderer ids now persist in `sessionStorage` and routing prefers the focused window.
- sidebar tab registration requires `title` to be a function.
- AX builder's `roleOf` referenced an outer `cleanText` helper, so pages containing inputs
  threw inside `executeJavaScript`; it now uses the page-local `normalize` helper.

### Known limitations

- Desktop only; the Web profile has no Sidebar browser webview.
- Actions are synthetic DOM events; pages that require `isTrusted` input may need C5 CDP input.
- Screenshots require DSH launched with `--remote-debugging-port=9222`.
- Approval is one-shot (`allowed-once/rejected/cancelled/unavailable`); there is no
  "always allow this site" API. Persistent site policy is expressed with `trustedOrigins`.
- No timeline export or E2E report generator yet.

## 0.1.0 — 2026-10-18

Initial repo scaffold (C1) — superseded by 0.5.0.
