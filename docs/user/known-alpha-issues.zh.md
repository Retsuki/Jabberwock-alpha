# Alpha 已知问题与验证缺口

[English](known-alpha-issues.md) | 中文

此开发者 Alpha 适用于源码级评估，不代表已具备生产就绪性或全面安全覆盖。报告前，请先在隔离的测试项目中复现问题。支持的模型通道见 [README](../../README.zh.md)，操作风险见[安全说明](../../SAFETY.zh.md)。

## 已知自动化检查失败

现有的会话输入框宽度自动化测试仍失败：拖动、持久化宽度并按窗口大小限制后，得到的宽度与预期值不同。该失败也在对照基线中复现。此处记录的是未解决的自动化检查，并不证明已在生产 UI 中目视确认缺陷。

## 验证缺口

- 本地 EC 应用的完整诊断 → 发现 → 按报告修复 → 复测流程尚未验证。测试夹具的冒烟测试确认的是测试应用行为，不是 Jabberwock 成功发现漏洞。参阅 [EC 验证记录](../specs/security-execution/ec-lab-verification.zh.md)。
- 桌面启动验证主要在 macOS 上进行。Windows 和 Linux 需要单独验证。源码安装使用现有包缓存完成验证；完整全新网络下载仍未验证。参阅 [Alpha 准备记录](../specs/security-execution/alpha-publication-verification.zh.md)。
- 模型通道的能力不同。Codex 不支持有范围限制的调查 Worker，DeepSeek Worker 的真实模型验证仍待完成。选择通道前，请查看[模型连接](../../README.zh.md#connect-a-model)。未认证状态下启动成功不等于提供商认证或推理成功。
- 供应链结果是包/版本与公告的匹配，不是应用可利用性发现。仅更新定义的修复不会安装依赖或运行应用测试。不支持的验证路径中，复测仍为无法确定；零发现不代表安全。

## CI 状态

源码树保留上游 CI 和手动发布工作流，包括 npm、PyPI 和 Cloudflare 操作。此次公开 Alpha 准备中已禁用 GitHub Actions，以避免运行未适配的工作流、产生付费执行或向上游部署。本地检查通过不代表托管 CI 已成功运行；工作流适配仍待完成。

## 报告

对于可复现且不敏感的缺陷，请使用本仓库的 Bug 问题模板，仅附上脱敏证据。遵循 [CONTRIBUTING.md](../../CONTRIBUTING.zh.md)。疑似 Jabberwock 自身漏洞请遵循 [SECURITY.md](../../SECURITY.zh.md)，不要在问题中公开敏感细节。此 Alpha 不保证响应或修复时间表。
