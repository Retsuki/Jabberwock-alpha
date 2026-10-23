---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-17-engine-permissions

English | [中文](2026-10-17-engine-permissions.zh.md)

## Summary

Adds independent per-engine permission selections for native Codex and Claude execution.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

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
## Compatibility

Adds engine/permission without changing standard sandbox/mode or approval/policy payloads. Existing sessions without native selections start with manual-approval defaults. Native selections in inherited fork history are ignored. The permissions projection cache advances to stateVersion 3 and rebuilds from events. Older builds reject sessions with the new required event.

<a id="verification"></a>
## Verification

Reviewed the installed Codex app-server generated protocol and Claude SDK permission options. Automated tests, lint, type checking and inference were not run at user request. Development emission and launch are recorded separately; permission enforcement in real native turns remains unverified.

<a id="dev-note"></a>
## Dev Note

None.
