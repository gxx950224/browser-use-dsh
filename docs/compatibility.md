# 兼容性矩阵

本插件依赖 DSH Desktop 的客户端扩展点与内建 Sidebar 浏览器；下表是**实测过的**组合，
不是推测范围。未列出的组合请在 Phase 0 用 `docs/probe.md` 自行验证后再升级。

## DSH / Electron

| DSH Desktop | Electron | Node | 结果 | 证据 |
|---|---|---|---|---|
| `0.2.1-rc.2` | `44.7.0` | `24.21.0` | ✅ 已实测（C1–C4 主要路径） | `docs/probe.md` 1–24 行 |
| 其它 `0.2.x` / `0.3.x` | 未测 | 未测 | ⚠️ 未验证 | 升级前跑一遍 probe |
| Web profile | — | — | ❌ 不支持 | 没有 Sidebar Browser webview；插件会报 Client 离线 |

## 运行平台

| 平台 | 结果 | 说明 |
|---|---|---|
| Windows x64 | ✅ 已实测 | 开发与真机环境 |
| macOS | ⚠️ 未测 | Electron `<webview>` 路径理论可用，未验证 |
| Linux | ⚠️ 未测 | 同上 |

## 能力依赖

| 能力 | 依赖 | 缺失时的行为 |
|---|---|---|
| `status/open/read/act/verify` | DSH Sidebar Browser（Electron webview） | `E_NO_WEBVIEW` / Client 离线 |
| `panel` | `slots` + `sidebarRightTabs` 客户端服务 | 桥继续工作，仅面板不注册 |
| `screenshot` | DSH 以 `--remote-debugging-port=<cdpPort>` 启动 | `E_CDP_UNAVAILABLE` + 启动提示 |
| 审批 | `ctx.approval` 与内建 approval UI | 无 answerer/`never` 策略时 fail-closed |
| 图片回传 | `ctx.attachments.saveImage` + 支持图片输入的模型路由 | `E_ATTACHMENT_UNAVAILABLE` |

## 版本策略

- `@gxx-labs/browser-use-dsh` 目前是 **0.x**：API/配置字段可能随 DSH 客户端扩展点变化。
- 升级 DSH 前先记录 `browser_use_status.plugin.version`，升级后重跑 `docs/probe.md`。
- 宿主 peer 只使用 `@deepseek-ai/dsh-client-ui-sidebar-right`（客户端激活顺序）；Host 半没有
  运行时 `@deepseek-ai/*` 依赖，避免被 DSH 内部包版本绑死。
