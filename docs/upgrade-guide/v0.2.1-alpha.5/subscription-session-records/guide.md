---
kind: upgrade-guide
description: "Sessions used with subscription engines contain new required event types that older builds cannot read."
---

# Subscription-engine session records

English | [中文](guide.zh.md)

## Change

Jabberwock records native conversation ownership, explicitly authorized history bootstrap and tool activity as `engine/session`, `engine/bootstrap` and `engine/activity`. Native context and cumulative token snapshots are retained as `engine/usage` for the sidebar. Per-engine permission selections are retained as `engine/permission`; missing selections use manual-approval defaults, and inherited fork selections are not applied. Standard API permission settings remain separate. Existing sessions remain readable by this build. Older builds reject sessions containing these unknown required records instead of silently losing native conversation identity or authorization context.

## Migration

1. Keep a backup of your Harness home before using subscription engines if you need to return to an older build.
2. Resume these sessions with a build that includes the subscription-engine event catalog. Confirm that the selected engine and transcript remain available after reopening the application.
3. Do not remove engine records manually to make an older reader accept a session. Use the backup for downgrades.
