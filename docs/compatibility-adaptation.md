## 未来 DSH 版本适配策略（0.9.0+）

本插件优先使用**公开/可探测的扩展点**，并在缺失时降级，而不是硬编码 DSH 版本号。

### 版本探测

`browser_use_status` 返回：

- `compat.dshVersion`：通过 Host `typert.getPackage('@deepseek-ai/dsh')` 读取（不可用时为 `null`）；
- `compat.node` / `compat.platform` / `compat.protocol`；
- `client.compat`：`sidebarRight`、`slots`、`sidebarRightTabs`、`composer`、`webview` 是否存在；
- `official`：官方 Browser Use seam / 核心包 / Playwright Provider 是否安装。

### 降级顺序

1. **面板**：`sidebarRightTabs` / `slots` 缺失 → 面板 `registered:false`，工具与桥继续工作；
2. **批注→聊天**：`conversation.composer.dock` 或 `inputActions` 缺失/方法变化 → 不自动提交，回退“复制到剪贴板”并返回真实状态；
3. **页面注入**：webview 不存在或 `executeJavaScript` 不可用 → 不注入按钮，`pickButton` 报告错误；
4. **截图**：CDP 不可用 → `E_CDP_UNAVAILABLE` 并提示启动参数，不影响其它工具；
5. **官方组件共存**：检测到官方 Browser Use 包 → 仅提示，不注册 Provider、不抢占工具名。
6. **Sidebar webview DOM 变化**：`webviewCount:0` / `E_NO_WEBVIEW`，不崩溃；版本升级后用 `browser_use_status` 先做预检。

### 每个 DSH 新版本的最小回归

1. `browser_use_status`：`plugin.version`、`compat`、`client.compat` 均正常；
2. 打开测试页 → read/act/verify → 截图（带 CDP 时）；
3. 批注：选取 → 评论 → 送入聊天（insert 模式只入草稿）；
4. 面板：六态、接管/交还；
5. 审批：敏感动作/新 Origin 的行为符合当前策略。

### 不承诺

- 不承诺 Sidebar webview 内部 DOM 永远稳定；该层变化时以“状态预检 + 错误码 + 降级”应对；
- 不承诺跨大版本 DSH 零改动；出现兼容断裂时发布新 minor，并在 `docs/compatibility.md` 记录。
