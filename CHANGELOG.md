# Changelog

All notable changes to `@gxx-labs/browser-use-dsh` are recorded here.
The plugin targets DSH Desktop and is installed with `plugin_manager install_bundle`.

## 0.8.1 — 2026-10-18

- AX nodes now include `checked` (from `aria-checked`, checkbox/radio state) and `pressed`
  (`aria-pressed`) so switch/toggle state can be read before acting.

## 0.8.0 — 2026-10-18

Annotation send now goes to the chat composer instead of the clipboard.

### Added

- A hidden `ComposerBridge` component registered in `conversation.composer.dock` captures the
  public `inputActions` API (`captureInsertion` / `insertText` / `setDraft` / `submit`) from
  `ctx.uiSession` standard props.
- The annotation flow writes `[Browser Use 批注 · N 条]` into a page outbox; the Client polls
  it every 600 ms, inserts the text into the current chat draft and calls `submit()`. If the
  composer API is unavailable or insertion fails, it falls back to copying to the clipboard and
  reports the actual status back to the page toast (`sent` / `copied` / `failed`).
- Added `@deepseek-ai/dsh-client-ui-conversation` to `dsh.client.inject` for activation order.

## 0.7.0 — 2026-10-18

Codex-like element annotation flow (local install, not yet published to npm).

### Added

- The floating **⌖ 选取元素** button now opens a Codex-style annotation flow instead of
  copying immediately:
  - hover a page element, click to lock it with a blue outline and a numbered blue marker;
  - an anchored white comment pill appears (`添加评论…`) with Enter = add, Ctrl+Enter =
    add and send all, Esc = cancel;
  - multiple annotations are kept in a bottom `正在批注 · N` bar with 发送 / 清除;
  - sending copies `[Browser Use 批注 · N 条]` with every comment, `选择器`, `角色`,
    `可读名`, `文本`, `位置`, and a new **`上下文`** line (nearest card/section heading,
    e.g. `AI Native 应用开发底座`) to the clipboard, then resets the annotations;
  - overlays reposition on scroll/resize and the old single-shot pick host is removed.
- This fixes the earlier ambiguity where six identical Harness card footers could not be
  distinguished from the copied reference alone.

## 0.6.0 — 2026-10-18

Feature-complete plus the in-page element picker (local install, not yet published to npm).

### Added

- Page-injected **「⌖ 选取元素」** floating button (Shadow DOM, top-right of the current
  page): hover highlight, click to copy a `[Browser Use 元素引用]` block (URL / CSS selector /
  role / accessible name / text / box / link) for asking questions or requesting edits in the
  chat composer. Esc cancels; `config.floatingPickButton: false` disables it. The bridge meta
  and `/v1/config` now carry feature flags, and the Client re-injects the button after
  navigation.
- `README`/`CHANGELOG`/`docs/probe.md` and the `0.6.0` version bump.

### Notes

- DSH's official Browser tab toolbar has **no extension slot** (only tab menu, document/file
  actions and guide seats); the page-level button is the closest supported placement. Adding
  a real toolbar button would require changing the official `ui-sidebar-browser`/app.asar.

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
