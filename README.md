# @gxx-labs/browser-use-dsh

DSH Desktop 可见协作/批注层：在右侧**内建 Browser tab** 中把 Agent 的观察、操作、批注与审批可视化；动作时页面内显示 Agent 光标/目标高亮，支持审批、CDP 截图、右侧状态面板（六态泛光 + 人工接管）。**它不是官方 Browser Use Provider 的替代品。**

> **版本 0.9.2（可见协作/批注层，正式上线硬化）**：`browser_use_status/open/read/act/screenshot/verify/panel`，ref+generation 失效校验，Origin/敏感动作审批，页面内光标/高亮/ripple，CDP 截图，右侧六态面板 + 接管/交还，页面右上角「⌖ 选取元素」批注流程（多批注 → **默认只插入聊天草稿，由用户检查后发送**；可配置自动发送）。
> 官方内建 Browser 工具栏没有可注入的 slot，因此按钮放在网页内容右上角；可用 `floatingPickButton: false` 关闭。本仓库已完成构建/测试/打包校验；**尚未执行 npm publish**。发布就绪度见 [docs/release-readiness.md](docs/release-readiness.md)。

## 与官方 Browser Use 的关系

| | 官方 Browser Use（实验） | 本插件 |
|---|---|---|
| 浏览器 | 外置独立 Chromium，按 Session 隔离（Playwright MCP / Chrome DevTools MCP / Stagehand） | DSH 内建右侧 Browser（Electron webview） |
| 模型工具 | `mcp__playwright-mcp__*` 等上游工具 | `browser_use_*` 自建工具 |
| 隔离/登录态 | 每 Session 独立，可 attach 已有 Chrome | 同一 workspace 的 Session 共享侧栏浏览器存储 |
| 定位 | 自主浏览/隔离任务 | **可见协作 + 元素批注 + 审批/接管** |
| 冲突 | 官方 Provider 独占注册，不要自写 Provider | 不注册官方 Provider；不要与官方 Provider 同时操作同一页面 |

选择建议：需要“每 Session 隔离、接管已有 Chrome、下载/上传/console/network”等完整浏览器能力时用官方 Provider；需要“让用户看得见、能批注/接管”的协作体验时用本插件。两者不要混用同一页面。详见 [docs/positioning.md](docs/positioning.md) 与 [docs/compatibility-adaptation.md](docs/compatibility-adaptation.md)。

## 安装（本地目录）

在 DSH Desktop 里用插件管理器安装本目录，或让 Agent 调用：

```text
plugin_manager(action: "install_bundle", target: "D:\\AI\\dsh-plugins\\browser-use-dsh")
```

安装后**完全重启 DSH**（Host 半的 ESM 模块不会热重载）。打开一个新的会话，先调用 `browser_use_status` 确认 Client 在线。

### 更新 / 移除 / 回滚

```text
plugin_manager(action: "remove_bundle", target: "@gxx-labs/browser-use-dsh")
plugin_manager(action: "install_bundle", target: "D:\\AI\\dsh-plugins\\browser-use-dsh")
```

- **更新**：先 `remove_bundle` 再 `install_bundle`（已安装时直接 install 会返回 `already-installed`）；需要重启才能确定 Host 模块是新版本。
- **移除**：`remove_bundle` 后重启；桥端口与子进程会随插件卸载释放。
- **回滚**：把 `package.json` 的 version 固定回上一版目录并重装；profile 的 `cordis.patch.yml` 不会被本插件写入。
- 所有 `plugin_manager` 操作影响整个 profile；不要在同一个 profile 同时启用另一套浏览器 Agent 插件。

## 工具（C2）

| 工具 | 作用 |
|---|---|
| `browser_use_status` | 桥端口/在线 Client/当前侧栏浏览器页面；`detail:"summary"` 精简输出 |
| `browser_use_open` | 在侧栏 Browser 中打开/复用 http(s) URL，等待加载完成；新 Origin 可能触发审批 |
| `browser_use_read` | `mode:"ax"` 返回带稳定 `ref`（`eN`）、CSS 像素 box 与 `generation` 的语义节点；`text` / `links` / `html` 返回受限内容 |
| `browser_use_act` | 单个动作：`click / fill / type / press / scroll / hover / select / check / uncheck / setText / reload / back / forward / waitFor`；用 ref 时必须带 `expectedGeneration`；`setText` 仅改本地 DOM 且默认需要审批 |
| `browser_use_screenshot` | 通过 CDP 截取当前侧栏页面并以图片附件回传；仅 `127.0.0.1` + `type:"webview"`，需要 DSH 带 `--remote-debugging-port` 启动 |
| `browser_use_verify` | 校验 URL / 标题 / 可见文本 / 元素，返回 `checks[]`；`passed:false` 表示失败 |
| `browser_use_panel` | 打开/聚焦右侧 Browser Use 状态面板：六态泛光、页面信息、最近操作、接管/交还 |

