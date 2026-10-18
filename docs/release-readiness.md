# 发布就绪度评估（0.8.3）

评估对象：`@gxx-labs/browser-use-dsh`，2026-10-18。
结论先行：**不满足“正式上线/稳定版”要求；可作为内部 Alpha / 小范围 Beta。**
当前版本解决的是“DSH 内建浏览器 + 人机协作批注”这个细分场景，而不是 Codex Browser Use 的完整替代品。

---

## 1. DSH 自身是否已有类似功能？

有，但和本插件不是同一层。

| 能力 | DSH 官方现状 | 与本插件关系 |
|---|---|---|
| Browser Use 服务 | `@deepseek-ai/dsh-browser-use`（实验包，注册槽服务）存在 | 本插件没有使用它 |
| 浏览器 Provider | 实验包：Playwright MCP、Chrome DevTools MCP、Stagehand；按 Session 独立 launch/attach | 官方路线是“外置独立 Chromium” |
| 安装状态 | 本机 DSH Desktop 0.2.1-rc.2 **未捆绑/未安装**；需显式安装实验包 | 本插件是独立的第三方 bundle |
| DSH 内建 Sidebar Browser | 有，但官方明确“无模型体验”：不注册工具/prompt/Session event | 本插件通过 Client 插件 + bridge 操作它 |
| 可视化/批注 | 官方 Provider 不带 DSH 内 UI；内建浏览器没有 Agent 光标/注释 API | **本插件的主要差异化** |
| 每 Session 隔离 | 官方 Provider 支持（launch 每 Session 独立、attach 接管已有浏览器） | 本插件**不支持**：共享侧栏 webview、同 workspace 共享 Cookie |

补充证据：
- 官方 Browser Use 文档强调“provider 独占注册、无通用浏览器操作 API、按 Session 拥有”；
- 社区 DSH 4.1 文档把 Browser Use / Computer Use 标为实验功能、默认关闭，默认 Provider 是 Playwright MCP（可见独立浏览器 + 隔离会话）；
- 官方 Sidebar Browser README 明确“模型体验：无”。

**结论**：DSH 已有“自主浏览器”能力（实验、需安装），但没有“可见侧栏浏览器 + 人机批注”这一层。本插件与官方是**互补但功能重叠**：如果同时启用，用户会困惑“该用哪个浏览器”，也会出现 Cookie/会话边界差异。

---

## 2. 与 Codex 的浏览器/批注体验对标

Codex 的公开行为（结合官方 issue 与截图）：

- 应用内可见浏览器 + Agent 操作；
- 元素选择/批注（Annotation）模式：点选元素、写评论、把元素上下文带回对话；
- 用户在 Agent 操作期间可接管；已知 issue 是“Agent 持有时批注不可用”，期望暂停/接管后再批注；
- 批注是聊天的第一等输入（composer 中的“N 条注释”chip），而不是一条普通文本消息；
- 更深一层：把元素映射回项目代码，进入“改代码 → 预览 → 验证”的闭环。

本插件当前对标情况：

| Codex 能力 | 本插件 | 差距 |
|---|---|---|
| 可见浏览器内操作 | ✅ 右侧内建 Browser | — |
| Agent 光标/目标高亮/ripple | ✅ 页面内 Shadow DOM overlay | 无页面内常驻操作轨迹 |
| 元素批注 + 评论 | ✅ 多批注、编号气泡、Enter/Ctrl+Enter、上下文标题 | 不是 composer chip；是自动插入文本并 submit |
| 批注→对话 | ✅ `inputActions.insertText/setDraft + submit()` | 会与现有草稿合并后直接发送；无预览确认 |
| 用户接管 | ✅ 面板“接管/交还”、`E_TAKEOVER` | 接管 E2E 未真机验证；批注与 Agent 动作并发无锁 |
| 截图 | ⚠️ CDP 截图（需 `--remote-debugging-port`） | 默认不可用；成功路径未真机验证 |
| 每 Session 独立浏览器 | ❌ 共享 Sidebar webview（同 workspace 共享 Cookie） | 与官方 Provider 路线相反 |
| 上传/下载/多标签管理 | ❌ 未提供 | Codex/官方 Provider 有更完整工具面 |
| 元素→源码映射、改代码闭环 | ❌ `setText` 只改本地 DOM | **最大差距** |
| 控制台/网络证据 | ❌ 未提供（CDP 只做截图） | 官方 Chrome DevTools MCP 可覆盖 |
| 录制/回放、站点技能 | ❌ | 官方/Codex 有生态级方案 |

**结论**：交互形态已经接近 Codex 的“看得见 + 可批注 + 可接管”，但**产品闭环（元素→代码→验证）和会话隔离远未对标**。如果对外宣称“Codex 同款”，会过度承诺。

---

## 3. 发布门槛评估

### P0：正式上线前必须解决

1. **产品定位与官方 Browser Use 的关系**
   - 明确本插件是“可见协作/批注层”，不是“自主隔离浏览器”的替代；
   - 增加冲突提示（不要与官方 Playwright MCP Provider 同时启用），避免用户误用；
   - README/插件描述里写清“共享侧栏浏览器、同 workspace 共享 Cookie”。

2. **会话/隐私边界**
   - 共享 Sidebar webview 意味着跨 Session 的 Cookie、登录态、页面内存共享；
   - 批注会把页面文本/选择器/评论发进模型上下文；需明确提示与最小化（PII/密钥脱敏、长度上限）；
   - `setText` 会无审批修改任意页面文本，应在 Beta 前加审批或配置开关，并明确“仅本地 DOM”。

