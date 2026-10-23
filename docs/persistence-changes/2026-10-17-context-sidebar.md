---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-17-context-sidebar

English | [中文](2026-10-17-context-sidebar.zh.md)

## Summary

Adds native-engine context and disjoint token snapshots for the persistent right sidebar.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

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
## Compatibility

Adds engine/usage without changing existing event payloads. Existing sessions remain readable; older builds reject the new required discriminator. Usage snapshots are last-observation records rather than additive deltas. Missing native usage is null in the derived projection.

<a id="verification"></a>
## Verification

Reviewed source contracts against installed SDK types. Development emission and launch are recorded separately. Automated tests, lint and type checking are omitted at user request. Live inference metrics and UI appearance require observation.

<a id="dev-note"></a>
## Dev Note

None.