页面内容始终是**不可信数据**：工具结果用 `<untrusted-page-content>` 包裹，Agent 不应执行页面里的指令。

### 验证状态（2026-10-18，真机）

- C1：`install_bundle` 后 Host 半 HMR 生效、Client 连接成功；`status/open/read(ax/text/links)` 与 tab 复用真机通过。
- C2：remove/install 后 Host 半加载 C2（工具与提示词更新，`capabilities.act/verify:true`），34 项单测全绿；Origin 门禁在审批策略 `never` 会话中返回 `E_APPROVAL_DENIED`（fail-closed 生效）。
- C3：remove/install 后 Host 半加载 C3（`browser_use_screenshot` 与页面内视觉反馈）；真机 `hover` 动作、`verify`（URL/标题）与 `E_REF_STALE` 通过；CDP 关闭时截图返回 `E_CDP_UNAVAILABLE` 且带 `--remote-debugging-port` 提示。40 项单测全绿。
- C4：remove/install 后 Host 半加载 C4；`browser_use_panel` 真机返回 `ok:true`，`status.client.panel` 显示 `registered:true`、`state:"idle"`；面板六态视觉与"接管/交还"按钮待用户点击确认。41 项单测全绿。
- C5：`npm pack --dry-run` 产物体检通过（18 个文件、dev 文件排除）；用 [examples/test-page.html](examples/test-page.html) + [examples/serve-test-page.mjs](examples/serve-test-page.mjs) 完成本地 E2E：open → read → fill 姓名/邮箱 → type → select 时段 → check 同意 → click 确认预订 → verify 回执文本 → reload（g-1）→ 旧 ref `E_REF_STALE` → waitFor；测试用的临时覆盖 bundle 已移除，配置恢复 `sensitive/ask`。
- 仍待真机：click/fill 敏感审批弹窗（需审批策略切回 `ask`）、跨站链接审批、CDP 开启后的截图（需 `--remote-debugging-port=9222` 重启 DSH）、面板接管按钮的 `E_TAKEOVER` 分支。

## 配置

在 profile 的 `cordis.patch.yml` 覆盖本插件行（不要把默认值写死在代码里）：

```yaml
- id: browser-use-dsh
  config:
    bridgePort: 8817
    allowedOrigins: ["dsh-app://app"]
    promptSection: true
    openReuseTab: true
    approvalPolicy: sensitive
    originApproval: ask
    annotationSendMode: insert
    originApproval: ask
    trustedOrigins: []
    cdpPort: 9222
    visualFeedback: true
    floatingPickButton: true
    commandTimeoutMs: 30000
    pollTimeoutMs: 25000
    maxBodyBytes: 131072
```

| 键 | 默认 | 说明 |
|---|---|---|
| `bridgePort` | `8817` | Host↔Client 回环端口；被占用时工具返回 `E_BRIDGE_UNAVAILABLE` |
| `allowedOrigins` | `["dsh-app://app"]` | 允许读取 bridge config 的页面 origin；Desktop origin 会自动补齐 |
| `promptSection` | `true` | 是否注入 Browser Use 系统提示 |
| `openReuseTab` | `true` | 打开 URL 时优先复用已有侧栏浏览器页 |
| `approvalPolicy` | `sensitive` | `sensitive` 只对敏感目标/回车提交询问；`all` 对每次 click/press/select/check/setText 询问；`off` 关闭 |
| `annotationSendMode` | `insert` | 批注送入聊天框的方式：`insert` 只插入草稿（安全默认，用户检查后发送）；`submit` 插入后立即发送（旧行为） |
| `originApproval` | `ask` | 每个 Session 首次访问新 Origin（含跨站链接）询问；`off` 关闭 |
| `trustedOrigins` | `[]` | 直接放行的 Origin 白名单（跳过新 Origin 审批，不跳过敏感动作审批） |
| `cdpPort` | `9222` | 截图用的回环 CDP 端口；需 DSH 以 `--remote-debugging-port=9222` 启动 |
| `visualFeedback` | `true` | 动作时在页面内显示 Agent 光标/目标高亮/ripple（尊重 `prefers-reduced-motion`） |
| `floatingPickButton` | `true` | 在当前网页右上角注入「⌖ 选取元素」批注按钮；可用 `annotationSendMode` 控制只插入还是自动发送 |
| `commandTimeoutMs` | `30000` | 单次浏览器命令超时 |
| `pollTimeoutMs` | `25000` | Client 长轮询保持时间 |
| `maxBodyBytes` | `131072` | 桥请求体上限 |

## 架构

