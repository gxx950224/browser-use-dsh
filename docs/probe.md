# M0 live probe（安装后由真机填写）

本文件记录 C1 需要真机确认的平台事实。单元测试不能替代 DSH 桌面安装后的实测。

| # | 探针 | 期望 | 实测 | 结论 |
|---|---|---|---|---|
| 1 | 插件加载 | 完全重启后 Config 清单出现 `browser-use-dsh` 行，无加载错误 | | 待填 |
| 2 | Host 桥监听 | `browser_use_status` 返回 `bridge.ready:true`，端口与配置一致 | | 待填 |
| 3 | Client 在线 | 新会话 `browser_use_status` 返回 `bridge.online:true` 与 `client.webviewCount≥1` | | 待填 |
| 4 | 侧栏浏览器打开 | `browser_use_open {url:"https://example.com/"}` 打开/复用右侧 Browser tab | | 待填 |
| 5 | AX 读取 | `browser_use_read {mode:"ax"}` 返回节点、`eN` ref 与 box，内容包在 `<untrusted-page-content>` | | 待填 |
| 6 | text/links | `read {mode:"text"}`、`{mode:"links"}` 返回正文/链接且截断生效 | | 待填 |
| 7 | 复用 tab | 同一 URL 再次 open 不新建重复 tab（`reused:true` 或复用现有 webview） | | 待填 |
| 8 | 导航后 ref | 打开另一个 URL 后旧 `eN` ref 不再可信（C2 将返回 `E_REF_STALE`） | | 待填 |
| 9 | 多窗口 | 打开第二个 DSH 窗口后调用工具返回 `E_MULTIPLE_RENDERERS` 而不是猜 | | 待填 |
| 10 | 重启恢复 | 完全重启 DSH 后插件重新加载，Client 重新握手，无孤儿端口 | | 待填 |
| 11 | Web profile | Web profile 下 `browser_use_status` 报 Client 离线 / `supported:false`，不崩溃 | | 待填 |
| 12 | 卸载清理 | 卸载插件并重启后桥端口释放，无残留进程 | | 待填 |

## 真机步骤

1. `node scripts/verify-bundle.mjs && node tests/run-tests.mjs` 全绿。
2. 用插件管理器 `install_bundle` 安装本目录，**完全重启 DSH**。
3. 新会话调用 `browser_use_status`；确认 `bridge.ready`、`bridge.online`、`client.webviewCount`。
4. 调用 `browser_use_open {url:"https://example.com/"}`，再 `browser_use_read {mode:"ax"}`。
5. 把实测结果填回上表；失败时保留 DSH Host/Client 控制台日志再修。

## 已知未验证

- Client 能否在 DSH 的 Sidebar 容器/shadow DOM 中稳定找到 webview（递归 shadowRoot 查找）。
- `webServer.tapIndex` 注入 meta 的时机；meta 缺失时 `/v1/config` 是否被 CORS 放行。
- 页面导航中 `executeJavaScript` 的 Promise 行为。
- 多 renderer 时网络层能否稳定返回 `E_MULTIPLE_RENDERERS`。
