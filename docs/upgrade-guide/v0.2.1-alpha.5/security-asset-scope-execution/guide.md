---
kind: upgrade-guide
description: "New security executions select URLs within saved task assets and scope rules instead of requiring exact owner-entered URLs."
---

# Asset-scoped security execution

English | [中文](guide.zh.md)

## Change

New investigations capture `targetMode: asset-scope` and the saved task assets and scope rules. Planner selects supported anonymous GET URLs within that scope; the start form no longer requires individual URLs. Host validation still rejects excluded targets, non-public addresses and unsupported operations. Existing execution snapshots without this mode retain their exact-target restrictions and are not rewritten or automatically resumed.

## Migration

1. Review the task’s selected registered assets, scope rules and diagnostic permission in Overview before starting a new investigation. Register narrower assets or exclusions when the whole root-domain scope is not authorized.
2. Start a new investigation from Planner to use saved asset scope. Older exact-target executions remain history; restarting the application does not resume them.
3. Confirm the execution shows its captured assets, limits and selected operations. Unsupported free-form constraints still block execution; no shell, credentials, redirects or query parameters are enabled by this change.
