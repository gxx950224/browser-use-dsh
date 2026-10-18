# M0 live probe（安装后由真机填写）

本文件记录 C1 需要真机确认的平台事实。单元测试不能替代 DSH 桌面安装后的实测。

| # | 探针 | 期望 | 实测 | 结论 |
|---|---|---|---|---|
| 1 | 插件加载 | 完全重启后 Config 清单出现 `browser-use-dsh` 行，无加载错误 | 2026-10-18：`install_bundle` 返回 `application:"applied"`；当前会话直接出现 `browser_use_*` 工具与 Browser Use 系统提示（Host HMR 生效） | 通过 |
| 2 | Host 桥监听 | `browser_use_status` 返回 `bridge.ready:true`，端口与配置一致 | 2026-10-18：`bridge.ready:true`、`port:8817`、`startError:null` | 通过 |
| 3 | Client 在线 | 新会话 `browser_use_status` 返回 `bridge.online:true` 与 `client.webviewCount≥1` | 2026-10-18：`online:true`、Client `href:"dsh-app://app/"`；初始 `webviewCount:0`（未开浏览器 tab） | 通过 |
| 4 | 侧栏浏览器打开 | `browser_use_open {url:"https://example.com/"}` 打开/复用右侧 Browser tab | 2026-10-18：返回 `title:"Example Domain"`、`generation:"g-1"`、`webviewCount:1` | 通过 |
| 5 | AX 读取 | `browser_use_read {mode:"ax"}` 返回节点、`eN` ref 与 box，内容包在 `<untrusted-page-content>` | 2026-10-18：返回 13 个节点（含 `e13 link "Learn more"` 与 CSS box），正文包裹生效 | 通过 |
| 6 | text/links | `read {mode:"text"}`、`{mode:"links"}` 返回正文/链接且截断生效 | 2026-10-18：`links` 返回 `Learn more → iana.org`（含 box）；`text` 返回多语言正文并包裹在 `<untrusted-page-content>`；首测的 `E_EXECUTE_FAILED` 已修复并通过 | 通过 |
| 7 | 复用 tab | 同一 URL 再次 open 不新建重复 tab（`reused:true` 或复用现有 webview） | 2026-10-18：第二次 open 返回 `reused:true`、`webviewCount:1`、`generation:"g-2"` | 通过 |
| 8 | 导航后 ref | 打开另一个 URL 后旧 `eN` ref 不再可信（C2 将返回 `E_REF_STALE`） | | 待填（C2） |
| 9 | 多窗口 | 打开第二个 DSH 窗口后调用工具返回 `E_MULTIPLE_RENDERERS` 而不是猜 | 2026-10-18：页面热更新产生多个 renderer 时确实返回 `E_MULTIPLE_RENDERERS`；已改为 sessionStorage 稳定 rendererId + 聚焦窗口优先路由；Host 改动需完全重启 DSH 后复测聚焦分支 | 部分通过 |
| 10 | 重启恢复 | 完全重启 DSH 后插件重新加载，Client 重新握手，无孤儿端口 | | 待填 |
| 11 | Web profile | Web profile 下 `browser_use_status` 报 Client 离线 / `supported:false`，不崩溃 | | 待填 |
| 12 | 卸载清理 | 卸载插件并重启后桥端口释放，无残留进程 | | 待填 |
| 13 | act 点击（非敏感） | `act {action:"click", target:{ref}, expectedGeneration}` 在页面生效，返回 url/title/generation | 2026-10-18：在用户已打开的火山方舟页面用 `hover e19` 真机通过（返回 target/box/generation）；click/fill 真机待复测（不在用户控制台页做副作用动作） | 部分通过 |
| 14 | ref 失效 | 导航/刷新后用旧 generation 动作 → `E_REF_STALE` | 2026-10-18：`expectedGeneration:"g-999"` → `E_REF_STALE`，未执行动作 | 通过 |
| 15 | 敏感动作审批 | 点击"提交/确认/支付"类目标会弹出审批；拒绝后不执行 | 单测覆盖 approved/rejected/无审批服务；真机审批链路见 fail-closed 注 | 部分通过 |
| 16 | 验证器 | `browser_use_verify` 校验 URL/标题/文本/元素，`passed` 与证据一致 | 2026-10-18：URL + 标题（contains）真机 `passed:true`，checks 返回 actual/expected | 通过 |
| 17 | 跨站链接审批 | 点击指向其他 Origin 的链接会先询问新 Origin | 单测未覆盖跨站链接分支；真机待复测 | 待复测 |
| 18 | reload 后 generation | `act {action:"reload"}` 后 generation 递增，旧 ref 失效 | 待复测（不在用户页面主动 reload） | 待复测 |
| 19 | 截图（CDP 关闭） | `browser_use_screenshot` 在无调试端口时返回 `E_CDP_UNAVAILABLE` 与启动提示 | 2026-10-18 真机：`E_CDP_UNAVAILABLE`，message/hint 含 `--remote-debugging-port=9222`；status `capabilities.screenshot:false` | 通过 |
| 20 | 截图（CDP 开启） | 以 `--remote-debugging-port=9222` 启动后截图成功，作为图片附件返回模型/界面 | 待真机（需带调试端口重启 DSH） | 待填（C3） |
| 21 | 页面内视觉反馈 | act 时页面出现光标/目标高亮/ripple，1.8s 后清理；`visualFeedback:false` 关闭 | 2026-10-18：`hover` 动作成功且 overlay 注入路径执行无报错；视觉呈现需用户确认 | 部分通过 |
| 22 | 右侧面板打开 | `browser_use_panel` 打开自注册 `browser-use-panel` tab，显示状态/页面/最近操作 | 2026-10-18：`browser_use_panel` 返回 `ok:true`；`status.client.panel.registered:true,state:"idle"` | 通过 |
| 23 | 六态泛光 | idle/observing/acting/awaiting/success/failed/paused 各有对应面板泛光 | 面板已注册；六态视觉与动画待用户确认 | 部分通过 |
| 24 | 接管/交还 | 面板"接管浏览器"后 Agent 动作返回 `E_TAKEOVER`；"交还 Agent"后需重新 read | 面板按钮已渲染；接管后 E_TAKEOVER 分支待用户点击面板按钮后复测 | 待复测 |

> 2026-10-18 C2 实机进展：remove_bundle + install_bundle 后 Host 半加载 C2（工具/提示词已更新，`capabilities.act/verify:true`）。
> 重建插件后 Sidebar webview 随页面重载消失，`browser_use_open` 触发"新 Origin 审批"时，**本会话的审批策略为 `never`，审批被确定性拒绝并返回 `E_APPROVAL_DENIED`**——这正是 fail-closed 设计，说明 Origin 门禁已生效；也意味着 act/verify 的真机动作需要先把审批策略切回 `ask`（或手动打开侧栏浏览器页、或配置 `trustedOrigins`）才能复测。

> 2026-10-18 实机结论：Host 半经 HMR 生效、Client 半在打开中的 DSH 页面内自动激活；`status/open/read(ax)` 与 tab 复用均通过。
> 首轮发现并修复了两个真实问题：① `links` 页面内函数未内联工具函数；② 页面热更新/刷新产生新 rendererId 导致短暂 `E_MULTIPLE_RENDERERS`（改为 sessionStorage 持久 rendererId + 聚焦窗口优先路由；Host 改动需完全重启后生效）。

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
