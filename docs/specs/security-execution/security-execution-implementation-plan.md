# Security execution implementation plan

English | [中文](security-execution-implementation-plan.zh.md)

> 10-second summary: The approved delivery order has four phases: durable task conversation, planning, bounded Worker execution, and concurrent result publication. Phase 1 reuses existing Session persistence and the Claude subscription; it adds a separate conversation mapping domain without changing existing task records or requiring new credentials. No breaking change to ordinary chat is intended.

## Phase 1: Task Main Agent conversation

- [x] Record user approval for architecture B in [ADR 0007](../../adr/0007-security-execution.md).
- [x] Add a dedicated security conversation service and durable Workspace/task-to-Session mapping, separate from the `securityRecords` draft aggregate owner.
- [x] Use existing Agent creation, Session persistence, model selection and cancellation APIs; record the saved task context in the model-visible transcript.
- [x] Add a separate conversation-only route in `packages/core/subscription-engines/src/index.ts` and `claude.ts`; disable native tools, configured MCP servers and settings-derived execution without changing normal-chat routes.
- [x] Connect saved tasks in `packages/client/ui-security/src/client/TaskDetail.tsx` and `TaskSessions.tsx` through existing Session references and projections. Do not duplicate Session transcript polling or fabricate findings.
- [x] Flush pending task edits before sending. Show send admission, authentication errors, active response, cancellation and load failures. Reject duplicate active turns and unavailable Codex conversation-only execution.
- [x] Verify targeted builds and lint, inspect the UI, and check conversation continuity after restart. The approved dummy exchange completed with zero advertised tools and zero tool activities; Host restart restored the same Session and one unchanged answer. Test suites were not run.

## Phase 2: Planner and investigation queue

- [x] Implement `packages/client/ui-security/src/security-planning.ts` as a separate owner-only `securityPlanning` service with `read`, `start` and `cancel`, backed by its own storage domain.
- [x] Define immutable task/asset/conversation snapshots, attempt states and pending items in `packages/client/ui-security/src/planning-types.ts`. Preserve earlier task records and Main Agent Sessions.
- [x] Generate through a separate tool-free Planner Session, validate completed JSON output and selected asset identities, and persist pending investigations only. Bound generation with a configured deadline.
- [x] Serialize admission and terminal decisions, reject duplicate active generation, preserve stable retry identities, and handle cancellation, deletion, archival, shutdown and restart interruption.
- [x] Add shared Planner/Overview views in `packages/client/ui-security/src/client/TaskPlanning.tsx`, with lifecycle-owned state in `planning-state.ts`. Confirm task autosave before capturing inputs.
- [ ] Verify builds, lint, empty/error/cancel views, unexecuted items and restart persistence; record real-model verification separately from static checks. Do not enable Worker or target execution.

Verification on 2026-10-17: `build:artifacts`, `build:check`, focused Host/Client lint and bilingual pairing passed. The approved synthetic task produced four pending items through Claude with zero native tools or tool events. Restarting the verification Host restored the same plan and unchanged Main Agent conversation. Native desktop rendering and the composer were checked. Cancellation races, timeout/error paths and the test suite were not exercised.

## Guided task setup

- [x] Confirm the structured-conversation B design in ADR 0007 before implementation.
- [x] Add optional backward-compatible task setup fields and Host-derived checklist rules in `packages/client/ui-security/src/security-records.ts` and the dedicated `security-setup.ts` owner.
- [x] Register an internal engine that reuses tool-free `claude-conversation`, buffers and validates structured replies, and exposes only natural-language replies. Keep raw output and proposals in the dedicated setup domain; no new Session event type is introduced.
- [x] Add owner-scoped, idempotent setup admission and explicit proposal confirmation through revision-checked `securityRecords.save`. Retain a confirmation journal for retry after a saved update, and require a completed turn before a proposal is eligible.
- [x] Simplify `TaskList.tsx` to name/assets and open `TaskDetail.tsx` on Sessions after saving; provide explicit questioning retry without deleting the task.
- [x] Replace manual checklist state in `SecurityConversation.tsx` with saved setup status and visible proposal confirmation. Keep normal conversation available and actual execution disconnected.
- [x] Run `build:artifacts`, `build:check`, focused lint and readiness tests. Verify creation through the first question with an approved synthetic task and the actual Claude subscription: zero native tools and no raw JSON in the visible reply.
- [x] Verify explicit goal confirmation saves the objective and completion condition, marks one checklist item complete, and asks the next scope question. The confirmation journal reaches `sent` and the browser reports no page errors.
- [x] Inspect the native desktop minimal creation form, including its disabled empty-submit state, and retain screenshot evidence. Final artifact build, build check and nine focused tests pass.
- [ ] Verify clarification versus agreement, the complete five-item flow, direct-edit conflicts, duplicate admission, cancellation and restart.

