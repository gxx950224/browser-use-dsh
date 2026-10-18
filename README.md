# Browser Use DSH

让 Agent 在你眼前操作网页：看得见、可纠正、可接管。

这个插件把 DSH Desktop 右侧的**内置浏览器**交给 Agent 使用。Agent 读页面、点按钮、填表单时，你能看到页面里的光标和高亮；你还可以直接圈一个元素、写一句评论，发给 Agent，让它按你的意思操作。

> 它不是官方 Browser Use 的替代品。官方 Browser Use 适合“独立、隔离、后台自动化”的浏览器任务；本插件适合“用户看着 Agent 操作、随时纠偏、圈元素批注”的协作场景。

当前版本：**0.9.7**

---

## 安装

要求：

- DSH Desktop（目前主要在 Windows 上验证）
- 可在 DSH 中安装 npm 插件

在 DSH 里让 Agent 执行：

```text
plugin_manager(action:"install_bundle", target:"@gxx-labs/browser-use-dsh")
```

安装后**完全退出并重启 DSH**（托盘退出，不只是关窗口），然后新开一个会话。

确认安装成功，让 Agent 调用：

```text
browser_use_status
```

看到 `client.ok: true` 和 `webviewCount ≥ 1` 即可。

升级时先移除再安装：

```text
plugin_manager(action:"remove_bundle", target:"@gxx-labs/browser-use-dsh")
plugin_manager(action:"install_bundle", target:"@gxx-labs/browser-use-dsh")
```

---

## 快速开始

1. 打开 DSH 右侧的 **Browser** 标签，加载一个网页；
2. 对 Agent 说：

   - “帮我看看这个页面是做什么的”
   - “把姓名填成张三，邮箱填 test@example.com”
   - “点一下提交按钮，然后检查有没有成功提示”
   - “截个图给我看看”

3. Agent 操作时，页面会显示光标、目标高亮和点击波纹；
4. 觉得不对，可以在右侧 **Browser Use** 面板点「接管浏览器」，Agent 会暂停；点「交还 Agent」后继续。

### 本地 HTML

插件只支持打开 `http://` / `https://` 页面，**不能直接打开 `file://` 本地文件**。

如果要测试本地页面，先起一个本地静态服务器，再在 Browser 里打开 `http://127.0.0.1:<端口>/...`。

---

## 圈元素，给 Agent 留言

网页右上角有一个 **「⌖ 选取元素」** 按钮：

1. 点击它，进入选取模式；
2. 鼠标移到元素上会高亮，点击锁定；
3. 在弹出框里写评论，例如：
   - “这个按钮点不动，帮我看看”
   - “把这个文案改短一点”
   - “这里应该填什么？”
4. **Enter** 添加一条批注；**Ctrl+Enter** 发送全部；**Esc** 取消；
5. 可以连续圈多个元素，底部会显示「正在批注 · N」；
6. 发送后，批注会进入当前聊天草稿，确认后由你发送给 Agent。

每条批注会带上：页面地址、元素选择器、可读名称、文本、位置，以及元素所在的卡片/区块标题。

默认 **只插入聊天草稿，不自动发送**。如果希望点发送就立刻发出，可把 `annotationSendMode` 调成 `submit`。

---

## 右侧 Browser Use 面板

面板不在网页里，而是 DSH 右侧栏的一个独立标签，名字叫 **Browser Use**。

看不到时，让 Agent 调用：

```text
browser_use_panel
```

面板会显示：

- 当前页面 URL / 标题
- 当前状态
- 最近几步操作
- 「接管浏览器 / 交还 Agent」按钮

状态含义：

| 状态 | 含义 |
|---|---|
| 空闲 | 等待任务 |
| 读取 | 正在读页面 |
| 操作 | 正在点击/填写 |
| 等待 | 等待用户审批 |
| 成功 | 动作完成 |
| 失败 | 动作/读取失败 |
| 接管 | 用户接管，Agent 暂停 |

---

