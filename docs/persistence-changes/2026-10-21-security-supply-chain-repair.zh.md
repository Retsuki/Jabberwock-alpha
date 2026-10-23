---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-21-security-supply-chain-repair

[English](2026-10-21-security-supply-chain-repair.md) | 中文

## 概述

在保存的供应链提示中增加可选依赖定义指纹与修复快照。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-21-security-supply-chain-repair
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-21-security-supply-chain"
    after: "40c028dbc201e49cc3b73dd75d101e7806e1aca93522a5d79615fbe29ded7fa1"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-21-security-supply-chain"
    after: "e4bf21966aa4c0bb2f33ba549db0185bd04ea2cd9419ee661b51170a5d42e2e3"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-21-security-supply-chain"
    after: "45ed2b335aa444b6899d2e8b8e00c45f4f8ae5d68d8afceb449a33f94418a600"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-21-security-supply-chain"
    after: "9c1edd0da131fedc94fd69af19e18a7e14221a7862e9d360224b00535d811d3a"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

现有 Session 写入版本和标准提示封套不变。旧读取方忽略可选 inputDigest 和 repair 元数据，仍读取扫描内容。新读取方保留旧扫描，但没有已保存定义指纹时拒绝自动修复；已验证修复状态与扫描完成保持区分。恢复时运行中的修复变为中断，不自动应用文件或执行 job。仅定义文件结果明确保留 runtimeTests=not-run。来源身份与运行模式校验仍为必需。

<a id="verification"></a>
## 验证

已冻结类型增加限于 SupplyChainRun.inputDigest?、repair? 及引用修复记录。原扫描器恢复及不启动模型的行为仍由负责方测试覆盖。最终修复实现回归、实际 UI 修复与重启证据尚待完成，将记录在功能验证文档；本确认不声称这些检查已通过。

<a id="dev-note"></a>
## 开发备注

无。
