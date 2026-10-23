# 供应链检查验证

[English](supply-chain-check-verification.md) | 中文

## 已执行检查

最终聚焦回归通过七个文件中的 129 项唯一测试。Host／客户端 `pnpm run build:check` 两项通过且零失败，ui-security TypeScript 检查通过。Typert 生成 32 个公开类型；API／session-controller、ui-security 与 API／remotes bundle 构建成功。最终两个变更文件的聚焦 oxlint 与 `git diff --check` 通过。最终回归包括局部处理 cold-snapshot 重建失败，以继续恢复其他保存运行。之前的 47 项功能与 93 项历史测试为存在重叠的辅助运行，不得加到最终唯一数量。

实际应用 UI 对 `lodash@4.17.20` 和 `is-number@7.0.0` 启动固定扫描。运行 `cec793f0-8405-4a53-9a17-737ce7e000ff`、Session `session-2693ab44-c6d6-4cdf-a56f-7d2e3aba2941` 检查两个包名／版本对，返回五条匹配、五个公告日期和五个修复字段，零警告。保存四个进度阶段：lockfile、advisories、formatting 和 done。未启动模型轮次。之前完成的运行在重启后恢复五行及带名称侧边栏历史，没有自动重跑。

日文报告和展开影响截图已通过 `verify.py ui` 登记：`tasks/verify/supply-chain-report-final-2026-10-21.png` 与 `tasks/verify/supply-chain-impact-final-2026-10-21.png`。这些展示已知公告发现，不代表确认应用可利用性或攻击脆弱目标。

## 持久化与启动

正式记录 `docs/persistence-changes/2026-10-21-security-supply-chain.md` 确认四个根中的新归属来源，不改变 Session 写入版本。`verify-persistence-changes --json` 报告 70 个根匹配 21 份历史记录。旧读取方保留普通提示消息解释；新读取方恢复前校验来源种类、所属身份和运行模式。

Remote 约定变更后，必须重新生成既有 API／remotes 客户端 bundle。过时生成 bundle 导致测试应用启动失败；重建该载体并完全释放测试端口 19601／19602／19623 后重启解决。这是开发验证前提，不是新增运行依赖，也不是修改用户正常配置档的理由。

## 最终重启与验证限制

最终版本三重启恢复运行 `7cfed4bb-57a1-45c1-8427-d834504b5b49`，Session 为 `session-1a9416e0-3e06-418f-b27a-f8dd7cdd47ea`：五行均有日期和修复版本，没有运行中的停止控件，侧边栏显示名称“Supply-chain check”。相同四条已保存提示保持不变，各自带 `visibleInHistory:true`；模型轮次保持为零，扫描没有自动重启。正常应用恢复原有标题，意外出现的 Untitled 内部提示杂项消失。Host 初始化复用带 `projectionMode:none` 的 `sessionQuery.observeSession`，同时恢复运行并重建 cold-snapshot，没有额外读取。

最终重启与进度证据：`tasks/verify/supply-chain-restored-final-2026-10-21.png` 和 `tasks/verify/supply-chain-progress-ja-final-2026-10-21.png`，补充上文最终报告与影响截图。包含 lint／网络／手动取消及窄布局边界的组合检查在缺少各自执行证据时不标为完成。未提交或推送。

## 工作区标签与明确修复验证

最终扩展回归通过八个文件中的 142 项唯一测试（`/tmp/jw-supply-chain-tabs-final-tests.log`）。Host 汇总 TypeScript 检查通过（`/tmp/jw-supply-chain-repair-host-aggregate.log`），Client 汇总检查通过（`/tmp/jw-supply-history-ui-aggregate.log`），ui-security TypeScript 检查通过。Host 五文件聚焦 lint 及排除客户端入口的 UI 检查通过；入口的类型感知 lint 报告 Host／Client Context 错误类型混淆。权威 TypeScript 检查通过不代表全量 lint 通过。

实际 Electron UI 展示单个非折叠菜单 Security 入口、Assets／Tasks／Supply-chain 标签、即时保留的运行中行，以及没有模型输入框的现有嵌入 Session 详情。可见五个发现级修复按钮。来自运行 `35f532e5-253c-43dc-ad16-f6ab0dba5ca2` 的单项修复将 `lodash` 从 4.17.20 更新为 4.18.0，后续扫描返回零匹配。运行 `fa7cffd8-a5c5-46cd-a1ab-d3611547a37f` 的批量修复关联后续运行 `2362f8b8-d843-4a71-ae15-3886ff02a884`，将原五项匹配降为零。实际包 manifest 已变更，每次修复保留私有恢复备份。模型轮次保持为零。这些是依赖定义／公告结果；node_modules 安装与应用功能健康仍未运行。

