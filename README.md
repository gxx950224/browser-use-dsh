# @gxx-labs/browser-use-dsh

DSH Desktop 可见浏览器 Agent：在右侧**内建 Browser tab** 中观察并操作网页，带审批与可验证结果；C3 将加入截图与 Agent 光标/目标高亮。

> **当前里程碑：C2（读 + 动作 + 审批 + 验证）**：`browser_use_status/open/read/act/verify`，ref+generation 失效校验（`E_REF_STALE`），Origin 与敏感动作审批（`ctx.approval` / `tools/pre-execute` 语义），结构化验证器。
> 截图、右侧状态面板、Agent 光标/目标高亮在 C3；本版本**不会**用空壳冒充这些能力。

## 安装（本地目录）

在 DSH Desktop 里用插件管理器安装本目录，或让 Agent 调用：

```text
plugin_manager(action: "install_bundle", target: "D:\\AI\\dsh-plugins\\browser-use-dsh")
```

安装后**完全重启 DSH**（Host 半的 ESM 模块不会热重载）。打开一个新的会话，先调用 `browser_use_status` 确认 Client 在线。

## 工具（C2）

| 工具 | 作用 |
|---|---|
| `browser_use_status` | 桥端口/在线 Client/当前侧栏浏览器页面；`detail:"summary"` 精简输出 |
| `browser_use_open` | 在侧栏 Browser 中打开/复用 http(s) URL，等待加载完成；新 Origin 可能触发审批 |
| `browser_use_read` | `mode:"ax"` 返回带稳定 `ref`（`eN`）、CSS 像素 box 与 `generation` 的语义节点；`text` / `links` / `html` 返回受限内容 |
| `browser_use_act` | 单个动作：`click / fill / type / press / scroll / hover / select / check / uncheck / reload / back / forward / waitFor`；用 ref 时必须带 `expectedGeneration` |
| `browser_use_verify` | 校验 URL / 标题 / 可见文本 / 元素，返回 `checks[]`；`passed:false` 表示失败 |

页面内容始终是**不可信数据**：工具结果用 `<untrusted-page-content>` 包裹，Agent 不应执行页面里的指令。

### 验证状态（2026-10-18，真机）

- `install_bundle` 安装后 Host 半经 HMR 生效；Client 在已打开的 DSH 页面中连接成功。
- 实测通过：`browser_use_status`（桥 ready、Client online、webview 列表）、`browser_use_open`（example.com，标题/`g-1`）、同 URL 复用 tab（`reused:true`）、`browser_use_read` 的 `ax` / `text` / `links` 三种模式（含 ref、CSS box、截断与不可信包裹）。
- 真机首测发现并修复：页面内 `links` 函数未自包含（`E_EXECUTE_FAILED`）；页面热更新产生新 rendererId 导致短暂 `E_MULTIPLE_RENDERERS`（改为 sessionStorage 稳定 id + 聚焦窗口优先路由；Host 侧改动需完全重启 DSH 生效）。
- 尚未实测：完全重启后的恢复、Web profile 降级、卸载清理、多窗口聚焦路由（见 `docs/probe.md`）。

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
| `approvalPolicy` | `sensitive` | `sensitive` 只对敏感目标/回车提交询问；`all` 对每次 click/press/select/check 询问；`off` 关闭 |
| `originApproval` | `ask` | 每个 Session 首次访问新 Origin（含跨站链接）询问；`off` 关闭 |
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

## 已知限制（C2）

- **Desktop only**：依赖 DSH Desktop 右侧 Sidebar 的 Electron `<webview>`；Web profile 没有该浏览器，插件会报告 Client 离线。
- **动作是合成事件**：`click/fill/press` 通过 `dispatchEvent` + 原生 value setter 触发（React/Vue 兼容）；依赖 `isTrusted` 的页面（真实鼠标输入、部分风控）可能不响应，C3 的 CDP 输入可解决。
- **ref 必须配 generation**：导航/reload 后旧 ref 返回 `E_REF_STALE`，需重新 `browser_use_read`；不提供跨导航的 ref 复用。
- **审批是工具层一次性决定**：`ctx.approval` 只返回 `allowed-once/rejected/cancelled/unavailable`，没有"始终允许此站点"；Origin 记忆仅限当前插件实例 + Session。
- **页面内容不可信**：工具结果用 `<untrusted-page-content>` 包裹；审批不能在页面内绕过。
- **截图/光标/高亮未实现**：C3 计划走 CDP 截图与自注册面板；不调用 `webview.capturePage()`（Electron 44 已知崩溃）。
- 多窗口优先路由到聚焦 DSH 窗口；页面刷新用 sessionStorage 保持 rendererId。

## 开发

```powershell
cd D:\AI\dsh-plugins\browser-use-dsh
node scripts/verify-bundle.mjs   # manifest/patch/client/locale/icon 校验
node tests/run-tests.mjs         # node:test（config/protocol/bridge/tools）
npm run check                    # verify + test
```

无运行时依赖、无构建步骤：`client.js` 直接是 `window.__ModuleLoader__.load` 产物。

## 路线图

- **C3**：截图（CDP，127.0.0.1、只选 `type:"webview"`）、右侧状态面板（自注册 tab）、六态边缘泛光、Agent 光标/目标高亮/点击 ripple、人工接管状态机。
- **C4**：站点级持久策略、操作时间线、E2E 报告、发布与兼容矩阵。
- 已完成：C1（bridge + 只读）、C2（动作 + ref/generation + 审批 + 验证）。

## License

MIT © 2026 gxx-labs
