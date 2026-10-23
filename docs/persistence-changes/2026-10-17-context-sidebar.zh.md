---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-17-context-sidebar

[English](2026-10-17-context-sidebar.md) | 中文

## 概述

新增原生引擎上下文与互斥令牌计数快照，供常驻右侧栏使用。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-17-context-sidebar
baseline: false
changes:
  - root: "event:engine/usage"
    previous: null
    after: "577e20afeb5e4b6f8cc5166221a7b208be4b08cfe5dd2f16f9ce91acff8d4724"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

新增 engine/usage，不修改已有事件载荷。已有会话仍可读取；旧版本拒绝新的必需判别值。使用量快照采用最后观测值，不作为增量累加。尚未获取的数据在派生投影中为 null。

<a id="verification"></a>
## 验证

已对照安装的 SDK 类型审阅源码契约。开发产物生成和启动另行记录。按用户要求不运行自动测试、lint 和类型检查；实时推理指标与界面外观仍需观察。

<a id="dev-note"></a>
## 开发备注

无。
