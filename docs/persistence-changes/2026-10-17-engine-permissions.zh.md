---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-17-engine-permissions

[English](2026-10-17-engine-permissions.md) | 中文

## 概述

新增 Codex 与 Claude 原生执行各自独立的权限选择。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-17-engine-permissions
baseline: false
changes:
  - root: "event:engine/permission"
    previous: null
    after: "fdbc0a54bd60eb8fbecec48cedba6c6b35a98d18a851d4ce5e55e80f1691ab08"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

新增 engine/permission，不修改标准 sandbox/mode 或 approval/policy 的载荷。未记录原生选择的已有会话使用手动批准默认值。分支会话忽略继承历史中的原生权限。permissions 投影缓存升级至 stateVersion 3，并从事件重建。旧版本拒绝包含新必需事件的会话。

<a id="verification"></a>
## 验证

已审阅安装的 Codex app-server 生成协议和 Claude SDK 权限选项。按用户要求未运行自动测试、lint、类型检查或推理。开发产物生成与启动另行记录；真实原生回合中的权限执行仍未验证。

<a id="dev-note"></a>
## 开发备注

无。
