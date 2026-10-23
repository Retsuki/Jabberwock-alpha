---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-21-security-supply-chain

English | [中文](2026-10-21-security-supply-chain.zh.md)

## Summary

Adds security-supply-chain attribution with typed scan snapshots to existing notice messages.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

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
## Compatibility

Existing records and the Session writer version remain unchanged. Older readers can interpret the standard user/message notice content or hide nonhuman notices, without consuming the dedicated scan snapshot. New readers restore only matching source kind, owner/run identities and validated run schema; missing or invalid metadata does not become a completed scan. The optional visibleInHistory flag is explicitly true in new scanner messages; other internal notices do not opt in. Ephemeral jobs are not replayed after restart.

<a id="verification"></a>
## Verification

Focused feature regression: 47 tests passed. Notice/sidebar regression: 93 tests passed in /tmp/jw-history-opt-in-tests.log. Actual UI showed two audited package/version pairs, five advisory rows, saved progress, zero model turns and restoration after restart without automatic rerun. Final producer-flag verification is tracked separately in the feature verification record.

<a id="dev-note"></a>
## Dev Note

None.
