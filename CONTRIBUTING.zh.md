# 贡献

[English](CONTRIBUTING.md) | 中文

Jabberwock 是基于 DeepSeek Harness 的 Alpha 项目。对此分支的贡献遵循本仓库指引；上游 Harness 有其独立的贡献政策。

## 报告问题

仓库问题跟踪器可用时，请在本仓库提交问题。包含最小复现、预期和实际行为、操作系统与 Node/pnpm 版本，以及所选模型提供商。请说明检查是已完成、已停止、失败还是仍未验证。不要将公告匹配当作已复现的应用漏洞。

仅分享脱敏日志和截图。删除凭据、个人数据、私有项目路径、真实目标细节，以及不打算披露的会话/证据内容。不要公开发布包含敏感细节的疑似安全问题；仓库提供私密报告渠道时请使用该渠道。Jabberwock 自身的疑似漏洞请遵循[安全报告政策](SECURITY.zh.md)。此 Alpha 不承诺响应时间或安全支持服务。

## 准备变更

先阅读[源码启动说明](README.zh.md#run-from-source)和[开发指南](docs/development.zh.md)。修改代码或文档前，阅读适用的 `AGENTS.md`。保持变更集中，并保留无关工作。

修改安全操作时，保留资产范围检查、操作审批、证据引用、停止行为和重启后不自动执行的行为。使用隔离的本地测试夹具。不要仅为通过测试而扩大权限或发送私有项目数据。[NORTHLINE 实验应用](benchmarks/security-labs/northline/README.zh.md)故意保留漏洞，不得公开部署。

运行修改代码对应的定向测试和类型检查。UI 变更需要实际画面验证；请说明无法运行的检查。提交变更前遵循[推送前检查](.agents/skills/dsh-pre-push-checks/SKILL.md)，并包含复现步骤、验证输出和仍存在的限制。文档变更须按照[文档指引](docs/AGENTS.md)同步英文/中文配对。

## 署名与再分发

保留 [LICENSE](LICENSE)、DeepSeek 的上游署名和 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。新增依赖需要兼容的许可证并更新声明。源码贡献不授予提供商账号、模型或下载运行时的使用权；其条款独立适用。
