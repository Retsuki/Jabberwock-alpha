# Security UI migration implementation plan

English | [中文](security-ui-migration-implementation-plan.zh.md)

> 10-second summary: Reuse the migrated security views under existing workspace rows in three phases. Changes principally affect `ui-workspace` and `ui-security`. No new UI dependency, Host database, Session-format, authentication, or real diagnostic execution is planned.

## 1. Workspace-owned navigation

- [x] Expose `sidebar.workspaces.project.children` in `packages/client/ui-workspace/src/client/` with workspace ID and display title.
- [x] Register the Security accordion in `packages/client/ui-security/src/client/index.ts`; route Assets, Tasks, Vulnerabilities, and Agents to the main panel by workspace ID and view.
- [x] Remove the global Security entry and independent project picker from the user flow; preserve existing chat navigation.

## 2. Isolated draft state

- [x] Use `workspace:${workspaceId}` under `jabberwock.security.v1`; start new workspaces empty and preserve all independent legacy project values.
- [x] Follow current workspace names in the security header and retain existing target registration and diagnostic/finding details.
- [x] Retain disconnected-execution notices and existing-component styling; add no shadcn dependency.

## 3. Review and preserve

- [x] Inspect accordion selection, all four views, parent expansion, active navigation, and existing chat on desktop.
- [ ] Inspect cross-workspace switching, rename behavior, and flat/search displays on desktop; these have code review only.
- [x] Confirm an empty workspace view and boolean checks for legacy Acme/internal preservation and creation of the workspace namespace.
- [ ] Recheck registration and reload restoration through the new workspace entry point; the earlier observations belong to record 005.
- [ ] Inventory skipped features and required materials/data before deciding whether the prototype can move to the Trash.

## Deferred inventory

The G6 coverage visualization, Next.js-specific chat, real AI and diagnostic execution, and browser-origin data import remain outside this migration. UI requiring a new component dependency stays deferred pending user review. Keep `jabberwock2/` until verification and preservation conditions are satisfied.

## Verification records

The [initial migration record](../../verification/2026-10-17-005-security-ui.md) records the earlier global-panel implementation. It does not verify the workspace accordion. Record current checks in the [workspace navigation record](../../verification/2026-10-17-006-project-security-menu.md), and follow the user's restriction on automatic test execution. Do not commit or push without a request.