## Phase 3: One bounded Worker

- [x] Define structured approved operations, deny-first scope compilation and unsupported-constraint rejection in the security runtime.
- [x] Start one Worker with a brokered executor; do not expose an unconstrained native shell as a security executor.
- [x] Reuse public-address and pinned-DNS mechanisms from `packages/web/web-fetch-http/src/network.ts`, reject provider proxy routing, follow zero redirects, and enforce finite time and byte limits.
- [x] Persist start, stop, completion, failure and restart interruption. At most one run per task is active; late completion cannot replace a terminal stop.

## Phase 4: Concurrent execution and result views

- [ ] Add bounded Worker concurrency and Planner reevaluation from committed results.
- [ ] Populate exploration, findings, coverage and reports from actual evidence rather than preview samples.
- [ ] Connect main-chat tools to the same service after task Sessions operate correctly; do not create a second state or command implementation.

External target execution is outside Phases 1 and 2. See the [specification](security-execution-spec.md) for scope and enforcement requirements.

## Main Agent model selection

- [x] Owner approval of B: persist selection separately from execution permissions.
- [x] Resolve native model catalogs and keep unproven tool-free engines unavailable.
- [x] Validate and persist task selection; route setup through the selected model.
- [x] Add localized header controls without resetting conversation or input.
- [ ] Check legacy mappings, rejected selections, idle-only updates, and restart persistence.
- [x] Build, typecheck, and inspect the desktop selector.

Focused tests: 17 passed; artifact gates: 7 passed; aggregate checks: 2 passed. Desktop catalogs and isolated task selection, draft retention, unchanged Session/task data, and reload persistence were verified without sending conversation input. Full process-restart persistence and live responses for each selectable model remain unverified.

## Automatic setup saving

- [x] Apply completed, validated answers through the existing revision-checked journal after Agent idle; continue with the next question without an acceptance button.
- [x] Keep reads free of inference, track background save jobs through teardown, and expose per-task save failures with explicit retry.
- [x] Refresh Overview from the authoritative revision while preserving manual drafts; remove routine proposal controls.
- [x] Verify a synthetic conversation saves exactly once, updates readiness to 1/5, and asks the next missing question without confirmation.
- [x] Artifact gates (7), aggregate checks (2), and focused regression tests (12) pass.
- [ ] Exercise concurrent manual-edit conflict and process shutdown during automatic saving in a runtime test.

## Conversation-driven Planner handoff

- [x] Accept a structured Main Agent Planner action after an explicit user request; save any accompanying valid settings proposal before planning and preserve tool-free execution.
- [x] Require five saved setup checks and an unchanged task revision; deduplicate handoff by completed Session turn and step, and expose retryable failures.
- [ ] Remove separate plan-creation buttons; show recorded attempt history, snapshots and pending items with refresh/cancel controls, without fabricated Worker activity.
- [ ] Verify action validation, duplicate handoff, changed settings, failures, history rendering and restart persistence; keep Worker and target execution disconnected.

## Role model settings and first Worker delivery

- [x] Add backwards-compatible `task.agentModels` selections and role-aware catalog/select commands; share Main Agent header and Overview persistence.
- [x] Capture validated Planner and Worker models at admission and keep running invocations fixed.
- [x] Add `worker-types.ts`, `worker-policy.ts` and `security-workers.ts` with explicit operation approval, scope/public-address checks, finite transport limits, durable evidence and stop/restart handling.
- [x] Add Overview model controls, plan-item operation approval and actual Worker results in Sessions.
- [x] Verify composed RPC, model persistence, empty/results screens and one complete Worker operation with deterministic network/model fixtures; no real user assets were sent.
- [x] Run final artifact, aggregate type, focused behavior, lint and persistence checks; documentation pairs are recorded with the current implementation.

