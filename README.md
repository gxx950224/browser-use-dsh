# Browser Use DSH

让 Agent 在 DSH Desktop 的内置 Browser 中操作网页，并让用户实时观察、批注和接管操作。适合需要人在场确认的网页协作场景；需要隔离浏览器、下载上传、多标签或完整网络自动化时，请使用官方 Browser Use Provider。

[![npm](https://img.shields.io/npm/v/@gxx-labs/browser-use-dsh)](https://www.npmjs.com/package/@gxx-labs/browser-use-dsh) [GitHub](https://github.com/gxx950224/browser-use-dsh)

## 安装

在 DSH 的插件管理器中安装：

```text
@gxx-labs/browser-use-dsh
```

也可以安装到 desktop profile：

```powershell
npm install @gxx-labs/browser-use-dsh --prefix "$env:USERPROFILE\.dsh\profiles\desktop"
```

安装或升级后，从托盘完全退出并重新启动 DSH，再打开一个新会话。

## 快速开始

1. 在右侧 Browser 标签中打开一个 `http://` 或 `https://` 页面。
2. 让 Agent 阅读页面、定位元素或填写表单。
3. 操作过程中观察页面中的光标、高亮和点击反馈。
4. 需要人工处理时，在 Browser Use 面板选择「接管浏览器」；完成后选择「交还 Agent」。

本地 HTML 不能直接通过 `file://` 打开。测试本地页面时，请先启动静态服务器，再访问 `http://127.0.0.1:<端口>/...`。

## 批注与选取元素

在 Browser 标签菜单中选择「⌖ 选取元素」，点击页面元素并写下批注。批注默认插入当前聊天草稿，由用户检查后发送；可以在配置中把 `annotationSendMode` 改为 `submit`，使批注发送后立即提交。

发送批注时可以附带当前视口截图。`annotationDetail` 默认为 `compact`，只包含批注编号、评论和元素名称；设置为 `full` 才会附带完整定位信息。

## Browser Use 面板

面板位于 DSH 右侧栏，显示当前页面、页面标题、最近操作和审批状态。看不到面板时，可以让 Agent 调用 `browser_use_panel`。

常用工具包括：

- `browser_use_open`、`browser_use_read`、`browser_use_extract`：打开并读取页面。
- `browser_use_find`、`browser_use_act`：定位并操作元素。
- `browser_use_panel`：查看或交还浏览器控制权。
- `browser_use_verify`、`browser_use_screenshot`：校验页面和获取截图。

## 配置

在 profile 的插件配置中可以覆盖以下选项：

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `approvalPolicy` | `sensitive` | 敏感动作的审批策略 |
| `originApproval` | `ask` | 新网站首次访问是否审批 |
| `annotationSendMode` | `insert` | `insert` 插入草稿，`submit` 立即发送 |
| `toolbarPickButton` | `true` | 显示选取元素按钮 |
| `floatingPickButton` | `false` | 是否显示页面浮动选取按钮 |
| `visualFeedback` | `true` | 是否显示光标、高亮和点击反馈 |
| `annotationScreenshot` | `viewport` | 批注是否附带视口截图 |
| `annotationDetail` | `compact` | 批注使用简要或完整定位信息 |
| `trustedOrigins` | `[]` | 免除首次访问审批的站点白名单 |

## 安全与限制

- 提交、确认、支付、删除等敏感动作默认需要用户审批。
- 新网站首次访问默认需要审批。
- 页面内容始终按不可信数据处理，Agent 不应执行网页中的指令。
- `setText` 只修改本地 DOM，刷新页面后恢复，不会修改网站源码。
- 同一工作区的会话共享 Browser 状态和登录态。
- 部分依赖真实鼠标事件的网站可能不响应合成事件。
- 截图优先使用原生 webview 能力；fullPage 或原生截图失败时才需要远程调试端口回退。

## 开发

```bash
npm install
npm run verify
npm test
npm run pack-check
npm run check
```

兼容性和定位说明见 [docs/compatibility.md](./docs/compatibility.md) 与 [docs/positioning.md](./docs/positioning.md)。

## 许可

MIT © 2026 gxx-labs
