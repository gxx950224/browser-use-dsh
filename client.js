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
      return { version: value.version || PROTOCOL_VERSION, port: Number(value.port), token: String(value.token) }
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
          var type = cleanText((element.getAttribute('type') || 'text').toLowerCase())
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

    /* ------------------------------------------------------------------ *
     * Command dispatch
     * ------------------------------------------------------------------ */

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
        try {
          return success(await dispatchOpen(ctx, args || {}))
        } catch (error) {
          return failure(error && error.code ? error.code : 'E_CLIENT', cleanText(error && error.message))
        }
      }
      if (op === 'read') {
        try {
          return success(await dispatchRead(args || {}))
        } catch (error) {
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
        try {
          return success(await dispatchAct(args || {}))
        } catch (error) {
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
        if (result.status === 200 && result.payload && result.payload.ok) return true
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

      return {
        rendererId: rendererId,
        dispose: function () {
          disposed = true
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
      },
    }
  },
})