3. **自动发送的草稿风险**
   - 当前实现把批注 `insertText` 到现有草稿后立即 `submit()`；若用户原本有草稿，会一起被发送；
   - 正式版需要：优先“只插入不发送”或“预览后确认”，至少在草稿非空时阻止自动发送。

4. **DSH 内部扩展点稳定性**
   - 依赖 `sidebarRight` / `sidebarRightTabs` / `slots` / `conversation.composer.dock` / `inputActions` / Sidebar webview DOM；
   - 这些不是本插件控制的稳定 API，DSH 升级会破坏；
   - 需要版本闸门（检测 DSH 版本/服务能力，不满足时优雅降级）和下一版 DSH 的回归测试。

5. **发布工程**
   - 尚未 `npm publish`；缺少 `repository/homepage/bugs`、CI、自动化真机 E2E、支持矩阵版本记录；
   - 只有 41 项单元测试与一次手工本地 E2E；截图成功、审批弹窗、接管、多窗口、Web profile 都未真机复测。

### P1：Beta 可以带着这些问题，但要写进已知限制

- 批注 UI 仅中文、无完整键盘焦点/无障碍；页面 overlay 使用硬编码颜色（页面上下文拿不到 DSH token）。
- 元素只给选择器/上下文，不能映射到项目源码；“改成 XXX”目前只是 DOM 文本替换。
- 批注模式与 Agent 动作并发无锁，可能出现“边操作边批注”的竞态（Codex 也遇到过同类 issue）。
- AX 读取大页面可能慢（900+ 节点、getComputedStyle 遍历），无分页/增量。
- 每 600ms 的 outbox 轮询、每 4s 的注入检查是固定开销。
- 无遥测/使用说明/隐私政策；npm 包缺 `repository` 等元数据。

### P2：可后续打磨

- locale en 文案与中文 UI 不一致、面板文案未走 locale；
- 图标/截图/深色主题下的批注 UI 一致性；
- 错误码/提示统一、日志脱敏审计；
- 多实例端口冲突提示、profile 迁移/回滚文档。

---

## 4. 建议的发布路径

1. **现在：内部 Alpha**（本机安装）——已达成。
2. **Beta 前置（建议 1–2 周）**：
   - 产品定位、冲突提示、隐私说明；
   - 自动发送改为“预览/确认”或至少不吞用户草稿；
   - `setText` 审批/开关；
   - DSH 版本闸门 + 下个 rc 回归；
   - CI：verify + unit + pack-check + 一条真实浏览器 E2E（本地 test page）；
   - npm `next` 标签发布，README 标 EXPERIMENTAL。
3. **1.0 前置**：
   - 官方 Browser Use Provider 集成或明确“仅内建侧栏”；
   - 元素→源码映射/编辑闭环；
   - 控制台/网络/多标签/上传下载；
   - 跨平台/多 DSH 版本矩阵；
   - 会话隔离方案（或与官方 Provider 二选一的产品策略）。

---

## 5. 评分

| 维度 | 分数 | 说明 |
|---|---|---|
| 功能完成度（本细分场景） | 7/10 | 读/动作/审批/截图/验证/面板/批注/发送链路齐 |
| 与 Codex 对标 | 4/10 | 交互像，缺源码闭环与会话隔离 |
| 与 DSH 官方能力协同 | 4/10 | 互补但重叠，未做冲突治理 |
| 稳定性/兼容性 | 4/10 | 单版本验证，内部扩展点依赖重 |
| 安全/隐私 | 6/10 | 桥接/审批/不可信包裹到位；共享 Cookie、自动发送、setText 待治理 |
| 发布工程 | 3/10 | 未 publish、无 CI、无自动化 E2E、元数据不全 |
| 文档/可维护性 | 7/10 | README/CHANGELOG/兼容矩阵/probe 齐 |

**总评：约 5/10，适合内部 Alpha；不建议以“正式版/Codex 平替”对外发布。**

---

## 0.9.0 硬化结果（2026-10-18）

已完成：

- 定位改为“可见协作/批注层”，新增 `docs/positioning.md` 与官方组件探测/冲突提示；
- `annotationSendMode` 默认 `insert`（只入草稿，不自动发送），`submit` 保留为显式配置；
- `setText` 强制审批（`approvalPolicy: off` 除外）；
- `browser_use_status.compat` / `client.compat` 做 DSH 版本与客户端能力预检；
- 面板/ComposerBridge 注册失败不再炸整插件，批注回退剪贴板；
- 增加 CI（verify + tests + pack-check）与兼容适配文档。

仍不建议直接发 1.0：

- 共享侧栏浏览器的 Session/Cookie 边界仍未改变（需要产品上明确二选一）；
- 官方 Browser Use Provider 共存只做提示，未做“同页面互斥锁”；
- 截图成功路径、接管、审批 UI、多窗口、Web profile 仍缺真机回归；
- 元素→源码编辑闭环、上传/下载/多标签/console/network 仍未覆盖；
- npm 公开发布、repository/homepage/bugs 元数据、发布回滚演练未完成。

建议：以 `0.9.0` 作为 **Beta / next 标签** 发布候选；完成真机回归与元数据后再谈正式版。

---

## 6. 外部参考

- DSH Browser Use 子系统文档：https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/browser-use.md
- Playwright MCP Provider：https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/experimental/browser-use-playwright-mcp/README.zh.md
- DSH 4.1 社区文档（Browser Use 实验、默认 Playwright MCP）：https://github.com/ningbainb/deepseek-harness-desktop/blob/main/docs/smart-control.md
- Codex 批注/元素选择 issue（功能存在、Agent 持有时不可用）：https://github.com/openai/codex/issues/49935 、https://github.com/openai/codex/issues/49278
