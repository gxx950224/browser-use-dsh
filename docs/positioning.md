# 定位：可见协作 / 批注层

本插件不是官方 Browser Use Provider 的替代品，也不注册 `browserUse` Provider。
它解决的是另一个问题：**让用户看得见 Agent 在网页里做什么，并能用元素批注参与协作。**

## 与官方 Browser Use 的分工

| 场景 | 选择 |
|---|---|
| 每 Session 隔离浏览器、接管已有 Chrome、下载/上传、console/network、完整 MCP 工具面 | 官方 `@deepseek-ai/dsh-browser-use` + Playwright/Chrome DevTools/Stagehand Provider |
| 用户要在内建右侧 Browser 里看 Agent 操作、圈元素写评论、随时接管 | 本插件 |

- 官方 Provider 使用外置 Chromium，按 Session 隔离；本插件使用 DSH 内建右侧 webview，**同一 workspace 的 Session 共享浏览器存储与登录态**。
- 两者不要同时操作同一页面；同时启用会让模型同时看到两套工具，容易选错。
- 本插件不写 `cordis.patch.yml`、不注册官方 Provider、不占用官方工具名；官方 Provider 由用户显式安装/启用。

## 冲突治理

- `browser_use_status` 返回 `official` 与 `vHint`：检测 `browserUse` seam、`@deepseek-ai/dsh-browser-use`、Playwright Provider 包是否存在。
- 检测到官方组件时，模型提示词与状态提示都会建议：自主/隔离任务优先官方 Provider；本插件只做可见协作。
- README、本文件与插件描述都必须保留“非替代品”的定位，避免宣传成 Codex 平替。

## 适用边界

- ✅ 用户看着 Agent 填表、点按钮、读页面；
- ✅ 用户圈选元素写评论，把“哪里不对/改成什么”带给 Agent；
- ✅ 用户接管/交还，检查 Agent 的操作；
- ❌ 多 Session 隔离浏览器；
- ❌ 元素→项目源码→改代码闭环（`setText` 只改本地 DOM）；
- ❌ 下载/上传/多标签/console/network 的完整自动化。
