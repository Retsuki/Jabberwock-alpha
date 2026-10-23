# Security UI migration specification

English | [中文](security-ui-migration-spec.zh.md)

> 10-second summary: Bring the prototype security workspace into Jabberwock with existing UI components. Users can explore projects, assets, diagnostic tasks, findings, and agents without a separate Next.js server. This phase contains demonstration data; it does not perform security testing. No Host database or Session-format change is planned.

## Scope

This reference defines the approved UI migration. The source is `jabberwock2/frontend`: its store uses `artex-state-v1` localStorage and simulated AI responses; the Hono backend only serves a greeting. The destination is `packages/client/ui-security`, presented through an accordion under each existing workspace/project row and the `security` main panel. Existing chat remains available independently.

## User flow

1. Expand Security under an existing workspace/project in the left sidebar.
2. Choose Assets, Tasks, Vulnerabilities, or Agents to open that workspace’s security view. The independent security project picker is not an entry point.
3. Register targets and inspect task or finding details. Empty lists and unknown selections provide a return path to the relevant list.
4. Return to Chat without replacing or submitting the current conversation.

Task details reuse available overview, conversation-history, exploration, timeline, findings, retests, assets, approvals, and report information where existing UI components suffice. Demonstration controls must never imply that a real scan, approval, agent, or report export ran.

## Data and safety

Security data is isolated by the existing workspace ID, independently from Session history and Host credentials. The `sidebar.workspaces.project.children` slot carries workspace ID and display title; private security navigation selects a workspace ID and view. Storage stays under `jabberwock.security.v1` with project IDs `workspace:${workspaceId}`. The accordion renders immediately after an expanded real workspace project row; virtual folders, unclassified items, and flat-group displays do not receive it. Active styling requires the matching workspace/view and visible security panel. The header follows the current workspace title through `useWorkspaces`. A new workspace starts empty. Preserve existing `jabberwock.security.v1` values, including independent Acme/internal demonstration projects; do not delete them or assign them to an arbitrary workspace. Storage failure must be visible rather than reported as successful durable saving. Invalid saved data must not be overwritten silently. No target contact, model request, subprocess launch, or permission change is part of this phase.

The prototype's browser origin owns its existing storage. The migration must not assume that an Electron origin can read it. Leave `artex-state-v1` untouched; retain the prototype until saved data and reference materials have an agreed preservation path. This phase does not promise automatic import of prior browser data.

## Deferred work and acceptance

Do not add shadcn, Tailwind, or Base UI. Defer the G6 coverage graph and prototype-specific chat. Record other UI that would require an additional component dependency for later user review. Real diagnosis, AI planning, streaming workers, and enforcement of security approvals require a separate design.

Acceptance requires desktop inspection of workspace accordion navigation, asset registration, details, empty states, workspace isolation, preservation of legacy values, persistence after reload, and narrow-screen layout; existing chat must remain usable. Keep unobserved checks explicitly pending in the [implementation plan](security-ui-migration-implementation-plan.md). Only after migration verification and preservation of required data and materials may `jabberwock2/` move to the Trash. Permanent deletion is not authorized.
