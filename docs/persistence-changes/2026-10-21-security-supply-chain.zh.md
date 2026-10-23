---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-21-security-supply-chain

[English](2026-10-21-security-supply-chain.md) | 中文

## 概述

在既有提示消息中增加 security-supply-chain 归属及类型化扫描快照。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-21-security-supply-chain
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-17-security-task-context"
    after: "26567e85d84c7fdb69d4a5cc54041da70df576e7d3b3ee11d871abf351801746"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-17-security-task-context"
    after: "26fcf152c52517cc807f1137a9c747a831f8dff417f767311f6b3c1912a9394b"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-17-security-task-context"
    after: "30e546b24d583b94e7e4d6e40c3c1094f6c71d98aafbc547ad05070c52c78a57"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-17-security-task-context"
    after: "6b32892783e702b40115d8f2a672ae1b82c6e043fd157af3858e7b394d755dc0"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

已有记录和 Session 写入版本不变。旧读取方可解释标准 user/message 提示正文或隐藏非人工提示，不消费专用扫描快照。新读取方仅恢复来源种类、所有者／运行身份匹配且通过运行模式验证的数据；缺失或无效元数据不代表扫描完成。可选 visibleInHistory 标志在新扫描消息中明确为 true；其他内部提示不加入。重启后不回放临时 job。

<a id="verification"></a>
## 验证

聚焦功能回归通过 47 项测试。提示／侧边栏回归通过 93 项测试，见 /tmp/jw-history-opt-in-tests.log。实际 UI 展示两个审计包名／版本对、五条公告、保存的进度、零模型轮次，重启后恢复且不自动重跑。最终生成方标志验证在功能验证记录中单独跟踪。

<a id="dev-note"></a>
## 开发备注

无。
