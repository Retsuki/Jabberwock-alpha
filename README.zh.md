# Jabberwock

[English](README.md) | 中文

Jabberwock 是基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Alpha 桌面应用。它将 AI 辅助开发与安全任务配置、Planner/Worker 调查、证据、报告和复测结合在一起。界面参考 Codex 和 ARTEX；本项目独立于这些产品。

日本語：Jabberwockは、AIによる開発とセキュリティ調査をまとめて操作するデスクトップアプリのα版です。診断の完了や脆弱性の不存在を保証するものではありません。まずは自分が管理するローカル検証環境でお試しください。

## Alpha 范围

- 通过主 Agent 或任务概览注册资产，定义任务目标、授权范围、操作限制和期望的执行上限。
- 请 Planner 制订调查计划；明确启动有界 Worker，查看其会话、工具活动、共享探索图和时间线。Host 配置的执行预算与任务中的自由文本上限相互独立。可单独停止 Worker 或停止整个任务；重启应用不会自动恢复调查。
- 查看已保存的发现及支持性观测、管理层与技术报告、资产覆盖情况，以及独立的复测历史。复测仅支持有限的验证方式；不支持的检查保持为无法确定。
- 对 npm/pnpm 锁文件执行供应链检查，查看公开公告匹配并保存报告。支持的直接依赖修复会更新包定义与锁文件，然后重新检查公告；不会安装依赖或运行应用测试。

公告匹配表示包及版本范围受到影响，并不能证明你的应用可被利用。零匹配或零发现不代表安全。完整的 EC 应用诊断 → 发现 → 修复 → 复测流程尚未完成端到端验证。模型判断可能有误，操作可能失败或提前停止，Alpha 期间的数据格式和 API 也可能变化。评估结果时，请结合已保存的证据和报告中的限制。

此源码预览不提供本文所述的 Jabberwock 安装包或 npm 发行版。上游 DeepSeek Harness 的包和下载属于另一产品。对任何项目或目标运行工具前，请阅读 [SAFETY.md](SAFETY.zh.md)；仅操作自己拥有或获得授权评估的系统。

<a id="run"></a><a id="run-from-source"></a>
## 从源码运行

从**本仓库**的检出目录开始，而不是上游 DeepSeek Harness 仓库。源码启动需要 Node.js `^22.19.0 || >=24.0.0` 和固定的 `pnpm@11.28.5`。macOS 开发还需要 Xcode Command Line Tools 以构建原生组件。请使用同一所选 Xcode 安装中的匹配编译器、链接器和 macOS SDK。安装和首次启动会下载依赖与运行时产物。

```sh
pnpm install --frozen-lockfile
pnpm run dev:desktop
```

推荐使用 Git 检出目录。不含 `.git` 的源码归档必须在构建时将 `DSH_CLIENT_COMMIT_HASH` 设置为实际源码的 Git 修订号（7–40 位十六进制字符）；参阅[客户端构建元数据](scripts/client-build-environment.ts)。

`dev:desktop` 构建开发产物并启动 Electron 应用，然后监视源码变更。请保持该终端运行。产物就绪后，`pnpm run start:desktop` 可跳过构建直接启动。成功打开窗口不等于类型检查或完整测试通过；这些检查请参阅[开发指南](docs/development.zh.md)。此 Alpha 的桌面验证主要在 macOS 上进行；其他操作系统需要单独验证。

若依赖下载、原生构建或运行时准备失败，请保留终端错误，解决该步骤后再重试。不要直接启动未打包的 Electron 可执行文件：源码启动器会提供运行时目录和开发配置。[桌面文档](apps/desktop/README.zh.md)介绍打包和运行时要求。

<a id="connect-a-model"></a>
## 连接模型

打开 **Settings → Models**。Claude 和 Codex 订阅连接采用各自官方的认证流程，与 API 密钥设置分开。Claude 需要安装可通过 `claude` 访问的官方 Claude CLI；Codex 默认使用随附的官方 app-server 可执行文件，也可修改配置。必须具有有效的第一方登录；这些订阅通道不会回退到 API 计费。DeepSeek 账号和 API 连接在 Models 中单独配置。可用性和模型选项由所连接的提供商决定。

| 通道 | Alpha 行为 |
|---|---|
| Claude | 主聊天、安全配置/规划和有范围限制的调查 Worker。 |
| Codex | 主聊天和安全配置/规划；不支持有范围限制的调查 Worker。 |
| DeepSeek 账号 / API | 已连接主聊天和安全通道；真实模型的 Worker 验证仍待完成。 |

在订阅连接中，**Use normal confirmation** 会在将之前的会话文本分享给新的原生提供商会话前询问。**Always allow sharing** 按提供商保存该选择，适用于后续会话；切换回来可恢复询问。DeepSeek 安全会话分享采用独立的会话级授权。使用模型会将所请求的上下文发送给该提供商；选择前请检查任务数据、附件内容和提供商条款。不要将凭据写入任务描述或报告。

## 试用本地实验应用

[NORTHLINE EC 实验应用](benchmarks/security-labs/northline/README.zh.md)提供故意保留漏洞的本地测试应用和 Docker 说明。请保持隔离并遵循仅回环地址访问的配置；不要公开部署。Docker 运行目标应用，Jabberwock 在宿主机运行。启动实验应用不会自动启动 Jabberwock 调查。请先按照实验说明完成注册和授权，再明确启动任务。

## 反馈与贡献

报告缺陷前，请查看 [Alpha 已知问题](docs/user/known-alpha-issues.zh.md)。Jabberwock 自身的疑似漏洞应遵循[安全报告政策](SECURITY.zh.md)。

仓库问题跟踪器可用时，请在本仓库报告可复现的问题。包含操作系统、Node/pnpm 版本、提供商通道、脱敏错误和复现步骤。请删除 API 密钥、账号标识、私有项目路径、目标信息，以及不打算分享的会话/证据内容。

贡献流程见 [CONTRIBUTING.md](CONTRIBUTING.zh.md)，Agent 指引见 [AGENTS.md](AGENTS.md)，底层插件系统见[架构文档](docs/architecture.zh.md)。继承的[文档网站](https://deepseek-harness.github.io/deepseek-harness/)描述的是上游 Harness；Jabberwock 特有行为以本检出目录的文档为准，包括[安全包参考](packages/client/ui-security/README.zh.md)。

## 上游与许可证

Jabberwock 基于 [DeepSeek AI](https://deepseek.com) 开发的 DeepSeek Harness 及其 [Cordis](https://github.com/cordiverse/cordis) 插件架构。源码树保留现有的 `@deepseek-ai/dsh-*` 名称和上游文档。

[MIT](LICENSE)。再分发时请保留上游版权及许可证。第三方组件和许可证列于 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。模型账号、API 服务和下载的运行时适用各自条款。