Verification: 53 security tests and 69 reused transport tests passed; artifact gates (7), aggregate checks (2), lint and persistence checks passed. The composed UI used deterministic HTTP/model fixtures and preserved the selected model, one completed run and evidence across Host restart. One earlier fixture attempt reached public example.org with one anonymous GET because its network replacement targeted the wrong module; no user asset was contacted and model interpretation remained a fixture. Live Worker model responses and remote-principal isolation are unverified.

## Automatic role model selection

- [x] Persist automatic/fixed role modes with legacy explicit-model compatibility; validate fixed choices against actual catalogs.
- [x] Let Main Agent choose Planner and Planner choose item Worker models with concise reasons; retain decisions in invocation snapshots without changing execution permissions.
- [x] Accept clear conversational role preferences through existing revision-checked saving; apply changes only to new invocations.
- [x] Preserve older plans and require replanning when automatic Worker decisions are missing.
- [ ] Verify automatic model selection with a live provider; deterministic tests do not establish live model behavior.

## Planner feedback execution

The dedicated execution service reuses existing Planner and Worker services, retaining durable execution identity, captured target policy, lifecycle and configured limits. Planner receives terminal observations and emits structured decisions; the Main Agent requests execution while the panel exposes progress and stop. Deterministic model and HTTP providers cover continuation, completion, unsupported operations, stop races, idempotence, changed settings and restart without network resumption. Live paid-model execution requires separate verification.

## Asset-scoped target selection

- [x] Remove required owner URL entry from execution and item starts; capture saved assets and scope rules for new investigations.
- [x] Let Planner choose supported GET paths and allowed registered-root descendants, retaining deny-first checks and per-request public DNS validation.
- [x] Keep legacy exact-target snapshots readable and restricted; do not resume unfinished runs automatically.
- [ ] Verify composed UI, focused policy/lifecycle tests and persistence compatibility; record actual evidence separately from live-model validation.

## Conversation-driven delegation and activity presentation

Reuse the dedicated coordinator for a Main Agent investigation action, including initial model-selected planning, durable handoff, idempotence and cancellation. Keep planning-only requests separate. Replace aggregate Worker navigation with stable per-run selection and render compact Planner rounds from saved execution/plan records. Verify current-owner admission, automatic choices, same-turn saving, cancellation during initial planning, dynamic Worker selection, empty states and composed chat-to-execution behavior without external target/model calls.

## DeepSeek integration (approved B)

Reuse provider catalogs through a tool-free internal adapter rather than adding branches to each role or replacing execution. Extend shared selections and validators, then test header and overview controls. Verify account/API isolation, history consent, actual routing, cancellation, unavailable models and old records. Build artifacts and aggregate checks precede screen verification. Report real-provider validation separately from fake-provider tests.

## Worker chat delivery (approved B)

- [x] Extend `worker-types.ts` and `security-workers.ts` with durable run-owned messages and idempotent follow-ups; preserve old records, captured models and task isolation.
- [x] Render Planner instructions, public GET outcomes, reports and owner follow-ups in `TaskWorkers.tsx`, retaining selected run identity, expandable evidence and fixed header/composer.
- [x] Reuse tool-free analysis of existing evidence; allow one queued instruction during the initial run but reject concurrent follow-ups, preserve cancellation/failure and interrupt unfinished replies on restart without resuming HTTP.
- [x] Verify legacy records, retries, isolation, cancellation/restart and zero additional target requests. Run focused tests, artifacts and aggregate checks, then inspect desktop UI; report real-provider checks separately from fixtures.

## Timeline and exploration delivery

- [x] Add a deterministic activity projection with stable identities and explicit relations.
- [x] Connect task tabs to existing scoped read APIs with non-overlapping refresh, pause and retry.
- [x] Match ARTEX timeline details and exploration graph controls.
- [x] Verify projection, screen interactions, empty/failure/reload behavior, builds and rendered UI.

## Findings and retests delivery (approved B)

- [x] Add `finding-types.ts` and `security-findings.ts` for workspace/task-owned findings, triage, durable idempotent retests and terminal results.
- [x] Share bounded transport with `security-workers.ts`; persist structured findings only with source evidence, preserving old records.
- [x] Connect saved-task findings and retest tabs through a typed client service and ARTEX-style evidence/history views.
- [x] Verify storage compatibility, isolation, retries, duplicate starts, unsupported validation, cancellation/restart and fixed-only-on-success. Run focused tests, builds and actual desktop interactions without external target or model calls.

