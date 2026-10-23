---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-19-security-worker-tools

[English](2026-10-19-security-worker-tools.md) | 中文

## 概述

将仅用于日志的 engine/activity 提供方标识从 Claude/Codex 订阅字面量扩展为 string，使专用 DeepSeek Worker 能记录真实提供方而不错误归属。活动事件声明移至公共 Agent 引擎词汇；Session 写入格式仍为 V4。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-19-security-worker-tools
baseline: false
changes:
  - root: "event:engine/activity"
    previous: "2026-10-17-subscription-engines"
    after: "dbf8a504939cba2bb9b2d2f0dbfce01ed0d34d28442bd4cf131d304f63570778"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

已有 Claude 和 Codex 活动记录保持相同的判别字段、属性和含义，新读取方原样接受。已发布读取方验证已知事件词汇及 JSON 信封，不按原 TypeScript 字面量限制 activity.data.engine，因此保留新提供方标识，不截断或修复日志。活动只用于日志，不执行工具、不改变模型可见历史，也不授权操作。DeepSeek 写入 worker-request、worker-response、worker-tool-call 和 worker-tool-result 类型，旧历史共享消费者本来就忽略这些类型。当前历史共享投影还会先将引擎标识限定为 Claude/Codex，再解释 history-sharing 活动。工具范围、预算与逐次操作批准始终由活动的所属服务执行，不通过重放活动授权。Worker 存储增加可选 observations、findingObservationIndexes、httpRequests、pendingApproval、snapshot.limits.maxRequests 和 evidence.method；这些域记录不属于 Session schema 清单。新域读取方保留旧字段缺失时的含义（包括旧 GET 观测）；旧严格域读取方在执行前拒绝未知字段，不会静默解释新权限。该仅日志提供方扩展不需要提高 Session 格式版本。

<a id="verification"></a>
## 验证

pnpm exec vitest run packages/core/subscription-engines/tests packages/client/ui-security/tests/security-worker-deepseek.spec.ts：6 个文件、36 个测试通过，包含拒绝其他提供方的历史共享、未知 Worker 能力、参数类型校验、有限模型步骤与取消。pnpm exec tsc -b packages/core/agent packages/core/subscription-engines packages/client/ui-security --emitDeclarationOnly：通过。真实模型与原生 UI 验证仍在进行，本确认记录不声称这些验证已完成。

<a id="dev-note"></a>
## 开发备注

无。
