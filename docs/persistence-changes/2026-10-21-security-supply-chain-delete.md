---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-21-security-supply-chain-delete

English | [中文](2026-10-21-security-supply-chain-delete.zh.md)

## Summary

Adds an optional deletion time to the persisted supply-chain run so one run can be hidden logically.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

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
## Compatibility

Existing records remain valid because the field is optional and absence means the run is not deleted. A reader that does not know the field strips it and keeps showing the run, so a downgrade can show a deleted run again; no earlier snapshot is rewritten or removed. The Session log keeps every earlier snapshot of the run as evidence.

<a id="verification"></a>
## Verification

pnpm exec vitest run packages/client/ui-security: 51 files, 603 tests passed, including host tests for deletion, restart restore and the retained Session log.

<a id="dev-note"></a>
## Dev Note

None.
