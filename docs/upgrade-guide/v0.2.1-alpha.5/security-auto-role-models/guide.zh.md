---
kind: upgrade-guide
description: "未明确配置角色模型的安全任务使用自动选择，旧计划在自动执行 Worker 前需要模型决策。"
---

# 自动安全角色模型

[English](guide.md) | 中文

## 变更

Planner 和 Worker 通过 `task.agentModelModes` 区分自动选择与所有者固定偏好。缺少模式时，旧明确模型保持固定；未设置或 `default` 模型现在表示自动选择。主 Agent 从目录中选择 Planner，Planner 为各调查项选择 Worker，并记录简短理由。固定偏好优先，修改仅影响新调用。模型选择不改变执行权限。

旧计划仍可加载，但缺少自动执行 Worker 所需的项目模型决策。不会静默改写已保存计划。

## 迁移

1. 打开任务概览，检查 Planner 和 Worker 模型设置。需要特定偏好时选择支持的固定模型，否则保留自动选择。
2. 对缺少 Worker 模型决策的旧计划，先要求主 Agent 重新启动 Planner，再启动自动 Worker。旧计划保留为历史。
3. 确认新计划包含模型决策和理由，新调用重新打开后仍保留实际模型。运行中的调用保持原选择。不支持的提供方仍不可用。

DeepSeek 账户与 API 在任务选择、计划决策和 Worker 快照中使用独立引擎标识（`deepseek-account`、`deepseek-official`）。旧记录无需重写。旧应用版本无法读取新的 DeepSeek 选择，不得用来编辑这些记录。首次向各 DeepSeek 目标传送历史讨论时，可选择仅允许本次、在此任务会话始终允许或拒绝；仅切换显示的提供方不会发送提示。
