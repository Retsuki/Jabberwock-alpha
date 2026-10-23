---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-17-security-task-context

English | [中文](2026-10-17-security-task-context.zh.md)

## Summary

Adds security-task-context attribution to logged task-conversation input.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

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
## Compatibility

The new kind only attributes existing user-message text and uses the existing notice presentation. Existing source kinds, event envelopes and model-visible content semantics are unchanged. New readers retain old records; older readers preserve unknown user/developer source kinds under the established source compatibility policy. No new required execution semantics depend on this attribution.

<a id="verification"></a>
## Verification

Final build:artifacts passed 7 gates, followed by build:check passing 2 gates; targeted oxlint passed. verify-persistence-changes classified all four affected roots as attribution-kind-added with requiresCompatibilityReview false. An approved dummy Claude exchange completed with zero advertised tools and zero tool activities; Host restart restored the same answer. Test suites were not run at user request.

<a id="dev-note"></a>
## Dev Note

None.