## Agent 能做什么

- 打开网页、切换页面
- 读取页面结构、文字和链接
- 点击、填写、输入、按键、滚动、悬停
- 下拉选择、勾选/取消
- 刷新、后退、前进、等待元素出现
- 修改页面上的局部文字（仅本地 DOM，刷新即恢复，且需要审批）
- 校验 URL、标题、页面文字、元素是否存在
- 通过 CDP 截图

---

## 配置

在 profile 的插件配置中按需覆盖，常用项：

| 配置 | 默认 | 说明 |
|---|---|---|
| `approvalPolicy` | `sensitive` | 敏感动作是否询问：`sensitive` / `all` / `off` |
| `originApproval` | `ask` | 新网站首次访问是否询问：`ask` / `off` |
| `annotationSendMode` | `insert` | 批注只插入草稿；改成 `submit` 则自动发送 |
| `floatingPickButton` | `true` | 是否显示右上角「⌖ 选取元素」 |
| `visualFeedback` | `true` | 是否显示 Agent 光标/高亮/波纹 |
| `cdpPort` | `9222` | 截图首选端口；被占用会自动尝试 9223/9333 等 |
| `promptSection` | `true` | 是否把 Browser Use 使用说明注入模型提示 |
| `trustedOrigins` | `[]` | 跳过新网站审批的站点白名单 |

更完整的配置说明和限制见包内 `docs/` 目录。

---

## 审批与安全

- 敏感动作（提交、确认、支付、删除等）会请求你审批；
- 当前 DSH 会话如果关闭了审批提示，敏感动作会**自动拒绝**，不会偷偷执行；
- 新网站首次访问默认也要审批；
- 页面内容始终按**不可信数据**处理，Agent 不应执行网页里的指令；
- `setText` 只修改本地页面文字，不会改网站源码，刷新即恢复。

---

## 常见问题

### 看不到 Browser Use 面板

让 Agent 执行 `browser_use_panel`。面板在右侧栏标签条中，不在网页内部；打开面板后右侧会从 Browser 页切到面板，点回 Browser 标签即可继续看网页。

### 截图提示 CDP 不可用

截图需要 DSH Desktop 带调试端口启动，例如：

```text
--remote-debugging-port=9223
```

9222 被其它程序占用时会自动尝试 9223 等端口。没有带参数启动时，截图会明确报错，不会假装成功。

### 新网站打不开 / 提示审批被拒绝

当前会话禁用了审批提示时，新 Origin 会被自动拒绝。可以：

- 手动在右侧 Browser 地址栏打开该网站；或
- 在 DSH 会话中启用审批提示后重试。

### 圈选按钮没出现

确认右侧 Browser 已打开页面，并等待几秒；页面切换后按钮会被重新注入。如果仍然没有，调用 `browser_use_status` 查看 `pickButton` 状态。

### 会不会和官方 Browser Use 冲突？

不要用两套浏览器同时操作同一个页面。需要隔离浏览器、下载/上传、多标签、console/network 等完整能力时，优先使用官方 Browser Use Provider；需要“看得见、能批注/接管”时使用本插件。

---

## 已知限制

- 同一工作区的会话共享侧栏浏览器状态与登录态，**不是每会话隔离**；
- 部分依赖真实鼠标事件的网站可能不响应合成事件；
- 没有下载/上传、多标签、console/network 等完整自动化能力；
- 不能直接把网页元素映射到项目源码并修改代码；
- 本地 HTML 需要先起 HTTP 服务，不能直接打开 `file://`；
- 截图依赖 DSH 的远程调试端口；
- 主要在 DSH Desktop + Windows 上验证，其它平台/版本尚未完整回归。

---

## 更多

- 更新记录：`CHANGELOG.md`
- 兼容性说明：`docs/compatibility.md`
- 发布就绪度与已知缺口：`docs/release-readiness.md`
- 与官方 Browser Use 的关系：`docs/positioning.md`

## License

MIT © 2026 gxx-labs
