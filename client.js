window.__ModuleLoader__.load({
  id: '@gxx-labs/browser-use-dsh',
  factory(require) {
    'use strict'

    /* ------------------------------------------------------------------ *
     * Constants
     * ------------------------------------------------------------------ */

    var META_NAME = 'dsh-browser-use'
    var DEFAULT_PORT = 8817
    var PROTOCOL_VERSION = 1
    var WEBVIEW_SELECTOR = 'webview[data-sidebar-browser-frame="webview"]'
    var OPEN_TIMEOUT_MS = 20000
    var LOAD_TIMEOUT_MS = 30000
    var EXECUTE_TIMEOUT_MS = 20000
    var RECONNECT_MIN_MS = 250
    var RECONNECT_MAX_MS = 5000
    var PANEL_ID = 'browser-use-dsh-panel'
    var PANEL_KIND = 'browser-use-panel'
    var PANEL_TITLE = 'Browser Use'

    /* ------------------------------------------------------------------ *
     * Panel store (shared by the bridge loop and the Sidebar panel)
     * ------------------------------------------------------------------ */

    var panelState = {
      state: 'idle',
      message: '等待连接',
      url: '',
      title: '',
      generation: 'g-0',
      takeover: false,
      steps: [],
      registered: false,
      updatedAt: 0,
    }
    var panelListeners = new Set()
    var composerInputActions = null

    function setPanelState(patch) {
      panelState = Object.assign({}, panelState, patch || {}, { updatedAt: Date.now() })
      for (var listener of panelListeners) {
        try {
          listener(panelState)
        } catch (error) {
          /* ignore listener errors */
        }
      }
    }

    function pushPanelStep(text, status) {
      var steps = (panelState.steps || []).slice(0, 7)
      steps.unshift({ text: String(text || ''), status: status || 'done', time: Date.now() })
      setPanelState({ steps: steps.slice(0, 8) })
    }

    function subscribePanel(listener) {
      panelListeners.add(listener)
      return function () {
        panelListeners.delete(listener)
      }
    }

    function toggleTakeover() {
      var next = !panelState.takeover
      setPanelState({
        takeover: next,
        state: next ? 'paused' : 'idle',
        message: next ? '你已接管浏览器，Agent 已暂停' : '已交还 Agent，需要重新读取页面',
      })
      pushPanelStep(next ? '用户接管浏览器' : '用户交还浏览器', next ? 'paused' : 'done')
      return next
    }

    var PANEL_STATE_LABELS = {
      idle: '空闲',
      observing: '观察中',
      acting: '操作中',
      awaiting: '等待审批',
      success: '成功',
      failed: '失败',
      paused: '已接管',
    }

    var PANEL_CSS =
      '.bu8f3a2c71_root{position:relative;height:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:10px;padding:14px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border-radius:var(--dsw-radius-md);overflow:auto;font:12px/1.55 "Segoe UI","Microsoft YaHei UI","PingFang SC",system-ui,sans-serif}' +
      '.bu8f3a2c71_root::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l1),inset 0 0 34px -16px var(--bu-glow,transparent);opacity:.95;transition:box-shadow .4s ease,opacity .4s ease}' +
      '.bu8f3a2c71_s_observing{--bu-glow:var(--dsw-alias-interactive-primary)}' +
      '.bu8f3a2c71_s_observing::after{animation:bu8f3a2c71_breathe 2.6s ease-in-out infinite}' +
      '.bu8f3a2c71_s_acting{--bu-glow:color-mix(in srgb,var(--dsw-alias-interactive-primary) 70%,var(--dsw-alias-state-success))}' +
      '.bu8f3a2c71_s_acting::after{animation:bu8f3a2c71_pulse 1.4s ease-in-out infinite}' +
      '.bu8f3a2c71_s_awaiting{--bu-glow:var(--dsw-alias-state-warning)}' +
      '.bu8f3a2c71_s_awaiting::after{animation:bu8f3a2c71_pulse 1.2s ease-in-out infinite}' +
      '.bu8f3a2c71_s_success{--bu-glow:var(--dsw-alias-state-success)}' +
      '.bu8f3a2c71_s_failed{--bu-glow:var(--dsw-alias-state-error)}' +
      '.bu8f3a2c71_s_paused{--bu-glow:var(--dsw-alias-label-secondary)}' +
      '.bu8f3a2c71_head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}' +
      '.bu8f3a2c71_dot{width:8px;height:8px;border-radius:50%;background:var(--bu-glow,var(--dsw-alias-label-tertiary));box-shadow:0 0 10px var(--bu-glow,transparent)}' +
      '.bu8f3a2c71_name{font-weight:600;font-size:var(--dsw-font-sm)}' +
      '.bu8f3a2c71_state{margin-left:auto;font-size:var(--dsw-font-xxs);color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1);border-radius:999px;padding:1px 8px}' +
      '.bu8f3a2c71_btn{margin-left:6px;height:26px;padding:0 10px;border-radius:var(--dsw-radius-sm);border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-elevated);color:var(--dsw-alias-label-primary);font:inherit;font-size:var(--dsw-font-xxs);cursor:pointer}' +
      '.bu8f3a2c71_btn:hover{background:var(--dsw-alias-bg-hover)}' +
      '.bu8f3a2c71_btn.on{color:var(--dsw-alias-state-warning);border-color:var(--dsw-alias-state-warning)}' +
      '.bu8f3a2c71_page{padding:10px 11px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-elevated)}' +
      '.bu8f3a2c71_title{font-size:var(--dsw-font-sm);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.bu8f3a2c71_url{margin-top:3px;font-size:var(--dsw-font-xxs);color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.bu8f3a2c71_steps{display:flex;flex-direction:column;gap:6px;min-height:0}' +
      '.bu8f3a2c71_step{display:flex;gap:7px;align-items:flex-start;font-size:var(--dsw-font-xxs);color:var(--dsw-alias-label-secondary)}' +
      '.bu8f3a2c71_sd{width:6px;height:6px;border-radius:50%;margin-top:5px;background:var(--dsw-alias-label-tertiary);flex:0 0 6px}' +
      '.bu8f3a2c71_sd_ok{background:var(--dsw-alias-state-success)}' +
      '.bu8f3a2c71_sd_failed{background:var(--dsw-alias-state-error)}' +
      '.bu8f3a2c71_sd_paused{background:var(--dsw-alias-state-warning)}' +
      '.bu8f3a2c71_empty{padding:10px;border:1px dashed var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-tertiary);font-size:var(--dsw-font-xxs)}' +
      '.bu8f3a2c71_foot{margin-top:auto;font-size:var(--dsw-font-xxs);color:var(--dsw-alias-label-tertiary)}' +
      '@keyframes bu8f3a2c71_breathe{0%,100%{opacity:.45}50%{opacity:1}}' +
      '@keyframes bu8f3a2c71_pulse{0%,100%{opacity:.5}50%{opacity:1}}' +
      '@media (prefers-reduced-motion: reduce){.bu8f3a2c71_root::after{animation:none!important}}'

    /* ------------------------------------------------------------------ *
     * Small utilities
     * ------------------------------------------------------------------ */

    function sleep(ms) {
      return new Promise(function (resolve) {
        setTimeout(resolve, ms)
      })
    }

    function makeRendererId() {
      try {
        var saved = sessionStorage.getItem('dsh-browser-use-renderer')
        if (saved) return saved
      } catch (error) {
        /* storage may be unavailable */
      }
      var id
      try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
          id = crypto.randomUUID()
        }
      } catch (error) {
        id = null
      }
      if (!id) id = 'renderer-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
      try {
        sessionStorage.setItem('dsh-browser-use-renderer', id)
      } catch (error) {
        /* ignore */
      }
      return id
    }

    function safeCall(fn, fallback) {
      try {
        return fn()
      } catch (error) {
        return fallback
      }
    }

    function cleanText(value) {
      return String(value === undefined || value === null ? '' : value)
        .replace(/\s+/g, ' ')
        .trim()
    }

    function errorInfo(code, message, hint) {
      var error = { code: code || 'E_CLIENT', message: message || code || 'client error' }
      if (hint) error.hint = hint
      return error
    }

    function failure(code, message, hint) {
      return { ok: false, error: errorInfo(code, message, hint) }
    }

    function success(data) {
      return { ok: true, data: data }
    }

    /* ------------------------------------------------------------------ *
     * Bridge descriptor + HTTP helpers
     * ------------------------------------------------------------------ */

    var bridgeInfo = null

    function decodeBase64Json(text) {
      try {
        var decoded = atob(String(text || ''))
        return JSON.parse(decoded)
      } catch (error) {
        return null
      }
    }

    function readMetaDescriptor() {
      var meta = document.querySelector('meta[name="' + META_NAME + '"]')
      if (!meta) return null
      var content = meta.getAttribute('content')
      var value = decodeBase64Json(content)
      if (!value || !value.token || !value.port) return null
      return {
        version: value.version || PROTOCOL_VERSION,
        port: Number(value.port),
        token: String(value.token),
        features: value.features && typeof value.features === 'object' ? value.features : { floatingPickButton: true },
      }
    }

    async function fetchJson(url, options) {
      var response = await fetch(url, options)
      var status = response.status
      var payload = null
      try {
        payload = await response.json()
      } catch (error) {
        payload = null
      }
      return { status: status, payload: payload }
    }

    async function resolveBridgeInfo() {
      var meta = readMetaDescriptor()
      if (meta) {
        bridgeInfo = meta
        return meta
      }
      var ports = []
      if (bridgeInfo && bridgeInfo.port) ports.push(bridgeInfo.port)
      if (ports.indexOf(DEFAULT_PORT) === -1) ports.push(DEFAULT_PORT)
      for (var i = 0; i < ports.length; i += 1) {
        var port = ports[i]
        try {
          var result = await fetchJson('http://127.0.0.1:' + port + '/v1/config', {
            mode: 'cors',
            cache: 'no-store',
            credentials: 'omit',
          })
          if (result.status === 200 && result.payload && result.payload.token) {
            bridgeInfo = {
              version: result.payload.version || PROTOCOL_VERSION,
              port: Number(result.payload.port) || port,
              token: String(result.payload.token),
              features:
                result.payload.features && typeof result.payload.features === 'object'
                  ? result.payload.features
                  : { floatingPickButton: true },
            }
            return bridgeInfo
          }
        } catch (error) {
          /* try the next port */
        }
      }
      return null
    }

    function bridgeBase(info) {
      return 'http://127.0.0.1:' + info.port
    }

    function authHeaders(info) {
      return {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + info.token,
      }
    }

    function isAuthFailure(error) {
      return Boolean(error && (error.code === 'E_UNAUTHORIZED' || error.code === 'E_NOT_HANDSHAKEN'))
    }

    /* ------------------------------------------------------------------ *
     * Sidebar browser webview discovery
     * ------------------------------------------------------------------ */

    function collectWebviews(root, out) {
      var results = out || []
      if (!root || typeof root.querySelectorAll !== 'function') return results
      var matches
      try {
        matches = root.querySelectorAll(WEBVIEW_SELECTOR)
      } catch (error) {
        matches = []
      }
      for (var i = 0; i < matches.length; i += 1) {
        if (results.indexOf(matches[i]) === -1) results.push(matches[i])
      }
      var all
      try {
        all = root.querySelectorAll('*')
      } catch (error) {
        all = []
      }
      for (var j = 0; j < all.length; j += 1) {
        var element = all[j]
        if (element.shadowRoot) collectWebviews(element.shadowRoot, results)
      }
      return results
    }

    function isVisible(element) {
      try {
        if (!element || !element.isConnected) return false
        var rect = element.getBoundingClientRect()
        if (rect.width < 2 || rect.height < 2) return false
        var style = window.getComputedStyle(element)
        if (!style) return false
        if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false
        return Number(style.opacity || '1') !== 0
      } catch (error) {
        return false
      }
    }

    function webviewUrl(webview) {
      try {
        return typeof webview.getURL === 'function' ? webview.getURL() : ''
      } catch (error) {
        return ''
      }
    }

    function webviewTitle(webview) {
      try {
        return typeof webview.getTitle === 'function' ? webview.getTitle() : ''
      } catch (error) {
        return ''
      }
    }

    function normalizeComparableUrl(value) {
      try {
        var url = new URL(value)
        url.hash = ''
        var text = url.toString()
        return text.replace(/\/$/u, '')
      } catch (error) {
        return String(value || '')
      }
    }

    function sameUrl(left, right) {
      return normalizeComparableUrl(left) === normalizeComparableUrl(right)
    }

    function findBestWebview(urlHint) {
      var webviews = collectWebviews(document)
      if (webviews.length === 0) return null
      var visible = webviews.filter(isVisible)
      var candidates = visible.length > 0 ? visible : webviews
      if (urlHint) {
        for (var i = 0; i < candidates.length; i += 1) {
          if (sameUrl(webviewUrl(candidates[i]), urlHint)) return candidates[i]
        }
      }
      for (var j = 0; j < candidates.length; j += 1) {
        var url = webviewUrl(candidates[j])
        if (url && url !== 'about:blank') return candidates[j]
      }
      return candidates[0] || null
    }

    async function waitFor(predicate, timeoutMs, intervalMs) {
      var started = Date.now()
      var interval = intervalMs || 150
      while (Date.now() - started <= timeoutMs) {
        var value = safeCall(predicate, null)
        if (value) return value
        await sleep(interval)
      }
      return null
    }

    function openInBrowserTab(ctx, url) {
      if (!ctx || !ctx.sidebarRight || typeof ctx.sidebarRight.openTab !== 'function') {
        throw new Error('sidebarRight service is unavailable')
      }
      return ctx.sidebarRight.openTab('browser', {
        params: { url: url },
        revealIfOpened: true,
      })
    }

    function waitForLoad(webview, timeoutMs) {
      return new Promise(function (resolve) {
        var done = false
        var timer = null
        function cleanup() {
          try {
            webview.removeEventListener('did-stop-loading', onStop)
            webview.removeEventListener('did-fail-load', onFail)
          } catch (error) {
            /* ignore */
          }
          if (timer) clearTimeout(timer)
        }
        function finish(ok, error) {
          if (done) return
          done = true
          cleanup()
          resolve(ok ? { ok: true } : { ok: false, error: error })
        }
        function onStop() {
          finish(true)
        }
        function onFail(event) {
          finish(false, {
            code: 'E_LOAD_FAILED',
            message:
              'page load failed: ' +
              cleanText((event && (event.errorDescription || event.errorCode)) || 'unknown error'),
          })
        }
        timer = setTimeout(function () {
          finish(false, { code: 'E_LOAD_TIMEOUT', message: 'page load timed out after ' + timeoutMs + 'ms' })
        }, timeoutMs)
        try {
          webview.addEventListener('did-stop-loading', onStop)
          webview.addEventListener('did-fail-load', onFail)
        } catch (error) {
          /* fall back to the loading probe below */
        }
        var loading = false
        try {
          loading = typeof webview.isLoading === 'function' ? Boolean(webview.isLoading()) : false
        } catch (error) {
          loading = false
        }
        if (!loading) finish(true)
      })
    }

    function executeInPage(webview, source, timeoutMs) {
      var timeout = timeoutMs || EXECUTE_TIMEOUT_MS
      return new Promise(function (resolve, reject) {
        var done = false
        var timer = setTimeout(function () {
          if (done) return
          done = true
          reject(errorInfo('E_EXECUTE_TIMEOUT', 'executeJavaScript timed out after ' + timeout + 'ms'))
        }, timeout)
        try {
          var result = webview.executeJavaScript(source, true)
          Promise.resolve(result).then(
            function (value) {
              if (done) return
              done = true
              clearTimeout(timer)
              resolve(value)
            },
            function (error) {
              if (done) return
              done = true
              clearTimeout(timer)
              reject(errorInfo('E_EXECUTE_FAILED', 'executeJavaScript failed: ' + cleanText(error && error.message)))
            },
          )
        } catch (error) {
          if (!done) {
            done = true
            clearTimeout(timer)
            reject(errorInfo('E_EXECUTE_FAILED', 'executeJavaScript failed: ' + cleanText(error && error.message)))
          }
        }
      })
    }

    var lastFloatingUrl = ''
    var lastFloatingError = ''

    async function ensureFloatingButton() {
      try {
        if (!bridgeInfo || !bridgeInfo.token) return
        var features = bridgeInfo.features || {}
        if (features.floatingPickButton === false) {
          setPanelState({ pickButton: { enabled: false } })
          return
        }
        var target = findBestWebview(null)
        if (!target) return
        var result = await executeInPage(target, '(' + floatingAnnotator.toString() + ')()', 5000)
        setPanelState({
          pickButton: {
            enabled: true,
            url: webviewUrl(target),
            injected: Boolean(result && result.injected),
            reused: Boolean(result && result.reused),
          },
        })
        if (result && (result.injected || result.reused) && lastFloatingUrl !== webviewUrl(target)) {
          lastFloatingUrl = webviewUrl(target)
          pushPanelStep('批注选取按钮已注入', 'done')
        }
      } catch (error) {
        var message = String((error && error.message) || error)
        setPanelState({ pickButton: { enabled: true, error: message.slice(0, 200) } })
        if (message !== lastFloatingError) {
          lastFloatingError = message
          pushPanelStep('选取按钮注入失败: ' + message.slice(0, 80), 'failed')
        }
      }
    }

    function outboxReader() {
      var element = document.getElementById('dsh-browser-use-outbox')
      if (!element) return null
      var text = element.textContent || ''
      element.textContent = ''
      return text || null
    }

    function outboxStatusWriter(status) {
      var element = document.getElementById('dsh-browser-use-outbox-status')
      if (!element) return false
      element.textContent = String(status || '')
      return true
    }

    async function deliverAnnotation(text) {
      if (!text) return 'failed'
      try {
        if (
          composerInputActions &&
          typeof composerInputActions.submit === 'function'
        ) {
          var span =
            typeof composerInputActions.captureInsertion === 'function'
              ? composerInputActions.captureInsertion()
              : null
          var inserted =
            span && typeof composerInputActions.insertText === 'function'
              ? composerInputActions.insertText(text, span)
              : false
          if (!inserted && typeof composerInputActions.setDraft === 'function') {
            composerInputActions.setDraft(text)
            inserted = true
          }
          if (inserted) {
            await new Promise(function (resolve) {
              window.setTimeout(resolve, 30)
            })
            composerInputActions.submit()
            pushPanelStep('批注已发送到聊天框', 'done')
            return 'sent'
          }
        }
      } catch (error) {
        pushPanelStep('批注发送失败: ' + cleanText(error && error.message).slice(0, 80), 'failed')
      }
      try {
        await navigator.clipboard.writeText(text)
        pushPanelStep('批注已复制到剪贴板', 'paused')
        return 'copied'
      } catch (error) {
        pushPanelStep('批注复制失败', 'failed')
        return 'failed'
      }
    }

    async function pumpAnnotationOutbox() {
      if (!bridgeInfo) return
      var target = findBestWebview(null)
      if (!target) return
      try {
        var raw = await executeInPage(target, '(' + outboxReader.toString() + ')()', 3000)
        if (!raw) return
        var payload
        try {
          payload = JSON.parse(raw)
        } catch (error) {
          return
        }
        if (!payload || payload.type !== 'browser-use-annotation' || typeof payload.text !== 'string') return
        var status = await deliverAnnotation(payload.text)
        await executeInPage(
          target,
          '(' + outboxStatusWriter.toString() + ')(' + JSON.stringify(status) + ')',
          3000,
        )
      } catch (error) {
        /* page may be navigating */
      }
    }

    /* ------------------------------------------------------------------ *
     * Page-side readers (self-contained; stringified into the page)
     * ------------------------------------------------------------------ */

    function axBuilder(options) {
      var maxNodes = (options && options.maxNodes) || 200
      var nodes = []
      var count = 0
      var refSeq = 0
      var SKIP = {
        SCRIPT: 1,
        STYLE: 1,
        NOSCRIPT: 1,
        TEMPLATE: 1,
        META: 1,
        LINK: 1,
        HEAD: 1,
        TITLE: 1,
      }
      var ROLE = {
        A: 'link',
        BUTTON: 'button',
        INPUT: 'textbox',
        TEXTAREA: 'textbox',
        SELECT: 'combobox',
        OPTION: 'option',
        IMG: 'img',
        H1: 'heading',
        H2: 'heading',
        H3: 'heading',
        H4: 'heading',
        H5: 'heading',
        H6: 'heading',
        NAV: 'navigation',
        MAIN: 'main',
        HEADER: 'banner',
        FOOTER: 'contentinfo',
        ASIDE: 'complementary',
        FORM: 'form',
        TABLE: 'table',
        TR: 'row',
        TH: 'columnheader',
        TD: 'cell',
        UL: 'list',
        OL: 'list',
        LI: 'listitem',
        LABEL: 'label',
      }
      var INPUT_ROLES = {
        checkbox: 'checkbox',
        radio: 'radio',
        range: 'slider',
        button: 'button',
        submit: 'button',
        reset: 'button',
        search: 'searchbox',
        email: 'textbox',
        password: 'textbox',
        number: 'spinbutton',
        tel: 'textbox',
        url: 'textbox',
      }

      function normalize(value, limit) {
        return String(value === undefined || value === null ? '' : value)
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, limit || 120)
      }

      function isInteractive(element) {
        var tag = element.tagName
        if (tag === 'A' || tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'OPTION') {
          return true
        }
        if (element.hasAttribute('tabindex')) return true
        if (element.hasAttribute('onclick')) return true
        if (element.isContentEditable) return true
        var role = element.getAttribute('role')
        return (
          role === 'button' ||
          role === 'link' ||
          role === 'checkbox' ||
          role === 'radio' ||
          role === 'tab' ||
          role === 'menuitem' ||
          role === 'switch' ||
          role === 'textbox'
        )
      }

      function roleOf(element) {
        var explicit = element.getAttribute('role')
        if (explicit) return explicit
        var tag = element.tagName
        if (tag === 'INPUT') {
          var type = normalize((element.getAttribute('type') || 'text').toLowerCase(), 32)
          return INPUT_ROLES[type] || 'textbox'
        }
        return ROLE[tag] || (isInteractive(element) ? 'button' : 'generic')
      }

      function isVisible(element) {
        try {
          var style = window.getComputedStyle(element)
          if (!style) return false
          if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false
          if (Number(style.opacity) === 0) return false
          var rect = element.getBoundingClientRect()
          if (rect.width < 1 || rect.height < 1) return false
          if (rect.bottom < -2 || rect.right < -2) return false
          return true
        } catch (error) {
          return false
        }
      }

      function nameOf(element) {
        var aria = element.getAttribute('aria-label')
        if (aria) return normalize(aria)
        var labelledby = element.getAttribute('aria-labelledby')
        if (labelledby) {
          try {
            var parts = labelledby
              .split(/\s+/)
              .map(function (id) {
                var node = document.getElementById(id)
                return node ? normalize(node.innerText || node.textContent) : ''
              })
              .filter(Boolean)
            if (parts.length > 0) return parts.join(' ')
          } catch (error) {
            /* ignore */
          }
        }
        var tag = element.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
          var placeholder = element.getAttribute('placeholder')
          if (placeholder) return normalize(placeholder)
          var alt = element.getAttribute('alt')
          if (alt) return normalize(alt)
          var name = element.getAttribute('name')
          if (name) return normalize(name)
        }
        var title = element.getAttribute('title')
        if (title) return normalize(title)
        var altText = element.getAttribute('alt')
        if (altText) return normalize(altText)
        var text = normalize(element.innerText || element.textContent)
        if (text) return text
        var value = element.value
        if (typeof value === 'string' && value) return normalize(value)
        return ''
      }

      function fieldValue(element) {
        var tag = element.tagName
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') return undefined
        if (tag === 'INPUT' && String(element.type || '').toLowerCase() === 'password') return '[redacted]'
        return typeof element.value === 'string' ? element.value.slice(0, 200) : undefined
      }

      try {
        var stale = document.querySelectorAll('[data-dsh-bu-ref]')
        for (var s = 0; s < stale.length; s += 1) stale[s].removeAttribute('data-dsh-bu-ref')
      } catch (error) {
        /* ignore */
      }

      function walk(element) {
        if (count >= maxNodes) return
        if (!element || element.nodeType !== 1) return
        if (SKIP[element.tagName]) return
        if (!isVisible(element)) return
        var ref = 'e' + (++refSeq)
        try {
          element.setAttribute('data-dsh-bu-ref', ref)
        } catch (error) {
          /* ignore */
        }
        var rect = element.getBoundingClientRect()
        var node = {
          ref: ref,
          tag: element.tagName.toLowerCase(),
          role: roleOf(element),
          name: nameOf(element),
          interactive: isInteractive(element),
          box: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          },
        }
        var value = fieldValue(element)
        if (value !== undefined) node.value = value
        if (element.disabled === true) node.disabled = true
        nodes.push(node)
        count += 1
        var children = element.children
        for (var i = 0; i < children.length; i += 1) walk(children[i])
      }

      walk(document.body || document.documentElement)
      var pageText = ''
      try {
        pageText = (document.body ? document.body.innerText : '').replace(/\n{3,}/g, '\n\n').trim()
      } catch (error) {
        pageText = ''
      }
      return {
        ok: true,
        url: location.href,
        title: document.title,
        nodes: nodes,
        text: pageText,
        truncated: count >= maxNodes,
        viewport: {
          w: window.innerWidth,
          h: window.innerHeight,
          scrollX: window.scrollX,
          scrollY: window.scrollY,
        },
      }
    }

    function textReader(options) {
      var maxChars = (options && options.maxChars) || 20000
      var text = ''
      try {
        text = (document.body ? document.body.innerText : '').replace(/\n{3,}/g, '\n\n').trim()
      } catch (error) {
        text = ''
      }
      return {
        ok: true,
        url: location.href,
        title: document.title,
        text: text.slice(0, maxChars),
        truncated: text.length > maxChars,
      }
    }

    function linkReader(options) {
      var maxLinks = (options && options.maxLinks) || 200
      var links = []
      var anchors = document.querySelectorAll('a[href]')
      function normalize(value) {
        return String(value === undefined || value === null ? '' : value)
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 160)
      }
      for (var i = 0; i < anchors.length && links.length < maxLinks; i += 1) {
        var anchor = anchors[i]
        var rect = anchor.getBoundingClientRect()
        if (rect.width < 1 || rect.height < 1) continue
        links.push({
          text: normalize(anchor.innerText || anchor.textContent),
          href: anchor.href,
          box: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
        })
      }
      return { ok: true, url: location.href, title: document.title, links: links, truncated: links.length >= maxLinks }
    }

    function htmlReader(options) {
      var maxChars = (options && options.maxChars) || 20000
      var html = document.documentElement ? document.documentElement.outerHTML : ''
      return {
        ok: true,
        url: location.href,
        title: document.title,
        text: html.slice(0, maxChars),
        truncated: html.length > maxChars,
      }
    }

    /* ------------------------------------------------------------------ *
     * Page-side action + verification helpers
     * ------------------------------------------------------------------ */

    function targetResolver(args) {
      function normalize(value, limit) {
        return String(value === undefined || value === null ? '' : value)
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, limit || 160)
      }
      function isVisible(element) {
        try {
          if (!element || !element.isConnected) return false
          var style = window.getComputedStyle(element)
          if (!style) return false
          if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false
          if (Number(style.opacity) === 0) return false
          var rect = element.getBoundingClientRect()
          return rect.width >= 1 && rect.height >= 1
        } catch (error) {
          return false
        }
      }
      function roleOf(element) {
        var role = element.getAttribute('role')
        if (role) return role
        var tag = element.tagName
        var map = {
          A: 'link',
          BUTTON: 'button',
          INPUT: element.type === 'checkbox' || element.type === 'radio' ? element.type : 'textbox',
          TEXTAREA: 'textbox',
          SELECT: 'combobox',
          IMG: 'img',
        }
        return map[tag] || 'generic'
      }
      function nameOf(element) {
        var aria = element.getAttribute('aria-label')
        if (aria) return normalize(aria)
        var tag = element.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
          var placeholder = element.getAttribute('placeholder')
          if (placeholder) return normalize(placeholder)
          var nameAttr = element.getAttribute('name')
          if (nameAttr) return normalize(nameAttr)
          if (typeof element.value === 'string' && element.value) return normalize(element.value, 80)
        }
        var title = element.getAttribute('title')
        if (title) return normalize(title)
        var alt = element.getAttribute('alt')
        if (alt) return normalize(alt)
        return normalize(element.innerText || element.textContent)
      }
      function findTarget(target) {
        if (!target) return null
        if (target.ref && /^[A-Za-z0-9_-]+$/.test(String(target.ref))) {
          return document.querySelector('[data-dsh-bu-ref="' + target.ref + '"]')
        }
        if (target.selector) {
          try {
            var listed = document.querySelectorAll(target.selector)
            for (var i = 0; i < listed.length; i += 1) if (isVisible(listed[i])) return listed[i]
            return listed[0] || null
          } catch (error) {
            return null
          }
        }
        if (target.text) {
          var wanted = normalize(target.text)
          if (!wanted) return null
          var nodes = document.querySelectorAll(
            'a,button,[role="button"],[role="link"],input,select,textarea,label,h1,h2,h3,h4,p,li,td,span,div',
          )
          for (var j = 0; j < nodes.length; j += 1) {
            var node = nodes[j]
            if (!isVisible(node)) continue
            var text = normalize(node.innerText || node.textContent)
            if (text && text.indexOf(wanted) >= 0) return node
          }
        }
        return null
      }
      function metaOf(element) {
        var rect = element.getBoundingClientRect()
        var meta = {
          ref: element.getAttribute('data-dsh-bu-ref') || '',
          tag: element.tagName.toLowerCase(),
          role: roleOf(element),
          name: nameOf(element),
          box: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
        }
        if (element.tagName === 'A' && element.href) meta.href = element.href
        return meta
      }
      var element = findTarget((args && args.target) || null)
      if (!element) {
        return {
          ok: false,
          error: {
            code: 'E_REF_STALE',
            message: 'target not found (page changed or ref expired)',
            hint: 'call browser_use_read again and use the new ref and generation',
          },
        }
      }
      return { ok: true, url: location.href, title: document.title, target: metaOf(element) }
    }

    function actRunner(args) {
      function normalize(value, limit) {
        return String(value === undefined || value === null ? '' : value)
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, limit || 160)
      }
      function isVisible(element) {
        try {
          if (!element || !element.isConnected) return false
          var style = window.getComputedStyle(element)
          if (!style) return false
          if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false
          var rect = element.getBoundingClientRect()
          return rect.width >= 1 && rect.height >= 1
        } catch (error) {
          return false
        }
      }
      function roleOf(element) {
        var role = element.getAttribute('role')
        if (role) return role
        var tag = element.tagName
        var map = { A: 'link', BUTTON: 'button', INPUT: 'textbox', TEXTAREA: 'textbox', SELECT: 'combobox', IMG: 'img' }
        return map[tag] || 'generic'
      }
      function nameOf(element) {
        return normalize(
          element.getAttribute('aria-label') ||
            element.getAttribute('title') ||
            element.getAttribute('placeholder') ||
            element.innerText ||
            element.textContent,
        )
      }
      function findTarget(target) {
        if (!target) return null
        if (target.ref && /^[A-Za-z0-9_-]+$/.test(String(target.ref))) {
          return document.querySelector('[data-dsh-bu-ref="' + target.ref + '"]')
        }
        if (target.selector) {
          try {
            var listed = document.querySelectorAll(target.selector)
            for (var i = 0; i < listed.length; i += 1) if (isVisible(listed[i])) return listed[i]
            return listed[0] || null
          } catch (error) {
            return null
          }
        }
        if (target.text) {
          var wanted = normalize(target.text)
          var nodes = document.querySelectorAll('a,button,[role="button"],[role="link"],input,label,h1,h2,h3,p,li,span,div')
          for (var j = 0; j < nodes.length; j += 1) {
            if (!isVisible(nodes[j])) continue
            if (normalize(nodes[j].innerText || nodes[j].textContent).indexOf(wanted) >= 0) return nodes[j]
          }
        }
        return null
      }
      function metaOf(element) {
        var rect = element.getBoundingClientRect()
        var meta = {
          ref: element.getAttribute('data-dsh-bu-ref') || '',
          tag: element.tagName.toLowerCase(),
          role: roleOf(element),
          name: nameOf(element),
          box: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
        }
        if (element.tagName === 'A' && element.href) meta.href = element.href
        return meta
      }
      function fire(element, type, init) {
        var payload = Object.assign({ bubbles: true, cancelable: true, composed: true }, init || {})
        var EventCtor = window.Event
        if (type.indexOf('pointer') === 0 && window.PointerEvent) EventCtor = window.PointerEvent
        else if (type.indexOf('key') === 0 && window.KeyboardEvent) EventCtor = window.KeyboardEvent
        else if (window.MouseEvent) EventCtor = window.MouseEvent
        var event
        try {
          event = new EventCtor(type, payload)
        } catch (error) {
          event = document.createEvent('Event')
          event.initEvent(type, true, true)
        }
        element.dispatchEvent(event)
      }
      function setNativeValue(element, value) {
        var proto = Object.getPrototypeOf(element)
        var descriptor = null
        while (proto) {
          var found = Object.getOwnPropertyDescriptor(proto, 'value')
          if (found && found.set) {
            descriptor = found
            break
          }
          proto = Object.getPrototypeOf(proto)
        }
        if (descriptor) descriptor.set.call(element, value)
        else element.value = value
        fire(element, 'input', {})
        fire(element, 'change', {})
      }
      function paintVisual(element, action) {
        try {
          var existing = document.getElementById('dsh-browser-use-visual')
          if (existing) existing.remove()
          var rect = element.getBoundingClientRect()
          if (rect.width < 2 || rect.height < 2) return
          var reduce =
            window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
          var host = document.createElement('div')
          host.id = 'dsh-browser-use-visual'
          host.style.cssText =
            'position:fixed;inset:0;pointer-events:none;z-index:2147483647;font-family:"Segoe UI","Microsoft YaHei",sans-serif;'
          var highlight = document.createElement('div')
          highlight.style.cssText =
            'position:fixed;left:' +
            (rect.x - 3) +
            'px;top:' +
            (rect.y - 3) +
            'px;width:' +
            (rect.width + 6) +
            'px;height:' +
            (rect.height + 6) +
            'px;border:2px solid rgba(124,160,255,.95);border-radius:10px;box-shadow:0 0 0 4px rgba(124,160,255,.16),0 0 28px rgba(124,160,255,.45);'
          var label = document.createElement('div')
          var verb =
            action === 'click'
              ? '点击'
              : action === 'fill'
                ? '填写'
                : action === 'type'
                  ? '输入'
                  : action === 'select'
                    ? '选择'
                    : action === 'check' || action === 'uncheck'
                      ? '切换'
                      : '操作'
          var name = ''
          try {
            name = String(
              element.getAttribute('aria-label') ||
                element.getAttribute('title') ||
                element.getAttribute('placeholder') ||
                element.innerText ||
                element.textContent ||
                '',
            )
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 40)
          } catch (error) {
            name = ''
          }
          label.textContent = verb + (name ? ' · ' + name : '')
          label.style.cssText =
            'position:fixed;left:' +
            Math.max(6, Math.min(window.innerWidth - 200, rect.x)) +
            'px;top:' +
            Math.max(6, rect.y - 28) +
            'px;background:rgba(15,22,36,.92);color:#dce8ff;border:1px solid rgba(140,170,255,.45);border-radius:7px;padding:3px 8px;font-size:12px;white-space:nowrap;box-shadow:0 10px 26px -12px rgba(0,0,0,.8),0 0 20px -10px rgba(120,150,255,.8);'
          var cursor = document.createElement('div')
          cursor.style.cssText =
            'position:fixed;left:' +
            (rect.x + rect.width / 2) +
            'px;top:' +
            (rect.y + rect.height / 2) +
            'px;width:26px;height:26px;transform:translate(-8px,-6px);opacity:' +
            (reduce ? '1' : '0') +
            ';transition:transform .5s cubic-bezier(.22,.82,.24,1),opacity .2s ease;filter:drop-shadow(0 0 9px rgba(120,160,255,.95));'
          cursor.innerHTML =
            '<svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4.2 2.8 L21.6 11.2 C22.6 11.7 22.5 13.1 21.5 13.4 L14.6 15.2 L11.1 21.9 C10.6 22.9 9.2 22.7 9 21.6 L3 4.4 C2.8 3.4 3.4 2.4 4.2 2.8 Z" fill="#f2f7ff" stroke="#9dc0ff" stroke-width="1.4" stroke-linejoin="round"/></svg>'
          var ring = document.createElement('div')
          ring.style.cssText =
            'position:fixed;left:' +
            (rect.x + rect.width / 2 - 24) +
            'px;top:' +
            (rect.y + rect.height / 2 - 24) +
            'px;width:48px;height:48px;border-radius:50%;border:2px solid rgba(160,190,255,.9);box-shadow:0 0 18px rgba(120,150,255,.55);'
          host.appendChild(highlight)
          host.appendChild(label)
          host.appendChild(cursor)
          host.appendChild(ring)
          if (action === 'click' || action === 'check' || action === 'uncheck') {
            var ripple = document.createElement('div')
            ripple.style.cssText =
              'position:fixed;left:' +
              (rect.x + rect.width / 2 - 15) +
              'px;top:' +
              (rect.y + rect.height / 2 - 15) +
              'px;width:30px;height:30px;border-radius:50%;border:2px solid rgba(170,200,255,.95);'
            host.appendChild(ripple)
            if (!reduce && typeof ripple.animate === 'function') {
              ripple.animate(
                [
                  { transform: 'scale(.35)', opacity: 1 },
                  { transform: 'scale(2.4)', opacity: 0 },
                ],
                { duration: 620, easing: 'ease-out' },
              )
            }
          }
          document.documentElement.appendChild(host)
          if (!reduce) {
            window.requestAnimationFrame(function () {
              cursor.style.opacity = '1'
              cursor.style.transform = 'translate(-13px,-13px)'
            })
          }
          window.setTimeout(function () {
            try {
              host.remove()
            } catch (error) {
              /* ignore */
            }
          }, 1800)
        } catch (error) {
          /* visual feedback is best effort; never block the action */
        }
      }
      var action = String((args && args.action) || '')
      var target = args && args.target
      var element = findTarget(target)
      var needsElement = action !== 'waitFor'
      if (needsElement && !element) {
        return {
          ok: false,
          error: {
            code: 'E_REF_STALE',
            message: 'target not found (page changed or ref expired)',
            hint: 'call browser_use_read again and use the new ref and generation',
          },
        }
      }
      if (element && typeof element.scrollIntoView === 'function') {
        try {
          element.scrollIntoView({ block: 'center', inline: 'center' })
        } catch (error) {
          /* ignore */
        }
      }
      if (args.visual !== false && element) paintVisual(element, action)
      if (action === 'click') {
        try {
          element.focus()
        } catch (error) {
          /* ignore */
        }
        fire(element, 'pointerover', {})
        fire(element, 'pointerenter', {})
        fire(element, 'pointerdown', { button: 0 })
        fire(element, 'mousedown', { button: 0 })
        fire(element, 'pointerup', { button: 0 })
        fire(element, 'mouseup', { button: 0 })
        if (typeof element.click === 'function') element.click()
        else fire(element, 'click', { button: 0 })
      } else if (action === 'fill') {
        try {
          element.focus()
        } catch (error) {
          /* ignore */
        }
        if (typeof element.select === 'function' && element.tagName === 'INPUT') element.select()
        setNativeValue(element, String(args.value === undefined ? '' : args.value))
      } else if (action === 'type') {
        try {
          element.focus()
        } catch (error) {
          /* ignore */
        }
        var current = typeof element.value === 'string' ? element.value : ''
        setNativeValue(element, current + String(args.value === undefined ? '' : args.value))
      } else if (action === 'press') {
        var key = String(args.key || '')
        var active = element || document.activeElement || document.body
        try {
          active.focus()
        } catch (error) {
          /* ignore */
        }
        var keyCode = { Enter: 13, Escape: 27, Tab: 9, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, Backspace: 8 }[key] || 0
        fire(active, 'keydown', { key: key, code: key, keyCode: keyCode })
        fire(active, 'keyup', { key: key, code: key, keyCode: keyCode })
      } else if (action === 'scroll') {
        var dx = Number.isFinite(Number(args.dx)) ? Number(args.dx) : 0
        var dy = Number.isFinite(Number(args.dy)) ? Number(args.dy) : 400
        if (element) {
          try {
            element.scrollIntoView({ block: 'center' })
          } catch (error) {
            /* ignore */
          }
        }
        try {
          window.scrollBy(dx, dy)
        } catch (error) {
          /* ignore */
        }
      } else if (action === 'hover') {
        fire(element, 'pointerover', {})
        fire(element, 'pointerenter', {})
        fire(element, 'mousemove', {})
      } else if (action === 'select') {
        try {
          element.focus()
        } catch (error) {
          /* ignore */
        }
        setNativeValue(element, String(args.value === undefined ? '' : args.value))
      } else if (action === 'check' || action === 'uncheck') {
        var desired = action === 'check'
        if (typeof element.checked === 'boolean') {
          if (element.checked !== desired) element.click()
        } else {
          element.setAttribute('aria-checked', desired ? 'true' : 'false')
          element.click()
        }
      }
      var result = {
        ok: true,
        action: action,
        url: location.href,
        title: document.title,
      }
      if (element) result.target = metaOf(element)
      if (action === 'scroll') {
        result.scroll = { x: window.scrollX, y: window.scrollY }
      }
      return result
    }

    function verifyRunner(args) {
      function normalize(value, limit) {
        return String(value === undefined || value === null ? '' : value)
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, limit || 500)
      }
      function normalizeUrl(value) {
        try {
          var url = new URL(value)
          url.hash = ''
          return url.toString().replace(/\/$/u, '')
        } catch (error) {
          return String(value || '')
        }
      }
      function isVisible(element) {
        try {
          var style = window.getComputedStyle(element)
          if (!style || style.display === 'none' || style.visibility === 'hidden') return false
          var rect = element.getBoundingClientRect()
          return rect.width >= 1 && rect.height >= 1
        } catch (error) {
          return false
        }
      }
      function findTarget(target) {
        if (!target) return null
        if (target.ref && /^[A-Za-z0-9_-]+$/.test(String(target.ref))) {
          return document.querySelector('[data-dsh-bu-ref="' + target.ref + '"]')
        }
        if (target.selector) {
          try {
            var listed = document.querySelectorAll(target.selector)
            for (var i = 0; i < listed.length; i += 1) if (isVisible(listed[i])) return listed[i]
            return listed[0] || null
          } catch (error) {
            return null
          }
        }
        if (target.text) {
          var wanted = normalize(target.text)
          var nodes = document.querySelectorAll('a,button,input,label,h1,h2,h3,p,li,span,div')
          for (var j = 0; j < nodes.length; j += 1) {
            if (!isVisible(nodes[j])) continue
            if (normalize(nodes[j].innerText || nodes[j].textContent).indexOf(wanted) >= 0) return nodes[j]
          }
        }
        return null
      }
      var checks = []
      var currentUrl = location.href
      if (args.url !== undefined) {
        checks.push({
          name: 'url',
          expected: String(args.url),
          actual: currentUrl,
          pass: normalizeUrl(args.url) === normalizeUrl(currentUrl),
        })
      }
      if (args.title !== undefined) {
        var expectedTitle = String(args.title)
        var actualTitle = document.title || ''
        checks.push({
          name: 'title',
          expected: expectedTitle,
          actual: actualTitle,
          pass: actualTitle === expectedTitle || actualTitle.indexOf(expectedTitle) >= 0,
        })
      }
      var pageText = ''
      try {
        pageText = (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').trim()
      } catch (error) {
        pageText = ''
      }
      if (args.text !== undefined) {
        var expectedText = String(args.text)
        checks.push({
          name: 'text',
          expected: expectedText,
          actual: pageText.slice(0, 500),
          pass: pageText.indexOf(expectedText) >= 0,
        })
      }
      if (args.element !== undefined) {
        var element = findTarget(args.element)
        checks.push({
          name: 'element',
          expected: JSON.stringify(args.element),
          actual: element ? normalize(element.innerText || element.textContent) : null,
          pass: Boolean(element && isVisible(element)),
        })
      }
      if (checks.length === 0) {
        return { ok: false, error: { code: 'E_BAD_REQUEST', message: 'no verification checks were provided' } }
      }
      var passed = checks.every(function (check) {
        return check.pass
      })
      return {
        ok: true,
        passed: passed,
        url: currentUrl,
        title: document.title,
        checks: checks,
        hint: passed ? undefined : 'one or more checks failed; report the actual values instead of claiming success',
      }
    }

    function waitForRunner(args) {
      function normalize(value) {
        return String(value === undefined || value === null ? '' : value)
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 160)
      }
      function isVisible(element) {
        try {
          var style = window.getComputedStyle(element)
          if (!style || style.display === 'none' || style.visibility === 'hidden') return false
          var rect = element.getBoundingClientRect()
          return rect.width >= 1 && rect.height >= 1
        } catch (error) {
          return false
        }
      }
      function findTarget(target) {
        if (!target) return null
        if (target.ref && /^[A-Za-z0-9_-]+$/.test(String(target.ref))) {
          return document.querySelector('[data-dsh-bu-ref="' + target.ref + '"]')
        }
        if (target.selector) {
          try {
            var listed = document.querySelectorAll(target.selector)
            for (var i = 0; i < listed.length; i += 1) if (isVisible(listed[i])) return listed[i]
            return listed[0] || null
          } catch (error) {
            return null
          }
        }
        if (target.text) {
          var wanted = normalize(target.text)
          var nodes = document.querySelectorAll('a,button,input,label,h1,h2,h3,p,li,span,div')
          for (var j = 0; j < nodes.length; j += 1) {
            if (!isVisible(nodes[j])) continue
            if (normalize(nodes[j].innerText || nodes[j].textContent).indexOf(wanted) >= 0) return nodes[j]
          }
        }
        return null
      }
      var element = findTarget(args.target || args)
      return {
        found: Boolean(element),
        target: element
          ? {
              ref: element.getAttribute('data-dsh-bu-ref') || '',
              tag: element.tagName.toLowerCase(),
              name: normalize(element.getAttribute('aria-label') || element.innerText || element.textContent),
            }
          : null,
        url: location.href,
        title: document.title,
      }
    }

    function floatingAnnotator() {
      var HOST_ID = 'dsh-browser-use-annotator'
      var LEGACY_ID = 'dsh-browser-use-pick-host'
      if (document.getElementById(HOST_ID)) return { ok: true, reused: true }
      var legacy = document.getElementById(LEGACY_ID)
      if (legacy && legacy.parentNode) legacy.parentNode.removeChild(legacy)

      var host = document.createElement('div')
      host.id = HOST_ID
      host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483645;'
      var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host
      var style = document.createElement('style')
      style.textContent =
        '.toolbar{position:fixed;top:10px;right:10px;z-index:2147483646;pointer-events:auto;display:flex;gap:8px;align-items:center}' +
        '.pick{all:initial;display:inline-flex;align-items:center;gap:5px;padding:6px 11px;border-radius:999px;border:1px solid rgba(77,139,255,.55);background:rgba(20,30,50,.9);color:#dce8ff;font:12px "Segoe UI","Microsoft YaHei UI",sans-serif;cursor:pointer;box-shadow:0 8px 24px -12px rgba(0,0,0,.8),0 0 0 1px rgba(255,255,255,.06) inset;backdrop-filter:blur(8px)}' +
        '.pick:hover{background:rgba(40,70,130,.94)}' +
        '.layer{position:fixed;inset:0;pointer-events:none;z-index:2147483644}' +
        '.hover{position:fixed;border:2px solid rgba(77,139,255,.95);border-radius:6px;pointer-events:none;display:none;box-shadow:0 0 0 1px rgba(77,139,255,.25),0 0 0 4px rgba(77,139,255,.16)}' +
        '.anno{position:fixed;border:2px solid #4d8bff;border-radius:6px;pointer-events:none;box-sizing:border-box;box-shadow:0 0 0 4px rgba(77,139,255,.14)}' +
        '.marker{position:fixed;width:22px;height:22px;border-radius:50% 50% 50% 4px;background:#4d8bff;color:#fff;font:600 11px/22px "Segoe UI",sans-serif;text-align:center;pointer-events:none;box-shadow:0 4px 12px rgba(20,60,160,.45)}' +
        '.pop{position:fixed;z-index:2147483647;pointer-events:auto;background:#fff;border:1px solid #e2e8f2;border-radius:14px;box-shadow:0 18px 50px -18px rgba(20,40,80,.5),0 0 0 1px rgba(20,40,80,.04);padding:8px 8px 6px;font:13px "Segoe UI","Microsoft YaHei UI",sans-serif;color:#1b2433;display:none}' +
        '.row{display:flex;align-items:center;gap:8px}' +
        '.grip{flex:0 0 auto;color:#8a94a6;display:flex;align-items:center;justify-content:center;width:22px;height:22px}' +
        '.comment{flex:1;min-width:0;border:0;outline:0;font:13px "Segoe UI","Microsoft YaHei UI",sans-serif;color:#1b2433;background:transparent;padding:6px 2px}' +
        '.comment::placeholder{color:#98a3b5}' +
        '.mic{flex:0 0 auto;color:#98a3b5;width:24px;height:24px;display:flex;align-items:center;justify-content:center}' +
        '.send{all:initial;flex:0 0 auto;width:32px;height:32px;border-radius:50%;background:#111827;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;font:600 14px/1 "Segoe UI",sans-serif;box-shadow:0 6px 16px -8px rgba(0,0,0,.6)}' +
        '.send:hover{background:#1f2937}' +
        '.hint{margin-top:2px;padding:0 4px 2px 30px;color:#98a3b5;font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
        '.bar{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483647;pointer-events:auto;display:none;align-items:center;gap:10px;padding:7px 9px 7px 13px;border-radius:999px;background:rgba(20,28,44,.94);color:#e6eefc;font:12px "Segoe UI","Microsoft YaHei UI",sans-serif;box-shadow:0 18px 44px -18px rgba(0,0,0,.9);border:1px solid rgba(255,255,255,.12)}' +
        '.bar-dot{width:7px;height:7px;border-radius:50%;background:#4d8bff;box-shadow:0 0 8px #4d8bff}' +
        '.bar-send{all:initial;padding:5px 12px;border-radius:999px;background:#2f6ef0;color:#fff;font:600 11.5px "Segoe UI",sans-serif;cursor:pointer}' +
        '.bar-clear{all:initial;padding:5px 8px;border-radius:999px;color:#b8c4d8;font:11.5px "Segoe UI",sans-serif;cursor:pointer}' +
        '.toast{position:fixed;top:48px;right:10px;z-index:2147483647;pointer-events:none;display:none;background:rgba(20,28,44,.95);color:#e6eefc;border:1px solid rgba(140,170,255,.4);border-radius:9px;padding:7px 11px;font:11.5px "Segoe UI","Microsoft YaHei UI",sans-serif;box-shadow:0 12px 30px -14px rgba(0,0,0,.9);max-width:320px}'
      root.appendChild(style)

      var toolbar = document.createElement('div')
      toolbar.className = 'toolbar'
      var pickBtn = document.createElement('button')
      pickBtn.className = 'pick'
      pickBtn.textContent = '⌖ 选取元素'
      pickBtn.title = '指向网页元素添加批注，批量复制引用后粘贴到聊天框'
      toolbar.appendChild(pickBtn)
      root.appendChild(toolbar)

      var layer = document.createElement('div')
      layer.className = 'layer'
      var hover = document.createElement('div')
      hover.className = 'hover'
      layer.appendChild(hover)
      root.appendChild(layer)

      var pop = document.createElement('div')
      pop.className = 'pop'
      var row = document.createElement('div')
      row.className = 'row'
      var grip = document.createElement('div')
      grip.className = 'grip'
      grip.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 4h3M8 4h6M2 8h6M11 8h3M2 12h2M7 12h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="6" cy="4" r="1.6" fill="#fff" stroke="currentColor" stroke-width="1.3"/><circle cx="9.5" cy="8" r="1.6" fill="#fff" stroke="currentColor" stroke-width="1.3"/><circle cx="5" cy="12" r="1.6" fill="#fff" stroke="currentColor" stroke-width="1.3"/></svg>'
      var input = document.createElement('input')
      input.className = 'comment'
      input.type = 'text'
      input.placeholder = '添加评论…'
      var mic = document.createElement('span')
      mic.className = 'mic'
      mic.title = '语音输入暂未接入'
      mic.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="6" y="1.5" width="4" height="7" rx="2" stroke="currentColor" stroke-width="1.3"/><path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>'
      var sendBtn = document.createElement('button')
      sendBtn.className = 'send'
      sendBtn.type = 'button'
      sendBtn.textContent = '✓'
      sendBtn.title = '添加批注并发送（Ctrl+Enter）'
      row.appendChild(grip)
      row.appendChild(input)
      row.appendChild(mic)
      row.appendChild(sendBtn)
      var hint = document.createElement('div')
      hint.className = 'hint'
      hint.textContent = 'Enter 添加 · Ctrl+Enter 发送 · Esc 取消'
      pop.appendChild(row)
      pop.appendChild(hint)
      root.appendChild(pop)

      var bar = document.createElement('div')
      bar.className = 'bar'
      var barDot = document.createElement('span')
      barDot.className = 'bar-dot'
      var barText = document.createElement('span')
      barText.textContent = '正在批注 · 0'
      var barSend = document.createElement('button')
      barSend.className = 'bar-send'
      barSend.type = 'button'
      barSend.textContent = '发送'
      var barClear = document.createElement('button')
      barClear.className = 'bar-clear'
      barClear.type = 'button'
      barClear.textContent = '清除'
      bar.appendChild(barDot)
      bar.appendChild(barText)
      bar.appendChild(barSend)
      bar.appendChild(barClear)
      root.appendChild(bar)

      var toast = document.createElement('div')
      toast.className = 'toast'
      root.appendChild(toast)

      var outbox = null
      var statusEl = null
      function ensureOutbox() {
        outbox = document.getElementById('dsh-browser-use-outbox')
        if (!outbox) {
          outbox = document.createElement('div')
          outbox.id = 'dsh-browser-use-outbox'
          outbox.style.cssText = 'display:none;'
          document.documentElement.appendChild(outbox)
        }
        statusEl = document.getElementById('dsh-browser-use-outbox-status')
        if (!statusEl) {
          statusEl = document.createElement('div')
          statusEl.id = 'dsh-browser-use-outbox-status'
          statusEl.style.cssText = 'display:none;'
          document.documentElement.appendChild(statusEl)
        }
      }

      var mode = 'idle'
      var selected = null
      var hovered = null
      var annotations = []
      var toastTimer = 0
      var previousCursor = ''

      function normalize(value, limit) {
        return String(value === undefined || value === null ? '' : value)
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, limit || 160)
      }

      function escapeSelector(value) {
        if (window.CSS && window.CSS.escape) return window.CSS.escape(value)
        return String(value).replace(/([^\w-])/g, '\\$1')
      }

      function selectorOf(element) {
        try {
          if (!element || element.nodeType !== 1) return ''
          if (element.id) return '#' + escapeSelector(element.id)
          var parts = []
          var node = element
          var depth = 0
          while (node && node.nodeType === 1 && node !== document.body && depth < 6) {
            var testid = node.getAttribute('data-testid')
            if (testid) {
              parts.unshift('[data-testid="' + String(testid).replace(/"/g, '\\"') + '"]')
              break
            }
            var nameAttr = node.getAttribute('name')
            if (nameAttr && ['input', 'select', 'textarea', 'form'].indexOf(node.tagName.toLowerCase()) >= 0) {
              parts.unshift(node.tagName.toLowerCase() + '[name="' + String(nameAttr).replace(/"/g, '\\"') + '"]')
              break
            }
            var part = node.tagName.toLowerCase()
            var parent = node.parentElement
            if (parent) {
              var sameTag = 0
              var index = 0
              for (var i = 0; i < parent.children.length; i += 1) {
                if (parent.children[i].tagName === node.tagName) {
                  sameTag += 1
                  if (parent.children[i] === node) index = sameTag
                }
              }
              if (sameTag > 1) part += ':nth-of-type(' + index + ')'
            }
            parts.unshift(part)
            node = parent
            depth += 1
          }
          return parts.join(' > ')
        } catch (error) {
          return ''
        }
      }

      function contextOf(element) {
        try {
          var card = element.closest('[data-testid="agent-harness-card"]')
          if (card) {
            var cardHeading = card.querySelector('h1,h2,h3,h4')
            if (cardHeading && normalize(cardHeading.innerText)) return normalize(cardHeading.innerText)
          }
          var container = element.closest('section,article')
          if (container) {
            var heading = container.querySelector('h1,h2,h3,h4')
            if (heading && normalize(heading.innerText)) return normalize(heading.innerText)
          }
          var node = element
          while (node) {
            var prev = node.previousElementSibling
            while (prev) {
              if (/^H[1-6]$/.test(prev.tagName) && normalize(prev.innerText)) return normalize(prev.innerText)
              prev = prev.previousElementSibling
            }
            node = node.parentElement
          }
        } catch (error) {
          /* ignore */
        }
        return ''
      }

      function describe(element) {
        var rect = element.getBoundingClientRect()
        var tag = element.tagName.toLowerCase()
        var role =
          element.getAttribute('role') ||
          (tag === 'a'
            ? 'link'
            : tag === 'button'
              ? 'button'
              : tag === 'input'
                ? element.type === 'checkbox'
                  ? 'checkbox'
                  : 'textbox'
                : tag === 'select'
                  ? 'combobox'
                  : tag)
        var name = ''
        try {
          name =
            element.getAttribute('aria-label') ||
            element.getAttribute('title') ||
            element.getAttribute('placeholder') ||
            element.innerText ||
            element.textContent ||
            ''
        } catch (error) {
          name = ''
        }
        var text = ''
        try {
          text = element.innerText || element.textContent || ''
        } catch (error) {
          text = ''
        }
        return {
          selector: selectorOf(element),
          context: contextOf(element),
          tag: tag,
          role: role,
          name: normalize(name, 120),
          text: normalize(text, 300),
          ref: element.getAttribute('data-dsh-bu-ref') || undefined,
          href: tag === 'a' && element.href ? element.href : undefined,
          box: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          },
        }
      }

      function buildReference() {
        var lines = ['[Browser Use 批注 · ' + annotations.length + ' 条]']
        lines.push('页面: ' + location.href)
        annotations.forEach(function (annotation, index) {
          lines.push('--- 批注 ' + (index + 1) + ' ---')
          lines.push('评论: ' + annotation.comment)
          if (annotation.info.context) lines.push('上下文: ' + annotation.info.context)
          if (annotation.info.selector) lines.push('选择器: ' + annotation.info.selector)
          lines.push('角色: ' + annotation.info.role)
          if (annotation.info.name) lines.push('可读名: ' + annotation.info.name)
          if (annotation.info.text) lines.push('文本: ' + annotation.info.text)
          lines.push(
            '位置: x=' +
              annotation.info.box.x +
              ' y=' +
              annotation.info.box.y +
              ' w=' +
              annotation.info.box.w +
              ' h=' +
              annotation.info.box.h,
          )
          if (annotation.info.ref) lines.push('Ref: ' + annotation.info.ref)
          if (annotation.info.href) lines.push('链接: ' + annotation.info.href)
        })
        return lines.join('\n')
      }

      function fallbackCopy(text) {
        try {
          var textarea = document.createElement('textarea')
          textarea.value = text
          textarea.style.cssText = 'position:fixed;left:-9999px;top:0;'
          if (root === host) host.appendChild(textarea)
          else root.appendChild(textarea)
          textarea.select()
          var ok = document.execCommand('copy')
          textarea.remove()
          return Boolean(ok)
        } catch (error) {
          return false
        }
      }

      function copyText(text) {
        return new Promise(function (resolve) {
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(text).then(
                function () {
                  resolve(true)
                },
                function () {
                  resolve(fallbackCopy(text))
                },
              )
              return
            }
          } catch (error) {
            /* fall through */
          }
          resolve(fallbackCopy(text))
        })
      }

      function showToast(message, ms) {
        if (toastTimer) clearTimeout(toastTimer)
        toast.textContent = message
        toast.style.display = 'block'
        toastTimer = window.setTimeout(function () {
          toast.style.display = 'none'
        }, ms || 2800)
      }

      function positionBox(boxElement, rect) {
        boxElement.style.left = rect.x - 3 + 'px'
        boxElement.style.top = rect.y - 3 + 'px'
        boxElement.style.width = rect.width + 6 + 'px'
        boxElement.style.height = rect.height + 6 + 'px'
      }

      function positionAnnotation(annotation) {
        if (!annotation.element || !annotation.element.isConnected) {
          if (annotation.outline) annotation.outline.style.display = 'none'
          if (annotation.marker) annotation.marker.style.display = 'none'
          return
        }
        var rect = annotation.element.getBoundingClientRect()
        if (rect.width < 1 || rect.height < 1) {
          annotation.outline.style.display = 'none'
          annotation.marker.style.display = 'none'
          return
        }
        annotation.outline.style.display = 'block'
        annotation.marker.style.display = 'block'
        positionBox(annotation.outline, rect)
        annotation.marker.style.left = rect.x + rect.width / 2 - 11 + 'px'
        annotation.marker.style.top = rect.y - 12 + 'px'
      }

      function reposition() {
        annotations.forEach(positionAnnotation)
        if (mode === 'select' && hovered && hovered.isConnected) {
          var rect = hovered.getBoundingClientRect()
          if (rect.width > 1 && rect.height > 1) positionBox(hover, rect)
        }
        if (selected && selected.isConnected) positionPopover()
      }

      function positionPopover() {
        if (!selected) return
        var rect = selected.getBoundingClientRect()
        var width = Math.min(380, window.innerWidth - 20)
        var left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8)
        var top = rect.bottom + 10
        if (top + 120 > window.innerHeight) top = Math.max(8, rect.top - 120)
        pop.style.left = left + 'px'
        pop.style.top = top + 'px'
        pop.style.width = width + 'px'
      }

      function updateBar() {
        barText.textContent = '正在批注 · ' + annotations.length
        bar.style.display = annotations.length > 0 ? 'flex' : 'none'
      }

      function addAnnotation(comment, sendNow) {
        if (!selected) return
        var info = describe(selected)
        var annotation = { element: selected, info: info, comment: comment }
        var outline = document.createElement('div')
        outline.className = 'anno'
        var marker = document.createElement('div')
        marker.className = 'marker'
        marker.textContent = String(annotations.length + 1)
        layer.appendChild(outline)
        layer.appendChild(marker)
        annotation.outline = outline
        annotation.marker = marker
        annotations.push(annotation)
        positionAnnotation(annotation)
        input.value = ''
        pop.style.display = 'none'
        selected = null
        updateBar()
        if (sendNow) {
          sendAll()
        } else {
          setMode('select')
        }
      }

      function sendAll() {
        if (annotations.length === 0) return
        var text = buildReference()
        var count = annotations.length
        ensureOutbox()
        if (statusEl) statusEl.textContent = ''
        if (outbox) {
          outbox.textContent = JSON.stringify({
            type: 'browser-use-annotation',
            text: text,
            count: count,
            at: Date.now(),
          })
        }
        showToast('已发送到聊天框…', 1500)
        clearAnnotations()
        setMode('idle')
        window.setTimeout(function () {
          var status = statusEl ? statusEl.textContent : ''
          if (status === 'sent') showToast('已发送到聊天框', 2200)
          else if (status === 'copied') showToast('已复制批注到剪贴板，请粘贴发送', 3200)
          else if (status === 'failed') showToast('自动发送失败，请重试', 3200)
        }, 1200)
      }

      function clearAnnotations() {
        annotations.forEach(function (annotation) {
          if (annotation.outline) annotation.outline.remove()
          if (annotation.marker) annotation.marker.remove()
        })
        annotations = []
        updateBar()
      }

      function startSelect() {
        if (mode === 'select') return
        if (mode === 'comment') return
        setMode('select')
      }

      function setMode(next) {
        if (mode === 'select') {
          document.removeEventListener('mousemove', onMove, true)
          document.removeEventListener('click', onClick, true)
          document.removeEventListener('keydown', onSelectKey, true)
        }
        mode = next
        if (next === 'select') {
          previousCursor = document.documentElement.style.cursor || ''
          document.documentElement.style.cursor = 'crosshair'
          pickBtn.textContent = '选取中… Esc 退出'
          document.addEventListener('mousemove', onMove, true)
          document.addEventListener('click', onClick, true)
          document.addEventListener('keydown', onSelectKey, true)
          showToast('点击页面元素添加批注；Esc 退出', 2600)
        } else if (next === 'comment') {
          document.documentElement.style.cursor = ''
          pickBtn.textContent = '添加评论…'
          pop.style.display = 'block'
          positionPopover()
          input.value = ''
          window.setTimeout(function () {
            input.focus()
          }, 0)
        } else {
          document.documentElement.style.cursor = previousCursor || ''
          pickBtn.textContent = '⌖ 选取元素'
          hover.style.display = 'none'
          pop.style.display = 'none'
          hovered = null
          selected = null
        }
      }

      function selectElement(element) {
        if (!element || element === host) return
        selected = element
        var rect = element.getBoundingClientRect()
        if (rect.width < 2 || rect.height < 2) return
        positionBox(hover, rect)
        hover.style.display = 'block'
        setMode('comment')
      }

      function onMove(event) {
        if (mode !== 'select') return
        var element = document.elementFromPoint(event.clientX, event.clientY)
        if (!element || element === host || (host.contains && host.contains(element))) return
        var rect = element.getBoundingClientRect()
        if (rect.width < 2 || rect.height < 2) {
          hover.style.display = 'none'
          hovered = null
          return
        }
        hovered = element
        positionBox(hover, rect)
        hover.style.display = 'block'
      }

      function onClick(event) {
        if (mode !== 'select') return
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        var element = hovered || document.elementFromPoint(event.clientX, event.clientY)
        if (element) selectElement(element)
      }

      function onSelectKey(event) {
        if (event.key === 'Escape') {
          event.preventDefault()
          setMode('idle')
        }
      }

      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault()
          var comment = input.value.trim()
          if (!comment) {
            if ((event.ctrlKey || event.metaKey) && annotations.length > 0) sendAll()
            else showToast('请输入评论')
            return
          }
          addAnnotation(comment, Boolean(event.ctrlKey || event.metaKey))
        } else if (event.key === 'Escape') {
          event.preventDefault()
          setMode('idle')
        }
      })

      sendBtn.addEventListener('click', function (event) {
        event.preventDefault()
        event.stopPropagation()
        var comment = input.value.trim()
        if (!comment) {
          showToast('请输入评论')
          return
        }
        addAnnotation(comment, Boolean(event.ctrlKey || event.metaKey))
      })

      pickBtn.addEventListener('click', function (event) {
        event.preventDefault()
        event.stopPropagation()
        if (mode === 'select') setMode('idle')
        else if (mode === 'idle') startSelect()
      })

      barSend.addEventListener('click', function (event) {
        event.preventDefault()
        event.stopPropagation()
        sendAll()
      })

      barClear.addEventListener('click', function (event) {
        event.preventDefault()
        event.stopPropagation()
        clearAnnotations()
        setMode('idle')
      })

      window.addEventListener('scroll', reposition, true)
      window.addEventListener('resize', reposition)
      document.documentElement.appendChild(host)
      return { ok: true, injected: true }
    }

    function floatingButton() {
      var HOST_ID = 'dsh-browser-use-pick-host'
      if (document.getElementById(HOST_ID)) return { ok: true, reused: true }
      var host = document.createElement('div')
      host.id = HOST_ID
      host.style.cssText = 'position:fixed;top:10px;right:10px;z-index:2147483646;'
      var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host
      var previousCursor = ''
      var active = false
      var current = null
      var toastTimer = 0
      var highlight = null
      var label = null

      function normalize(value, limit) {
        return String(value === undefined || value === null ? '' : value)
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, limit || 120)
      }

      function escapeSelector(value) {
        if (window.CSS && window.CSS.escape) return window.CSS.escape(value)
        return String(value).replace(/([^\w-])/g, '\\$1')
      }

      function selectorOf(element) {
        try {
          if (!element || element.nodeType !== 1) return ''
          if (element.id) return '#' + escapeSelector(element.id)
          var parts = []
          var node = element
          var depth = 0
          while (node && node.nodeType === 1 && node !== document.body && depth < 6) {
            var testid = node.getAttribute('data-testid')
            if (testid) {
              parts.unshift('[data-testid="' + String(testid).replace(/"/g, '\\"') + '"]')
              break
            }
            var nameAttr = node.getAttribute('name')
            if (nameAttr && ['input', 'select', 'textarea', 'form'].indexOf(node.tagName.toLowerCase()) >= 0) {
              parts.unshift(node.tagName.toLowerCase() + '[name="' + String(nameAttr).replace(/"/g, '\\"') + '"]')
              break
            }
            var part = node.tagName.toLowerCase()
            var parent = node.parentElement
            if (parent) {
              var sameTag = 0
              var index = 0
              for (var i = 0; i < parent.children.length; i += 1) {
                if (parent.children[i].tagName === node.tagName) {
                  sameTag += 1
                  if (parent.children[i] === node) index = sameTag
                }
              }
              if (sameTag > 1) part += ':nth-of-type(' + index + ')'
            }
            parts.unshift(part)
            node = parent
            depth += 1
          }
          return parts.join(' > ')
        } catch (error) {
          return ''
        }
      }

      function describe(element) {
        var rect = element.getBoundingClientRect()
        var tag = element.tagName.toLowerCase()
        var role =
          element.getAttribute('role') ||
          (tag === 'a'
            ? 'link'
            : tag === 'button'
              ? 'button'
              : tag === 'input'
                ? element.type === 'checkbox'
                  ? 'checkbox'
                  : 'textbox'
                : tag === 'select'
                  ? 'combobox'
                  : tag)
        var name = ''
        try {
          name =
            element.getAttribute('aria-label') ||
            element.getAttribute('title') ||
            element.getAttribute('placeholder') ||
            element.innerText ||
            element.textContent ||
            ''
        } catch (error) {
          name = ''
        }
        var text = ''
        try {
          text = element.innerText || element.textContent || ''
        } catch (error) {
          text = ''
        }
        return {
          selector: selectorOf(element),
          tag: tag,
          role: role,
          name: normalize(name, 120),
          text: normalize(text, 300),
          ref: element.getAttribute('data-dsh-bu-ref') || undefined,
          href: tag === 'a' && element.href ? element.href : undefined,
          box: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          },
        }
      }

      function buildReference(info) {
        var lines = ['[Browser Use 元素引用]']
        lines.push('页面: ' + location.href)
        if (info.selector) lines.push('选择器: ' + info.selector)
        lines.push('角色: ' + info.role)
        if (info.name) lines.push('可读名: ' + info.name)
        if (info.text) lines.push('文本: ' + info.text)
        lines.push(
          '位置: x=' + info.box.x + ' y=' + info.box.y + ' w=' + info.box.w + ' h=' + info.box.h,
        )
        if (info.ref) lines.push('Ref: ' + info.ref)
        if (info.href) lines.push('链接: ' + info.href)
        return lines.join('\n')
      }

      function fallbackCopy(text) {
        try {
          var textarea = document.createElement('textarea')
          textarea.value = text
          textarea.style.cssText = 'position:fixed;left:-9999px;top:0;'
          ;(root === host ? host : root).appendChild(textarea)
          textarea.select()
          var ok = document.execCommand('copy')
          textarea.remove()
          return Boolean(ok)
        } catch (error) {
          return false
        }
      }

      function copyText(text) {
        return new Promise(function (resolve) {
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(text).then(
                function () {
                  resolve(true)
                },
                function () {
                  resolve(fallbackCopy(text))
                },
              )
              return
            }
          } catch (error) {
            /* fall back */
          }
          resolve(fallbackCopy(text))
        })
      }

      function showToast(message, ms) {
        if (toastTimer) clearTimeout(toastTimer)
        toast.textContent = message
        toast.style.display = 'block'
        toastTimer = window.setTimeout(function () {
          toast.style.display = 'none'
        }, ms || 2600)
      }

      function cleanupPick() {
        active = false
        document.removeEventListener('mousemove', onMove, true)
        document.removeEventListener('click', onClick, true)
        document.removeEventListener('keydown', onKey, true)
        try {
          document.documentElement.style.cursor = previousCursor
        } catch (error) {
          /* ignore */
        }
        if (highlight && highlight.parentNode) highlight.parentNode.removeChild(highlight)
        if (label && label.parentNode) label.parentNode.removeChild(label)
        highlight = null
        label = null
        current = null
        pill.textContent = '⌖ 选取元素'
      }

      function onKey(event) {
        if (event.key === 'Escape') {
          event.preventDefault()
          cleanupPick()
          showToast('已取消选取')
        }
      }

      function onMove(event) {
        if (!active) return
        var element = document.elementFromPoint(event.clientX, event.clientY)
        if (!element || element === host || (host.contains && host.contains(element))) return
        var rect = element.getBoundingClientRect()
        if (rect.width < 2 || rect.height < 2) return
        current = element
        if (!highlight) {
          highlight = document.createElement('div')
          highlight.style.cssText =
            'position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #7ca0ff;border-radius:8px;box-shadow:0 0 0 4px rgba(124,160,255,.18),0 0 24px rgba(124,160,255,.45);'
          root.appendChild(highlight)
        }
        highlight.style.left = rect.x - 3 + 'px'
        highlight.style.top = rect.y - 3 + 'px'
        highlight.style.width = rect.width + 6 + 'px'
        highlight.style.height = rect.height + 6 + 'px'
        if (!label) {
          label = document.createElement('div')
          label.style.cssText =
            'position:fixed;pointer-events:none;z-index:2147483647;background:rgba(15,22,36,.92);color:#dce8ff;border:1px solid rgba(140,170,255,.45);border-radius:6px;padding:2px 7px;font:11px "Segoe UI","Microsoft YaHei",sans-serif;white-space:nowrap;max-width:320px;overflow:hidden;text-overflow:ellipsis;'
          root.appendChild(label)
        }
        var info = describe(element)
        label.textContent = (info.role || info.tag) + (info.name ? ' · ' + info.name : '')
        label.style.left = Math.max(8, rect.x) + 'px'
        label.style.top = Math.max(8, rect.y - 26) + 'px'
      }

      function onClick(event) {
        if (!active) return
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        var element = current || document.elementFromPoint(event.clientX, event.clientY)
        if (!element) {
          cleanupPick()
          return
        }
        var info = describe(element)
        var text = buildReference(info)
        copyText(text).then(function (ok) {
          showToast(ok ? '已复制元素引用，粘贴到聊天框提问或修改' : '复制失败，请手动复制')
        })
        cleanupPick()
      }

      function startPick() {
        if (active) return
        active = true
        previousCursor = document.documentElement.style.cursor || ''
        document.documentElement.style.cursor = 'crosshair'
        document.addEventListener('mousemove', onMove, true)
        document.addEventListener('click', onClick, true)
        document.addEventListener('keydown', onKey, true)
        pill.textContent = '点击页面元素… Esc 取消'
        showToast('点击页面元素以复制引用；Esc 取消', 3200)
      }

      var pill = document.createElement('button')
      pill.type = 'button'
      pill.textContent = '⌖ 选取元素'
      pill.setAttribute('aria-label', '指向网页元素并复制引用，用于提问或请求修改')
      pill.style.cssText =
        'all:initial;position:fixed;top:10px;right:10px;z-index:2147483646;display:inline-flex;align-items:center;gap:4px;padding:5px 10px;border-radius:999px;border:1px solid rgba(140,170,255,.55);background:rgba(15,22,36,.88);color:#dce8ff;font:12px "Segoe UI","Microsoft YaHei UI",sans-serif;cursor:pointer;box-shadow:0 8px 24px -12px rgba(0,0,0,.8),0 0 0 1px rgba(255,255,255,.06) inset;backdrop-filter:blur(8px);'
      pill.title = '指向网页元素以提问或请求修改（复制引用到剪贴板）'
      pill.addEventListener('mouseenter', function () {
        pill.style.background = 'rgba(40,70,130,.92)'
      })
      pill.addEventListener('mouseleave', function () {
        pill.style.background = 'rgba(15,22,36,.88)'
      })
      pill.addEventListener('click', function (event) {
        event.preventDefault()
        event.stopPropagation()
        if (active) {
          cleanupPick()
          showToast('已取消选取')
        } else {
          startPick()
        }
      })

      var toast = document.createElement('div')
      toast.style.cssText =
        'display:none;position:fixed;top:46px;right:10px;z-index:2147483647;background:rgba(15,22,36,.94);color:#dce8ff;border:1px solid rgba(140,170,255,.4);border-radius:8px;padding:6px 10px;font:11.5px "Segoe UI","Microsoft YaHei UI",sans-serif;box-shadow:0 10px 28px -14px rgba(0,0,0,.9);max-width:300px;'
      root.appendChild(pill)
      root.appendChild(toast)
      document.documentElement.appendChild(host)
      return { ok: true, injected: true }
    }



    var generation = 0

    function bumpGeneration() {
      generation += 1
      return 'g-' + generation
    }

    function summarizeNodes(nodes, maxChars) {
      var lines = []
      var size = 0
      for (var i = 0; i < nodes.length; i += 1) {
        var node = nodes[i]
        var line =
          '[' + node.ref + '] ' + node.role + ' "' + node.name + '" @' + node.box.x + ',' + node.box.y + ' ' + node.box.w + 'x' + node.box.h
        if (node.value !== undefined) line += ' value=' + JSON.stringify(node.value)
        if (node.disabled) line += ' disabled'
        size += line.length + 1
        if (size > maxChars) break
        lines.push(line)
      }
      return lines.join('\n')
    }

    async function dispatchStatus() {
      var webviews = collectWebviews(document)
      var items = webviews.map(function (webview) {
        return { url: webviewUrl(webview), title: webviewTitle(webview), visible: isVisible(webview) }
      })
      var target = findBestWebview(null)
      return {
        ok: true,
        rendererId: null,
        platform: 'web',
        href: location.href,
        generation: 'g-' + generation,
        webviewCount: webviews.length,
        webviews: items,
        webview: target
          ? { url: webviewUrl(target), title: webviewTitle(target), visible: isVisible(target) }
          : null,
        panel: {
          registered: panelState.registered,
          state: panelState.state,
          takeover: panelState.takeover,
          steps: panelState.steps.length,
          recent: (panelState.steps || []).slice(0, 3).map(function (step) {
            return step.text
          }),
          pickButton: panelState.pickButton,
          composer: composerInputActions
            ? {
                available: true,
                insertText: typeof composerInputActions.insertText === 'function',
                setDraft: typeof composerInputActions.setDraft === 'function',
                submit: typeof composerInputActions.submit === 'function',
              }
            : { available: false },
        },
        hint:
          webviews.length === 0
            ? 'No Sidebar browser webview found. Open the browser tab with browser_use_open first.'
            : undefined,
      }
    }

    async function dispatchOpen(ctx, args) {
      var url
      try {
        url = new URL(String(args && args.url))
      } catch (error) {
        return failure('E_BAD_REQUEST', 'invalid url')
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return failure('E_BAD_REQUEST', 'only http(s) URLs are supported')
      }
      var requested = url.toString()
      var reuseTab = args && args.reuseTab !== false
      var focus = !(args && args.focus === false)
      var target = findBestWebview(requested)
      var reused = Boolean(target && reuseTab)
      if (!target) {
        try {
          openInBrowserTab(ctx, requested)
        } catch (error) {
          return failure('E_UNSUPPORTED', 'cannot open the Sidebar browser tab: ' + cleanText(error && error.message))
        }
        target = await waitFor(function () {
          return findBestWebview(requested) || findBestWebview(null)
        }, OPEN_TIMEOUT_MS)
      }
      if (!target) {
        return failure(
          'E_NO_WEBVIEW',
          'Sidebar browser webview did not appear',
          'open the Browser tab manually once, then retry; the webview tag must be enabled in DSH Desktop',
        )
      }
      if (focus && target.focus && isVisible(target) === false) {
        safeCall(function () {
          target.focus()
        })
      }
      var currentUrl = webviewUrl(target)
      if (!sameUrl(currentUrl, requested)) {
        try {
          var loaded = target.loadURL(requested)
          if (loaded && typeof loaded.then === 'function') await loaded
        } catch (error) {
          return failure('E_LOAD_FAILED', 'loadURL failed: ' + cleanText(error && error.message))
        }
      }
      var loadResult = await waitForLoad(target, LOAD_TIMEOUT_MS)
      if (!loadResult.ok) return failure(loadResult.error.code, loadResult.error.message)
      var gen = bumpGeneration()
      var webviews = collectWebviews(document)
      setPanelState({
        state: 'success',
        message: '页面已加载',
        url: webviewUrl(target) || requested,
        title: webviewTitle(target),
        generation: gen,
      })
      pushPanelStep('打开 ' + (webviewTitle(target) || requested), 'done')
      return {
        ok: true,
        url: webviewUrl(target) || requested,
        title: webviewTitle(target),
        generation: gen,
        reused: reused,
        webviewCount: webviews.length,
      }
    }

    async function dispatchRead(args) {
      var mode = args && args.mode ? String(args.mode) : 'ax'
      var maxNodes = Math.max(1, Math.min(1000, Number(args && args.maxNodes) || 200))
      var maxChars = Math.max(500, Math.min(100000, Number(args && args.maxChars) || 20000))
      var target = findBestWebview(null)
      if (!target) {
        return failure('E_NO_WEBVIEW', 'no Sidebar browser webview found', 'call browser_use_open first')
      }
      var loading = false
      try {
        loading = typeof target.isLoading === 'function' ? Boolean(target.isLoading()) : false
      } catch (error) {
        loading = false
      }
      if (loading) {
        var loadResult = await waitForLoad(target, LOAD_TIMEOUT_MS)
        if (!loadResult.ok) return failure(loadResult.error.code, loadResult.error.message)
      }
      try {
        if (mode === 'ax') {
          var ax = await executeInPage(
            target,
            '(' + axBuilder.toString() + ')(' + JSON.stringify({ maxNodes: maxNodes, maxChars: maxChars }) + ')',
          )
          if (!ax || ax.ok === false) return failure('E_EXECUTE_FAILED', 'AX read returned no result')
          return {
            ok: true,
            mode: 'ax',
            url: ax.url,
            title: ax.title,
            generation: 'g-' + generation,
            nodes: ax.nodes,
            text: summarizeNodes(ax.nodes, maxChars),
            truncated: ax.truncated,
            viewport: ax.viewport,
          }
        }
        if (mode === 'text') {
          var text = await executeInPage(
            target,
            '(' + textReader.toString() + ')(' + JSON.stringify({ maxChars: maxChars }) + ')',
          )
          return {
            ok: true,
            mode: 'text',
            url: text.url,
            title: text.title,
            generation: 'g-' + generation,
            text: text.text,
            truncated: text.truncated,
          }
        }
        if (mode === 'links') {
          var links = await executeInPage(target, '(' + linkReader.toString() + ')(' + JSON.stringify({}) + ')')
          return {
            ok: true,
            mode: 'links',
            url: links.url,
            title: links.title,
            generation: 'g-' + generation,
            links: links.links,
            truncated: links.truncated,
          }
        }
        if (mode === 'html') {
          var html = await executeInPage(
            target,
            '(' + htmlReader.toString() + ')(' + JSON.stringify({ maxChars: maxChars }) + ')',
          )
          return {
            ok: true,
            mode: 'html',
            url: html.url,
            title: html.title,
            generation: 'g-' + generation,
            text: html.text,
            truncated: html.truncated,
          }
        }
        return failure('E_BAD_REQUEST', 'unsupported read mode: ' + mode)
      } catch (error) {
        if (error && error.code) return failure(error.code, error.message, error.hint)
        return failure('E_EXECUTE_FAILED', cleanText(error && error.message))
      }
    }

    async function dispatchResolve(args) {
      var expected = args && args.expectedGeneration ? String(args.expectedGeneration) : ''
      if (expected && expected !== 'g-' + generation) {
        return failure(
          'E_REF_STALE',
          'page changed since the last read (expected ' + expected + ', current g-' + generation + ')',
          'call browser_use_read again',
        )
      }
      var target = findBestWebview(null)
      if (!target) return failure('E_NO_WEBVIEW', 'no Sidebar browser webview found', 'call browser_use_open first')
      try {
        var resolved = await executeInPage(
          target,
          '(' + targetResolver.toString() + ')(' + JSON.stringify({ target: args && args.target }) + ')',
        )
        if (!resolved) return failure('E_RESOLVE_FAILED', 'target resolver returned no result')
        if (resolved.ok === false) {
          return failure(
            (resolved.error && resolved.error.code) || 'E_REF_STALE',
            (resolved.error && resolved.error.message) || 'target not found',
            resolved.error && resolved.error.hint,
          )
        }
        return resolved
      } catch (error) {
        return failure(error && error.code ? error.code : 'E_RESOLVE_FAILED', cleanText(error && error.message))
      }
    }

    async function dispatchAct(args) {
      var action = String((args && args.action) || '')
      var expected = args && args.expectedGeneration ? String(args.expectedGeneration) : ''
      if (expected && expected !== 'g-' + generation) {
        return failure(
          'E_REF_STALE',
          'page changed since the last read (expected ' + expected + ', current g-' + generation + ')',
          'call browser_use_read again, then retry with the new generation',
        )
      }
      var target = findBestWebview(null)
      if (!target) return failure('E_NO_WEBVIEW', 'no Sidebar browser webview found', 'call browser_use_open first')
      try {
        if (action === 'reload' || action === 'back' || action === 'forward') {
          try {
            if (action === 'reload') target.reload()
            else if (action === 'back') target.goBack()
            else target.goForward()
          } catch (error) {
            return failure('E_UNSUPPORTED', 'cannot ' + action + ': ' + cleanText(error && error.message))
          }
          await sleep(120)
          var loadResult = await waitForLoad(target, LOAD_TIMEOUT_MS)
          if (!loadResult.ok) return failure(loadResult.error.code, loadResult.error.message)
          var nextGeneration = bumpGeneration()
          return {
            ok: true,
            action: action,
            url: webviewUrl(target),
            title: webviewTitle(target),
            generation: nextGeneration,
          }
        }
        if (action === 'waitFor') {
          var timeout = Math.max(200, Math.min(60000, Number(args.timeoutMs) || 5000))
          var started = Date.now()
          var waitArgs = { target: args.target || null }
          while (Date.now() - started <= timeout) {
            var foundState = await executeInPage(
              target,
              '(' + waitForRunner.toString() + ')(' + JSON.stringify(waitArgs) + ')',
            )
            if (foundState && foundState.found) {
              return {
                ok: true,
                action: 'waitFor',
                found: true,
                target: foundState.target,
                url: foundState.url,
                title: foundState.title,
                generation: 'g-' + generation,
              }
            }
            await sleep(200)
          }
          return failure('E_WAIT_TIMEOUT', 'waitFor timed out after ' + timeout + 'ms', 'read the page and check the target')
        }
        var actArgs = {
          action: action,
          target: args.target || null,
          value: args.value,
          key: args.key,
          dx: args.dx,
          dy: args.dy,
        }
        var result = await executeInPage(
          target,
          '(' + actRunner.toString() + ')(' + JSON.stringify(actArgs) + ')',
        )
        if (!result) return failure('E_ACT_FAILED', 'action returned no result')
        if (result.ok === false) {
          return failure(
            (result.error && result.error.code) || 'E_ACT_FAILED',
            (result.error && result.error.message) || 'action failed',
            result.error && result.error.hint,
          )
        }
        return { ...result, ok: true, generation: 'g-' + generation }
      } catch (error) {
        if (error && error.code) return failure(error.code, error.message, error.hint)
        return failure('E_ACT_FAILED', cleanText(error && error.message))
      }
    }

    async function dispatchVerify(args) {
      var target = findBestWebview(null)
      if (!target) return failure('E_NO_WEBVIEW', 'no Sidebar browser webview found', 'call browser_use_open first')
      var timeout = Math.max(1000, Math.min(60000, Number(args && args.timeoutMs) || 3000))
      var started = Date.now()
      var verifyArgs = {
        url: args && args.url,
        title: args && args.title,
        text: args && args.text,
        element: args && args.element,
      }
      var last = null
      while (Date.now() - started <= timeout) {
        try {
          last = await executeInPage(
            target,
            '(' + verifyRunner.toString() + ')(' + JSON.stringify(verifyArgs) + ')',
          )
        } catch (error) {
          return failure(error && error.code ? error.code : 'E_VERIFY_FAILED', cleanText(error && error.message))
        }
        if (last && last.ok === true && last.passed === true) return last
        await sleep(250)
      }
      if (last && last.ok === true) return last
      return failure('E_VERIFY_FAILED', 'verification could not be evaluated')
    }

    async function dispatch(ctx, op, args) {
      if (op === 'status') {
        try {
          return success(await dispatchStatus())
        } catch (error) {
          return failure('E_CLIENT', cleanText(error && error.message))
        }
      }
      if (op === 'open') {
        setPanelState({ state: 'observing', message: '打开页面' })
        try {
          var openResult = await dispatchOpen(ctx, args || {})
          void ensureFloatingButton()
          return success(openResult)
        } catch (error) {
          setPanelState({ state: 'failed', message: cleanText(error && error.message) })
          return failure(error && error.code ? error.code : 'E_CLIENT', cleanText(error && error.message))
        }
      }
      if (op === 'read') {
        setPanelState({ state: 'observing', message: '读取页面' })
        try {
          var readResult = await dispatchRead(args || {})
          setPanelState({ state: readResult.ok === false ? 'failed' : 'idle', message: readResult.ok === false ? '读取失败' : '就绪' })
          if (readResult.ok !== false) pushPanelStep('读取页面 · ' + String((args && args.mode) || 'ax'), 'done')
          return success(readResult)
        } catch (error) {
          setPanelState({ state: 'failed', message: cleanText(error && error.message) })
          return failure(error && error.code ? error.code : 'E_CLIENT', cleanText(error && error.message))
        }
      }
      if (op === 'resolve') {
        try {
          return success(await dispatchResolve(args || {}))
        } catch (error) {
          return failure(error && error.code ? error.code : 'E_CLIENT', cleanText(error && error.message))
        }
      }
      if (op === 'act') {
        if (panelState.takeover) {
          return failure(
            'E_TAKEOVER',
            'the user has taken over the browser; agent actions are paused',
            'ask the user to click "交还 Agent" in the Browser Use panel, then re-read the page',
          )
        }
        var actAction = String((args && args.action) || '')
        setPanelState({ state: 'acting', message: '执行 ' + actAction })
        try {
          var actResult = await dispatchAct(args || {})
          if (actResult.ok === false) {
            setPanelState({ state: 'failed', message: (actResult.error && actResult.error.message) || '动作失败' })
            pushPanelStep(actAction + ' · ' + ((actResult.error && actResult.error.code) || 'failed'), 'failed')
          } else {
            setPanelState({
              state: 'success',
              message: '动作完成',
              url: actResult.url || panelState.url,
              title: actResult.title || panelState.title,
              generation: actResult.generation || panelState.generation,
            })
            pushPanelStep(actAction + (actResult.target && actResult.target.name ? ' · ' + actResult.target.name : ''), 'done')
            window.setTimeout(function () {
              if (!panelState.takeover && panelState.state === 'success') {
                setPanelState({ state: 'idle', message: '就绪' })
              }
            }, 1800)
          }
          return success(actResult)
        } catch (error) {
          setPanelState({ state: 'failed', message: cleanText(error && error.message) })
          return failure(error && error.code ? error.code : 'E_CLIENT', cleanText(error && error.message))
        }
      }
      if (op === 'verify') {
        try {
          return success(await dispatchVerify(args || {}))
        } catch (error) {
          return failure(error && error.code ? error.code : 'E_CLIENT', cleanText(error && error.message))
        }
      }
      if (op === 'uiState') {
        var patch = args && typeof args === 'object' ? args : {}
        setPanelState({
          state: typeof patch.state === 'string' ? patch.state : panelState.state,
          message: typeof patch.message === 'string' ? patch.message : panelState.message,
        })
        return { ok: true }
      }
      if (op === 'openPanel') {
        try {
          if (!ctx || !ctx.sidebarRight || typeof ctx.sidebarRight.openTab !== 'function') {
            return failure('E_UNSUPPORTED', 'sidebarRight.openTab is unavailable')
          }
          ctx.sidebarRight.openTab(PANEL_KIND, { revealIfOpened: true })
          setPanelState({ registered: true })
          return { ok: true }
        } catch (error) {
          return failure('E_UNSUPPORTED', 'cannot open the Browser Use panel: ' + cleanText(error && error.message))
        }
      }
      return failure('E_BAD_REQUEST', 'unknown browser command: ' + String(op))
    }

    /* ------------------------------------------------------------------ *
     * Bridge loop
     * ------------------------------------------------------------------ */

    function createBridgeLoop(ctx) {
      var controller = new AbortController()
      var disposed = false
      var rendererId = makeRendererId()
      var current = null

      async function handshake(info) {
        var result = await fetchJson(bridgeBase(info) + '/v1/handshake', {
          method: 'POST',
          mode: 'cors',
          cache: 'no-store',
          credentials: 'omit',
          headers: authHeaders(info),
          body: JSON.stringify({
            rendererId: rendererId,
            platform: 'web',
            protocol: PROTOCOL_VERSION,
            focused: document.hasFocus(),
            href: location.href,
          }),
          signal: controller.signal,
        })
        if (result.status === 200 && result.payload && result.payload.ok) {
          setPanelState({ state: 'idle', message: '已连接' })
          void ensureFloatingButton()
          return true
        }
        if (result.status === 401) {
          var unauthorized = new Error('bridge unauthorized')
          unauthorized.code = 'E_UNAUTHORIZED'
          throw unauthorized
        }
        throw new Error('bridge handshake failed with HTTP ' + result.status)
      }

      async function poll(info) {
        var response = await fetch(
          bridgeBase(info) + '/v1/poll?rendererId=' + encodeURIComponent(rendererId) + '&focused=' + (document.hasFocus() ? '1' : '0'),
          {
            method: 'GET',
            mode: 'cors',
            cache: 'no-store',
            credentials: 'omit',
            headers: { Authorization: 'Bearer ' + info.token },
            signal: controller.signal,
          },
        )
        if (response.status === 204) return null
        if (response.status === 401) {
          var unauthorized = new Error('bridge unauthorized')
          unauthorized.code = 'E_UNAUTHORIZED'
          throw unauthorized
        }
        if (!response.ok) throw new Error('bridge poll failed with HTTP ' + response.status)
        return response.json()
      }

      async function postResult(info, id, outcome) {
        var payload = outcome.ok
          ? { id: id, ok: true, data: outcome.data }
          : { id: id, ok: false, error: outcome.error }
        await fetch(bridgeBase(info) + '/v1/result', {
          method: 'POST',
          mode: 'cors',
          cache: 'no-store',
          credentials: 'omit',
          headers: authHeaders(info),
          body: JSON.stringify(payload),
          signal: controller.signal,
        })
      }

      async function run() {
        var backoff = RECONNECT_MIN_MS
        while (!disposed) {
          try {
            current = await resolveBridgeInfo()
            if (!current) {
              await sleep(1000)
              continue
            }
            await handshake(current)
            backoff = RECONNECT_MIN_MS
            void ensureFloatingButton()
            while (!disposed) {
              var command = await poll(current)
              if (disposed) return
              if (!command) continue
              var outcome = await dispatch(ctx, command.op, command.args)
              await postResult(current, command.id, outcome)
            }
          } catch (error) {
            if (disposed || controller.signal.aborted) return
            if (isAuthFailure(error)) {
              bridgeInfo = null
              current = null
              await sleep(300)
              continue
            }
            await sleep(backoff)
            backoff = Math.min(RECONNECT_MAX_MS, backoff * 2)
          }
        }
      }

      void run()

      var floatingTimer = window.setInterval(function () {
        if (!disposed) void ensureFloatingButton()
      }, 4000)
      var annotationTimer = window.setInterval(function () {
        if (!disposed) void pumpAnnotationOutbox()
      }, 600)

      return {
        rendererId: rendererId,
        dispose: function () {
          disposed = true
          try {
            window.clearInterval(floatingTimer)
            window.clearInterval(annotationTimer)
          } catch (error) {
            /* ignore */
          }
          controller.abort()
        },
      }
    }

    /* ------------------------------------------------------------------ *
     * Client plugin entry
     * ------------------------------------------------------------------ */

    return {
      inject: ['sidebarRight'],
      apply: function apply(ctx) {
        ctx.effect(function () {
          var loop = createBridgeLoop(ctx)
          return function () {
            loop.dispose()
          }
        })

        try {
          var React = require('react')
          ctx.inject(['slots', 'sidebarRightTabs'], function (scope) {
            scope.effect(function () {
              function BrowserUsePanel() {
                var pair = React.useState(panelState)
                var snapshot = pair[0]
                var setSnapshot = pair[1]
                React.useEffect(function () {
                  return subscribePanel(setSnapshot)
                }, [])
                var h = React.createElement
                var state = snapshot.state || 'idle'
                var label = PANEL_STATE_LABELS[state] || state
                var steps = (snapshot.steps || []).map(function (step, index) {
                  var dotClass =
                    'bu8f3a2c71_sd ' +
                    (step.status === 'failed'
                      ? 'bu8f3a2c71_sd_failed'
                      : step.status === 'paused'
                        ? 'bu8f3a2c71_sd_paused'
                        : 'bu8f3a2c71_sd_ok')
                  return h('div', { key: String(index) + '-' + step.time, className: 'bu8f3a2c71_step' }, [
                    h('span', { key: 'd', className: dotClass }),
                    h('span', { key: 't' }, step.text),
                  ])
                })
                if (steps.length === 0) {
                  steps = [h('div', { key: 'empty', className: 'bu8f3a2c71_empty' }, '暂无操作记录')]
                }
                return h('div', { className: 'bu8f3a2c71_root bu8f3a2c71_s_' + state }, [
                  h('style', { key: 'css' }, PANEL_CSS),
                  h('div', { key: 'head', className: 'bu8f3a2c71_head' }, [
                    h('span', { key: 'dot', className: 'bu8f3a2c71_dot' }),
                    h('span', { key: 'name', className: 'bu8f3a2c71_name' }, 'Browser Use'),
                    h('span', { key: 'state', className: 'bu8f3a2c71_state' }, label),
                    h(
                      'button',
                      {
                        key: 'takeover',
                        className: 'bu8f3a2c71_btn' + (snapshot.takeover ? ' on' : ''),
                        onClick: function () {
                          toggleTakeover()
                        },
                      },
                      snapshot.takeover ? '交还 Agent' : '接管浏览器',
                    ),
                  ]),
                  h('div', { key: 'page', className: 'bu8f3a2c71_page' }, [
                    h('div', { key: 'title', className: 'bu8f3a2c71_title' }, snapshot.title || '尚未打开页面'),
                    h('div', { key: 'url', className: 'bu8f3a2c71_url' }, snapshot.url || '在聊天里让 Agent 打开网页'),
                  ]),
                  h('div', { key: 'steps', className: 'bu8f3a2c71_steps' }, steps),
                  h(
                    'div',
                    { key: 'foot', className: 'bu8f3a2c71_foot' },
                    'C4 面板 · 审批使用 DSH 原生弹窗 · ' + (snapshot.generation || ''),
                  ),
                ])
              }

              var disposeType = scope.sidebarRightTabs.register({
                id: PANEL_ID,
                kind: PANEL_KIND,
                title: function () {
                  return PANEL_TITLE
                },
                keepMounted: true,
              })
              var disposeSlot = scope.slots.register(
                { name: 'sidebar.right.pane.tab', key: PANEL_ID },
                BrowserUsePanel,
              )
              setPanelState({ registered: true })
              return function () {
                setPanelState({ registered: false })
                try {
                  disposeSlot()
                } catch (error) {
                  /* ignore */
                }
                try {
                  disposeType()
                } catch (error) {
                  /* ignore */
                }
              }
            })
          })
        } catch (error) {
          setPanelState({
            registered: false,
            message: '面板不可用：' + cleanText(error && error.message),
          })
        }

        try {
          ctx.inject(['slots'], function (scope) {
            scope.effect(function () {
              function ComposerBridge(props) {
                if (props && props.inputActions) composerInputActions = props.inputActions
                return null
              }
              var disposeBridge = scope.slots.register(
                { name: 'conversation.composer.dock', id: 'browser-use-composer-bridge', order: 1 },
                ComposerBridge,
              )
              return function () {
                composerInputActions = null
                try {
                  disposeBridge()
                } catch (error) {
                  /* ignore */
                }
              }
            })
          })
        } catch (error) {
          setPanelState({ composerBridge: 'unavailable: ' + cleanText(error && error.message) })
        }
      },
    }
  },
})
