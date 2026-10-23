---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-19-security-worker-tools

English | [中文](2026-10-19-security-worker-tools.zh.md)

## Summary

Widens the log-only engine/activity provider identity from the Claude/Codex subscription literals to string so the dedicated DeepSeek Worker records its actual provider without misattribution. The activity event declaration moves to the common Agent engine vocabulary; the Session writer remains format V4.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-19-security-worker-tools
baseline: false
changes:
  - root: "event:engine/activity"
    previous: "2026-10-17-subscription-engines"
    after: "dbf8a504939cba2bb9b2d2f0dbfce01ed0d34d28442bd4cf131d304f63570778"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing Claude and Codex activity records retain the same discriminator, fields and meaning, and new readers accept them unchanged. The released reader validates known event vocabulary and JSON envelopes rather than restricting activity.data.engine to its former TypeScript literals, so it preserves new provider identities instead of truncating or repairing the log. Activity is log-only: it does not execute tools, alter model-visible history, or authorize an operation. DeepSeek writes worker-request, worker-response, worker-tool-call and worker-tool-result kinds, which older history-sharing consumers already ignore. The current history-sharing projection additionally accepts only Claude/Codex engine identities before interpreting history-sharing activity. Tool scope, budgets and per-operation approvals remain enforced by the live owning service, never by replaying activity. Worker storage adds optional observations, findingObservationIndexes, httpRequests, pendingApproval, snapshot.limits.maxRequests and evidence.method; these domain records are outside the Session schema inventory. New domain readers retain legacy absence (including legacy GET observations); older strict domain readers reject unsupported fields before execution rather than silently interpreting new permissions. No Session format bump is required for this log-only provider extension.

<a id="verification"></a>
## Verification

pnpm exec vitest run packages/core/subscription-engines/tests packages/client/ui-security/tests/security-worker-deepseek.spec.ts: 6 files and 36 tests passed, including foreign-provider history-sharing rejection, unknown Worker capability rejection, typed argument validation, finite model steps and cancellation. pnpm exec tsc -b packages/core/agent packages/core/subscription-engines packages/client/ui-security --emitDeclarationOnly: passed. Real model and native UI verification are still in progress and are not claimed by this acknowledgement.

<a id="dev-note"></a>
## Dev Note

None.
