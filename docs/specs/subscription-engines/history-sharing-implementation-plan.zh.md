# 历史共享设置实施计划

[English](history-sharing-implementation-plan.md) | 中文

> 分三个阶段在订阅引擎与 Models 设置包中提供按提供方区分的历史共享设置，预计涉及约八个源码／测试文件和双语文档。复用当前配置档持久化。无需环境变量、数据库迁移或破坏性 Session 变更。

## 范围

遵循[规格](history-sharing-spec.zh.md)中已批准的 B 方案。现有设置服务负责持久化和访问检查；公共原生提示构建器负责共享判断。

## 阶段 1：提供方策略

- [x] 在 `packages/core/subscription-engines/src/index.ts` 增加可选的 volatile `historySharing` 配置，各提供方默认 `ask`。
- [x] 经 `src/claude.ts` 与 `src/codex.ts` 将当前提供方取值传入 `src/shared.ts`，覆盖所有原生入口。
- [x] 仅在明确 `allow` 时跳过共享提问；保留现有对话许可、文本过滤、原生恢复和取消行为。
- [x] 扩展 `packages/core/subscription-engines/tests/history-sharing.spec.ts`，覆盖默认值、隔离、允许、恢复询问和内容边界。

## 阶段 2：Models 设置

- [x] 扩展 `packages/client/ui-settings-models/src/client/SubscriptionConnections.tsx`，增加按提供方区分的策略选项及目标／内容说明。
- [x] 在 `src/client/index.ts` 连接现有配置表单和设置修改操作；保留修订冲突及 Gateway/settings 权限行为。
- [x] 在 `src/client/locales.ts` 增加本地化标签与聚焦 UI／存储测试。不引入新的 Remote 端点或偏好文件。

## 阶段 3：验证

- [ ] 运行受影响的测试、类型检查、lint 和必要的产物构建检查；保留无关的未提交变更。
- [ ] 验证省略配置与旧 Session 数据保留现有行为。
- [ ] 检查实际设置页面，在隔离测试配置档中保存单个提供方的选择，重新加载／重启并截图。恢复测试选择，不修改用户的正常配置档。
- [ ] 验证双语文档并记录实际检查与尚未验证的行为。没有执行证据时，不声称已验证外部模型。

## 约束

不得将以往一次性数据共享授权当成启用应用级 `allow` 的许可。不得削弱工具或目标授权、导入系统／工具／凭据文件内容、修改 DeepSeek 策略、删除已有对话级许可、提交或推送。

## 验证证据

实现与回归检查覆盖阶段一和二。聚焦 Models UI 运行通过八项测试（`/tmp/jw-history-ui-final.log`）；组合运行通过十二个文件中的 238 项测试（`/tmp/jw-history-settings-regressions.log`）。后续停止原因运行通过三个文件中的四十项测试，其中包括原生历史共享覆盖（`/tmp/jw-stop-reason-final-tests.log`）。数量存在重叠，不得相加。产物构建通过七项检查（`/tmp/jw-history-build.log`），Host／客户端构建检查均通过（`/tmp/jw-history-check.log`）。本记录不将包含 lint 的组合清单标为完成。

实际 Models 设置保存 Claude=`allow`，Codex 保持 `ask`，重启断言验证两项值。隔离配置档补丁仅保存明确的 Claude 覆盖值；省略的 Codex 仍默认 `ask`。UI 证据以 `2026-10-20-220646-Provider-history-sharing-settings.png` 登记在 `tasks/verify/pending.json`，来源为 `/tmp/jw-northline-docker-shots/history-sharing-after-restart.png`。尚未验证测试选择已恢复，因此对应清单仍未完成。

正常 NORTHLINE 购物与有界 Claude Sonnet 调查在 [EC 验证记录](../security-execution/ec-lab-verification.zh.md)中有独立证据。二者均不证明设置会话中真实的格式错误模型响应已被成功纠正。后续真实模型设置检查观察到三次有界纠正、持续格式失败及一次仅任务名保存成功；目标／完成条件提案未恢复。Codex 在此仅会话路径保持禁用。链接记录包含准确任务与证据；尚未验证完整设置或真实模型成功恢复。