## Response capture and saved report delivery (approved B)

- [x] Separate finite HTTP capture storage from the bounded text supplied to each model; retain task-owned response files and backward-compatible inline evidence.
- [x] Record capture and analysis gaps without converting response-size truncation into a failed Worker; retain policy, cancellation and deadline enforcement.
- [x] Prevent a Planner completion claim from hiding failed, partially checked, unsupported or undispatched operations.
- [x] Populate the saved-task Report tab from actual task, execution, evidence, finding and retest records; provide a Markdown copy without another model request.
- [x] Run focused regression tests, artifact and aggregate checks, then exercise the real desktop UI and retain screenshots; distinguish fixture verification from live target/model verification.

## Planner and Worker token headers (approved B)

- [x] Reuse native and API Session usage projections through one client read path; deduplicate Planner Session identities and retain exact selected-Worker ownership.
- [x] Add a shared localized compact token header with exact-value details, unreported and reported-zero states; wire it to `SecurityConversation.tsx` without changing execution services.
- [x] Verify repeated snapshots, multiple Planner attempts, Worker follow-ups, missing measurements, stale reads and header layout with focused tests.
- [x] Run artifacts and aggregate checks, then inspect real saved usage in the native app and retain screenshots without another model or target request.

## ARTEX asset coverage

- [x] Project registered asset scope, real observations and containment relationships with distinct counts and explicit unknown states.
- [x] Connect the real Coverage tab to existing read services and provide graph controls, folding, asset details and Worker navigation.
- [x] Verify focused regressions, build checks and the native UI, retaining screenshots and distinguishing observed reach from completed diagnosis.

## Investigation stability

- [x] Make Planner output mode-specific and add finite, logged syntax/schema correction in `security-planning.ts`; retain policy rejection, cancellation and shared deadline behavior.
- [x] Add compatible optional continuation identities in `execution-types.ts` and strict admission in `security-execution.ts`; retain original history, observations and finite request/round budgets.
- [x] Connect the Main Agent header and execution history to explicit continuation with localized status and stable retries.
- [x] Verify malformed response recovery, exhausted attempts, cancellation, duplicate continuation, restart behavior, remaining operations and unchanged original history; build and exercise the native UI with screenshots.

- [x] Recover malformed Worker reports using retained evidence without another GET; verify shared cancellation, timeout and proof validation.

## Local finding verification

- [x] Add a loopback-only synthetic HTTP fixture and verify vulnerable and fixed responses with real HTTP.
- [x] Add explicit exact local origins to the shared policy and transport, retaining default public-only behavior and existing execution checks.
- [x] Register a separate local asset/task through the desktop UI, complete setup with the Main Agent and run real model-driven investigation.
- [x] Confirm evidence-backed findings in the UI, retain screenshots and distinguish actual model results from fixture tests.


## Executive report presentation

> Three phases replace the Markdown-first view with eight executive sections and retain technical details and export. Approximately eight source/test files change; no database or API changes.

- [x] Add `src/executive-report-model.ts` with pure, status-aware severity, asset and priority projections plus focused boundary tests.
- [x] Compose `src/client/TaskExecutiveReport.tsx`, its module CSS and localized copy with existing primitives; integrate through `TaskSavedReport.tsx`, retaining technical Markdown and evidence.
- [x] Verify relevant tests, build checks, light/dark and narrow native report scrolling, empty-state behavior, export contents and screenshots.

## Native structured setup output

The owner approved B: connect the existing strict setup schema through the native Claude adapter instead of extracting JSON from prose or replacing the conversation runtime.

- [x] Add optional `EngineRunRequest.responseSchema` and pass the exact logged setup schema on every bounded attempt.
- [x] Configure Claude conversation-only SDK JSON-schema output, validate the final structured result and reject missing output without prose fallback.
- [x] Keep native permissions and external tools disabled; admit only schema-validated internal `StructuredOutput` input when explicitly requested.
- [x] Verify schema forwarding, final-result selection, missing/invalid output, tool isolation, nonstructured behavior and setup correction through focused automated tests.
- [x] Confirm actual-model setup answers save and proceed in the desktop UI; record errors and screenshots separately from automated results.
