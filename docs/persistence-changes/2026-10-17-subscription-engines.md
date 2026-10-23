---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-17-subscription-engines

English | [中文](2026-10-17-subscription-engines.zh.md)

## Summary

Adds subscription execution session identities, explicitly authorized conversation bootstrap text, and native activity records.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

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
## Compatibility

Existing sessions retain the same payload schemas and remain readable. New engine/session, engine/bootstrap, and engine/activity discriminators are required records; older builds reject unknown non-ignorable event types instead of resuming a different native conversation or silently discarding authorization context. No existing event discriminator is reinterpreted. The model/selection declaration moves to its Agent owner without changing its fields.

<a id="verification"></a>
## Verification

Source review and gen-persistence-catalog completed. Automated tests, lint, and type checking were not run at the user's request. Native login and inference remain unverified until the user signs in.

<a id="dev-note"></a>
## Dev Note

None.
