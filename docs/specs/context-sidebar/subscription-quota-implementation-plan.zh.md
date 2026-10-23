# 上下文与订阅用量实施计划

[English](subscription-quota-implementation-plan.md) | 中文

## 摘要

> 按已批准的方案 B 分三阶段实现，涉及订阅引擎、远程投影及现有会话与侧栏界面。复用上下文测量及现有认证。预计无需数据库迁移、Session 事件或环境变量。提供方可用性与界面夹具分别验证。

## 1. 账户观测

- [x] 在 `packages/core/subscription-engines/src/quota.ts` 增加带类型的只读账户用量结果及服务。
- [x] 在 `packages/core/subscription-engines/src/` 实现有时限的 Claude SDK 与 Codex app-server 读取，使用实际返回的窗口时长。
- [x] 合并并发读取，将观测限定于已认证的提供方连接，并覆盖取消、数据不可用及有效零值。
- [x] 通过现有 Host 与客户端远程服务暴露共用结果，不将账户快照持久化到 Session。

## 2. 上下文布局

- [x] 扩展 `packages/client/ui-sidebar-right/src/client/tabs/usage/UsageBody.tsx`，显示提供方配额窗口、重置时间及明确的观测状态。
- [x] 在会话输入框的模型控件旁增加紧凑上下文圆环；打开时选择现有用量详情。
- [x] 复用现有上下文占用及语言字典，保留响应式布局，避免比较无关提供方或模型的观测。

## 3. 验证与文档

- [x] 运行定向 Host 与客户端测试，覆盖零值、不可用、过期、提供方或模型不符及重置时间显示。
- [x] 依次运行 `build:artifacts`、`build:check` 及定向文档检查。
- [x] 启动原生应用，检查输入框圆环与上下文面板并截图；如实记录提供方数据不可用。
- [x] 按实现行为更新订阅引擎与侧栏 README 双语文档，并记录翻译配对。

## 限制

不得为获取用量发起推理请求。不得检查会话正文、扫描凭据存储、通过 token 计数推算额度、假设主要限制为五小时，或让可选用量失败导致会话轮次失败。现有 Session 用量事件及累计计数保持原有含义。

## 验证

2026-10-19，`build:artifacts` 通过七项检查（`/tmp/jw-quota-build7.log`），随后 `build:check` 通过两项。最后的分类调整前，Host 测试通过八个文件中的 58 个案例；最终定向 Claude 套件通过 11 个案例。最新客户端侧栏、投影及远程服务套件通过 19 个文件中的 274 个案例（`/tmp/jw-quota-final-clienttests.log`）。持久化验证通过，包含 70 个根与 20 个记录；`git diff --check` 通过。

通过 CDP 端口 19223 操作了可见的原生 Electron 窗口。两次独立的 Claude Sonnet 5.5 合成轮次返回 `OK` 并提供上下文测量：输入框圆环显示 3%，点击后打开右侧面板，面板显示约 32.4K / 1M。Claude 账户观测显示五小时用量 8%、每周用量 17% 及 Fable 用量 0%，并显示重置时间及手动刷新。Codex 账户用量显示不可用，不推断原因。上下文详情打开与关闭均正常。账户配额通过控制查询读取，不执行推理；两次合成轮次单独验证上下文。

截图：[上下文面板](/tmp/jw-quota-complete-panel.png)与[订阅窗口](/tmp/jw-quota-allowance-panel.png)。这些数值仅描述本次观测，不代表固定账户限制。
