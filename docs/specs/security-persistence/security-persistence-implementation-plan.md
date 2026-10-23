# Security persistence implementation plan

English | [中文](security-persistence-implementation-plan.zh.md)

> 10-second summary: Deliver restart-safe asset and draft-task records in three phases across approximately twelve implementation and composition files. Add one security storage domain through the existing provider; leave existing browser records, Session formats, and engine permissions unchanged.

## Phase 1: Host storage and Remote commands

- [ ] Define versioned company, scope, typed-asset, and task-draft records with Workspace ownership.
- [ ] Add a security-specific Host controller using existing storage-domain and Remote patterns.
- [ ] Register the controller in the Web/desktop Host composition and expose its typed client API.
- [ ] Validate stored input and Workspace existence; await writes and propagate failures.

Use `packages/workspace/workspace/src/spec.ts` and `packages/api/workspace-controller/src/index.ts` as infrastructure references. The new security module owns its own records; do not append security behavior to the chat agent loop or Workspace registry.

The concrete owner files are `packages/client/ui-security/src/security-records.ts` (schema), `packages/client/ui-security/src/index.ts` (Host service), and `packages/client/ui-security/src/client/records-state.ts` (client snapshot and read/save actions).

## Phase 2: Existing screen integration

- [ ] Replace mounted demonstration state in `packages/client/ui-security/src/client/ProjectAssets.tsx` with Workspace-scoped loading and explicit durable mutations.
- [ ] Connect `packages/client/ui-security/src/client/TaskList.tsx` to saved draft tasks and task creation.
- [ ] Pass Workspace identity through `packages/client/ui-security/src/client/SecurityPage.tsx` and keep loading, empty, and error states distinct.
- [ ] Keep task-detail sample panels separate from persisted task metadata; disable unavailable execution actions.

Retain existing UI primitives and theme tokens. Do not add dependencies, shadcn, automatic sample seeding, browser-storage migration, or a diagnostic execution service.

## Phase 3: Verification and documentation

- [x] Create a company, asset, and draft task with selected asset IDs through the UI; stop the Host, restart with the same `DSH_HOME`, and confirm the company, asset, task name, description, objective, draft status, and selected assets in a new browser.
- [ ] Verify durable edits and deletions.
- [ ] Verify two Workspace identities do not share records and legacy browser values remain untouched.
- [ ] Capture the real desktop UI and inspect narrow-screen operation.
- [x] Record actual checks and remaining limitations; update the client README pair after implementation is confirmed.

Observed evidence: `build:artifacts` passed seven build gates. Restored UI captures are `/tmp/jw-persistence-assets-restored.png` and `/tmp/jw-persistence-task-restored.png`; the parent agent registered UI evidence through `verify.py ui`. Concurrent-window conflicts and failure paths have not been exercised.

No full test suite is authorized in this increment. Keep unobserved acceptance items unchecked and report storage or startup blockers without describing them as successful verification. New environment variables and destructive migrations are out of scope.

## Task overview editing extension

- [x] Extend `packages/client/ui-security/src/security-records.ts` with optional typed goals, operation constraints, and scope-rule arrays; accept empty draft rows and missing old fields without a domain-version bump.
- [x] Replace local goal/constraint/rule state in `packages/client/ui-security/src/client/TaskDetail.tsx` with in-place row editing and deletion through the existing `records-state.ts` autosave queue.
- [x] Flush changes after 500 ms, on blur, and on navigation; show actual saving/failure state and keep execution enforcement explicitly disconnected.
- [x] Verify each row type survives reload, deletion remains deleted, blank rows remain editable, and records missing all three fields still open.

Observed extension evidence: schema smoke accepted omitted old fields and empty draft rows, and rejected an invalid action. Seven `build:artifacts` gates, two `build:check` gates, and lint on six affected files passed. UI input, selectors, a second row, reload retention, row deletion, and deletion retention passed; after a Host stop and restart with the same home, a fresh browser restored the edited records. Wide 1450×1000 and narrow 1000×850 captures were inspected at `/tmp/jw-task-policies.png` and `/tmp/jw-task-policies-narrow.png`. Communication-failure and concurrent-writer behavior remain unverified in this extension.