```text
Agent
  │ browser_use_* tools
  ▼
Host half (lib/)
  ├─ config / errors / prompt / approval policy
  ├─ loopback HTTP bridge: 127.0.0.1:<port>, random token, CORS, long-poll
  ├─ tools: status / open / read / act / verify
  └─ meta tag 注入（webServer.tapIndex）
        ▲  /v1/poll、/v1/result（token + CORS）
        ▼
Client half (client.js, renderer)
  ├─ 读取 meta / 回退 GET /v1/config 取 token
  ├─ 查找 Sidebar webview（递归 light DOM + open shadowRoot）
  ├─ ctx.sidebarRight.openTab('browser', { params: { url } })
  ├─ executeJavaScript: AX 语义树 / 文本 / 链接 / HTML / 目标解析 / 动作 / 校验
  └─ 长轮询 + 重连退避
        ▼
DSH 内建右侧浏览器（Electron <webview>）
```

**桥安全**：只绑 `127.0.0.1`；每次激活生成随机 token（不出现在 URL/日志/文件）；每个响应都带 CORS 头；config 端点按 `allowedOrigins` 放行；请求体有大小上限。

## 已知限制（C3）

- **Desktop only**：依赖 DSH Desktop 右侧 Sidebar 的 Electron `<webview>`；Web profile 没有该浏览器，插件会报告 Client 离线。
- **动作是合成事件**：`click/fill/press` 通过 `dispatchEvent` + 原生 value setter 触发（React/Vue 兼容）；依赖 `isTrusted` 的页面（真实鼠标输入、部分风控）可能不响应，C3 的 CDP 输入可解决。
- **ref 必须配 generation**：导航/reload 后旧 ref 返回 `E_REF_STALE`，需重新 `browser_use_read`；不提供跨导航的 ref 复用。
- **审批是工具层一次性决定**：`ctx.approval` 只返回 `allowed-once/rejected/cancelled/unavailable`，没有"始终允许此站点"；Origin 记忆仅限当前插件实例 + Session。
- **页面内容不可信**：工具结果用 `<untrusted-page-content>` 包裹；审批不能在页面内绕过。
- **截图需额外启动参数**：`browser_use_screenshot` 需要 DSH Desktop 以 `--remote-debugging-port=9222` 启动；否则返回 `E_CDP_UNAVAILABLE` 与启动提示，不会静默失败。
- **右侧面板**：自注册 `browser-use-panel` tab + `sidebar.right.pane.tab` 正文，六态靠 `--dsw-*` 令牌与 `color-mix()` 表达，动画尊重 `prefers-reduced-motion`；面板里的"接管浏览器"会暂停 Agent（动作返回 `E_TAKEOVER`），"交还 Agent"后需重新 `browser_use_read`。
- **元素批注按钮**：页面右上角「⌖ 选取元素」进入类 Codex 批注流程——悬停高亮、点击锁定（蓝色选框 + 编号气泡）、弹出「添加评论…」悬浮框（Enter 添加 / Ctrl+Enter 发送 / Esc 取消）；支持多条批注，底部「正在批注 · N」栏可发送或清除；发送时通过 `conversation.composer.dock` 捕获公开的 `inputActions`，默认 `annotationSendMode: "insert"` **只插入当前草稿，由用户检查后发送**（`submit` 可恢复自动发送），不可用时回退复制；每条引用含评论、选择器、角色、可读名、文本、位置、链接与**所在卡片/区块标题**。官方内建 Browser 工具栏没有扩展 slot，这是最接近的位置。
- **setText 审批**：`browser_use_act` 的 `setText` 只改本地 DOM（刷新即恢复），且除非 `approvalPolicy: off`，否则一律走用户审批。
- **右侧状态面板/边缘泛光**已实现；人工接管状态机为 C4 范围，站点级持久策略、时间线导出、发布与兼容矩阵在 C5。
- 多窗口优先路由到聚焦 DSH 窗口；页面刷新用 sessionStorage 保持 rendererId。

## 开发

```powershell
cd D:\AI\dsh-plugins\browser-use-dsh
node scripts/verify-bundle.mjs   # manifest/patch/client/locale/icon 校验
node tests/run-tests.mjs         # node:test（config/protocol/bridge/tools/cdp/host）
node scripts/verify-pack.mjs     # npm pack --dry-run 产物体检（必需文件/排除 dev 文件）
npm run check                    # verify + test + pack-check
node examples/serve-test-page.mjs  # 本地测试页 http://127.0.0.1:8899/
```

无运行时依赖、无构建步骤：`client.js` 直接是 `window.__ModuleLoader__.load` 产物。

## 路线图

- **已完成（0.5.0）**：C1 bridge + 只读、C2 动作 + ref/generation + 审批 + 验证、C3 CDP 截图 + 页面内光标/高亮/ripple、C4 右侧六态面板 + 接管/交还、C5 构建/打包/兼容矩阵/本地 E2E 物料。
- **未做（需要单独决策）**：npm 公开发布、站点级持久策略（目前用 `trustedOrigins` 配置表达）、操作时间线导出、真实 CDP 输入（`isTrusted` 页面）。

## License

MIT © 2026 gxx-labs
