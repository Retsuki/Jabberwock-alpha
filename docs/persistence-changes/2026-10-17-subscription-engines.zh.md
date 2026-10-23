---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-17-subscription-engines

[English](2026-10-17-subscription-engines.md) | 中文

## 概述

新增订阅执行的原生会话标识、用户明确允许共享的历史文本和原生活动记录。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-17-subscription-engines
baseline: false
changes:
  - root: "event:engine/activity"
    previous: null
    after: "1409a26687363683fc5e9ac05cc23bf3d3a5ba89f0732e8d0b43d34b74329857"
    decision: same-version
  - root: "event:engine/bootstrap"
    previous: null
    after: "ad1b2bb3386f2a568525c4e759b42b0eccd098cf3c94322f981139d6cbabf232"
    decision: same-version
  - root: "event:engine/session"
    previous: null
    after: "2361f3d53b89ac29670945313df9fe9d7f76377a6a892f8c28ce08377a3bb43c"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

已有会话的载荷结构不变，仍可读取。新的 engine/session、engine/bootstrap 和 engine/activity 是必需记录；旧版本对未知且不可忽略的事件拒绝读取，避免恢复错误原生会话或静默丢弃授权上下文。未重新解释已有事件判别值。model/selection 声明移至 Agent 所有者，字段保持不变。

<a id="verification"></a>
## 验证

已完成源码审阅和 gen-persistence-catalog 生成。按用户要求未执行自动测试、lint 或类型检查。原生登录和推理须待用户登录后确认。

<a id="dev-note"></a>
## 开发备注

无。
