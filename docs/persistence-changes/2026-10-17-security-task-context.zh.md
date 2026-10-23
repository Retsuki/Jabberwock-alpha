---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-17-security-task-context

[English](2026-10-17-security-task-context.md) | 中文

## 概述

为已记录的任务会话输入新增 security-task-context 归属类型。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-17-security-task-context
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-13-user-rpc-principal"
    after: "b47a847300d5077684605e1ab9468c3d18ee9c0fad853a279e22ad8c07391bfc"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-13-user-rpc-principal"
    after: "f365a7b0af8533e3f04133c226b9dbcb7904f86da31ad822864c115a5a9e7c01"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-13-user-rpc-principal"
    after: "23b0959517157bacb516255f351d25bda0a191282186e13b3c57321a08f540e3"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-13-user-rpc-principal"
    after: "0f1526870705a3accfd37c8af9099c61de0c994ff695394d580011c988761c31"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

新 kind 仅标记现有用户消息文本的归属，并使用既有 notice 呈现。现有源类型、事件信封和模型可见内容语义不变。新读取方保留旧记录；旧读取方按既有源兼容策略保留未知用户/开发者源 kind。新增归属不承载必须理解的执行语义。

<a id="verification"></a>
## 验证

最终 build:artifacts 通过 7 项检查，随后 build:check 通过 2 项检查；针对性 oxlint 通过。verify-persistence-changes 将四个受影响根分类为 attribution-kind-added，requiresCompatibilityReview 为 false。获批的虚拟 Claude 会话完成，工具数与工具活动均为零，Host 重启恢复相同回复。依用户要求未运行测试套件。

<a id="dev-note"></a>
## 开发备注

无。
