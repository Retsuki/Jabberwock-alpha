---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-21-security-supply-chain-delete

[English](2026-10-21-security-supply-chain-delete.md) | 中文

## 概述

为持久化的供应链检查运行增加可选的删除时间，以便逻辑隐藏单次运行。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-21-security-supply-chain-delete
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-21-security-supply-chain-repair"
    after: "a9ea734197954432deacecd2e65de1e50de53ffa8012ee643b2099f1ff87d44c"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-21-security-supply-chain-repair"
    after: "289d4db2a5da5e73c7754f0b8eb8c929a421e1adb17e4131e541ba7d1e5b1258"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-21-security-supply-chain-repair"
    after: "2dfd45e3b551afed665e21d90015f8fd1c70bd52ab45584ba34ac388752ef13f"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-21-security-supply-chain-repair"
    after: "68d3ef123543ff87a2ef5e2df599a745e116e2721c30dacf9b8c9defb34ed289"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

已有记录仍然有效，因为该字段可选，缺失表示未删除。不认识该字段的读取方会忽略它并继续显示该运行，因此降级后可能再次显示已删除的运行；不会改写或删除任何早期快照。会话日志保留该运行的全部早期快照作为证据。

<a id="verification"></a>
## 验证

pnpm exec vitest run packages/client/ui-security：51 个文件、603 个测试通过，其中包括删除、重启恢复和保留会话日志的宿主测试。

<a id="dev-note"></a>
## 开发备注

无。