截图：`tasks/verify/supply-chain-workspace-running-2026-10-21.png`、`tasks/verify/supply-chain-workspace-list-2026-10-21.png`、`tasks/verify/supply-chain-workspace-detail-2026-10-21.png`，以及单项复查、批量修复结果和批量复查截图。最终已登记重启截图为 `tasks/verify/supply-chain-workspace-restored-list-2026-10-21.png`、`tasks/verify/supply-chain-workspace-restored-repair-2026-10-21.png` 与 `tasks/verify/supply-chain-workspace-restored-zero-2026-10-21.png`（同时登记为 2026-10-21-230217 截图）。

后继持久化记录 `2026-10-21-security-supply-chain-repair` 增加可选定义指纹及修复快照，不改变 Session 写入版本或先前已接受记录。验证报告 70 个根匹配 22 份历史记录。旧扫描仍可读取，但没有新的已保存定义指纹时不能自动修复。

最终重启保留七条历史行，并正确显示最近更新列。零匹配后续运行 `2362f8b8-d843-4a71-ae15-3886ff02a884` 恢复为完成；原始批量运行恢复其已完成／已应用修复。详情渲染两个嵌入卡片和零模型输入框。重新读取持久化事件（`/tmp/jw-supply-chain-repair-ui-events.json`）确认七个运行、34 条提示、零模型轮次，且两项已完成修复均为 `definitionOnly:true` 和 `runtimeTests:not-run`；没有自动启动扫描。正常应用展示新路由，并保留一项原有取消运行，未删除或重跑。

最终 `pnpm run build:check` 的 Host 与 Client 均通过且零失败（`/tmp/jw-supply-chain-tabs-final-build-check.log`；Host 9.23 秒，Client 20.74 秒）。最终已应用定义文案通过 22 项聚焦 UI 测试、TypeScript 检查与聚焦 lint；这是强化已有用例，不增加之前 142 项唯一测试数量。上文客户端入口全量 lint 限制仍保留。正常配置档已有历史，因此未实际验证空历史 UI；已验证零公告画面。不声称应用运行／功能健康验证成功。

<a id="current-verification-2026-10-22"></a>

## 2026-10-22 回归与实际应用检查

当前聚焦回归通过七个文件中的 109 项测试（`/tmp/jw-current-full-regression.log`）。随后 Host 和 Client 聚合构建检查均通过，零失败（`/tmp/jw-final-build-check.log`）。独立 Desktop 回归通过三个文件中的 156 项测试（`/tmp/jw-welcome-origin-passing.log`）；覆盖范围存在重叠，不与之前运行的数量相加。现有 `welcome-startup.spec.ts` 仍有两项断言期待旧原生 Welcome 窗口，而当前入口直接打开工作区。这仍是未解决的测试／实现不一致，不能记作通过。

实际 Electron 操作检查独立 npm 架空项目 `/tmp/jw-supply-validation-20261022`：`lodash@4.17.20` 产生五条公告匹配。报告中的批量修复将依赖定义更新为 `4.18.0`，后续运行 `43ee9bbe-f1be-428d-9571-a47c60876722` 返回零匹配。使用原应用用户数据目录重启后，两条历史记录均恢复。这些结果覆盖依赖定义、公告查询、UI 修复与恢复，不证明安装、应用功能健康、漏洞利用或 LLM 驱动诊断成功。

启动时发现原生 Welcome 请求携带累积浏览器 cookie 导致 HTTP 431。Welcome HTTP 与账号流现在仅复用当前 Host 令牌交换已签发的 cookie，拒绝其他 origin 和重定向。修改后，原用户数据目录成功启动，未删除任何已存 cookie。失败诊断显示 HTTP 状态，不包含 cookie 值或携带令牌的 URL。

修复报告将复查 ID 作为文字保留，并明确结果可能已删除，不再生成可能失效的片段链接。通用 preflight 未完成：递归环境发现沿深层符号链接路径运行约十五分钟后被停止，不能记作通过；上文聚焦测试和聚合构建检查是已执行的验证。

最终组合运行通过十个文件中的 265 项测试（`/tmp/jw-all-final-tests.log`）；这是最新数量，不与先前重叠运行相加。在 1280 CSS 像素视口下，操作列最初落在表格可见范围之外。仅针对历史表的右侧 sticky 样式随后在实际应用中确认：操作列右边缘位于 1247 像素，两项操作持续可见。截图：`tasks/verify/2026-10-22-supply-chain-actions-visible.png`。

通过 UI 仅删除后续运行 `43ee9bbe-f1be-428d-9571-a47c60876722` 后，该架空项目历史从两行减为一行。原五匹配运行保留，后续记录引用仍为文字，页面没有失效片段锚点。本次删除检查没有删除原证据或项目已修复的依赖定义。
