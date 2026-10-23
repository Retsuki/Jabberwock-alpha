# Supply-chain check implementation plan

English | [中文](supply-chain-check-implementation-plan.zh.md)

> Implement approved B in three phases: fixed Host scan and persistence, conversation/table/report UI, then verification. Reuse Session, jobs, Workspace navigation and report components. No database migration, LLM dependency or automatic package change is required.

## Scope and owners

Follow the [specification](supply-chain-check-spec.md). The Host implementation owns scanner contracts, lock interpretation, registry facts and persistent results. The UI implementation owns the sidebar entry, conversation event presentation and report navigation. Agree on result/event types before implementing consumers; API names may be refined during implementation.

## Phase 1: Contracts and Host scanner

- [x] Define `securitySupplyChain.start/read/cancel` identities, idempotency, run states, progress events and result rows with the Host owner. Keep Workspace/Gateway authorization and Host-owned path resolution.
- [x] Add a fixed scanner service using existing `ctx.jobs.start` cancellation/lifetime support and persisted Session events; ephemeral jobs are not the result store. Persist typed run snapshots in existing `user/message` notices (`security-supply-chain`, `form=notice`, producer `visibleInHistory:true`) and wait through jobs to suppress model wakeup. Create the Workspace conversation through `packages/api/session-controller/src/commands.ts`.
- [x] Interpret npm/pnpm locks, shared workspace scope, direct/transitive dependencies and production/development classifications without installing or executing project code.
- [x] Query npm registry advisory facts with bounded requests and output. Optionally enrich public GHSA IDs through a fixed-host, token-free GitHub advisory lookup; failures leave unknown fields without suppressing registry findings.
- [x] Persist installed/fixed versions, severity, source URLs/identifiers, advisory dates, general impact/rationale and separately qualified project impact. Do not infer confirmed impact from a static import.
- [x] Cover cancellation, timeout, absent/unsupported lockfiles, incomplete responses, registry failures and duplicate/concurrent requests with focused Host tests.

## Phase 2: Conversation and report UI

- [x] Add `サプライチェーンチェック` to `packages/client/ui-security/src/client/WorkspaceSecurity.tsx` and bind the approved start operation; explain external package/version and GHSA-ID lookup in the scan conversation and report.
- [x] Reuse `UiWorkspace.openSession` and `uiConversation.events.register` to show the dedicated conversation, progress stages, cancellation and persisted results.
- [x] Present a table with package, installed/fixed version, severity, source/advisory dates and dependency scope; expand rows for general impact, rationale and project-impact confidence.
- [x] Reuse existing ExecutiveReport/shared report components for the report view. Preserve unknown data, missing fix information, incomplete scan state and the difference between advisory dates and project observation time.
- [x] Add localized labels and focused UI tests, including zero rows, long package/advisory text, missing fields, errors and repeated clicks.

## Phase 3: Verification and evidence

- [ ] Run affected tests, type checks, lint and required artifact builds; keep unrelated uncommitted changes.
- [x] Exercise actual UI from sidebar to progress, table, row expansion and report using a registered local test Workspace. Capture screenshots through `verify.py ui`.
- [ ] Verify cancellation and active-run reopening in the actual UI.
- [x] Restart the application and confirm saved results remain visible without an automatic rerun or model turn, with the explicit history flag and version-three metadata.
- [ ] Verify complete zero matches and incomplete/error outcomes remain distinct. Check package/version and public GHSA-ID disclosures against actual network requests; never upload source, environment or secret-file contents.
- [ ] Open report beginning/end and inspect narrow/wide layouts. Record executed checks, failures and unverified cases without claiming unknown-vulnerability detection or exploitability.
- [ ] Re-record English/Chinese documentation pairing and validate affected links. Do not commit or push.

## Constraints

The scanner must not install, fix or update dependencies, run arbitrary shell commands, execute payloads or attack the target application. LLM output is not required for factual results. Advisory matching does not prove reachability or safety; missing information stays explicit. This plan is not evidence that implementation or validation has completed.

## Verification status

Implemented phases are checked above. The [verification record](supply-chain-check-verification.md) owns executed checks and remaining verification, including the completed final history opt-in rebuild/restart and the 129-test regression. Grouped phase-three tasks remain unchecked until all their clauses have evidence.

## Approved extension plan — implemented and exercised

B is approved. Initial repair is limited to standalone public direct dependencies, isolated script-free lock-only staging, fresh advisory checks, original-file hash checks, backed-up manifest/lock application and rescan. node_modules and application health remain unverified. It does not change the completed scanner phases above.

- [x] Record approved B versus A/C and document the Host-owned dependency repair operations and verification limits before implementation.
- [x] Reuse existing scanner/history owners for check list/read; define a separate repair owner and before/after scan linkage.
- [x] Replace multiple sidebar destinations with one Security route and add Assets, Tasks and Supply-chain tabs in SecurityPage.
- [x] Build the task-style check list, upper-right Start action and immediate running row; embed the existing Session conversation/report in row details.
- [x] Implement approved individual/bulk dependency repair and follow-up scanning only after repair semantics are agreed; retain failures and incomplete outcomes.
- [x] Verify navigation, running/completed rows, existing history, individual/bulk operations, rescan linkage and restoration after restart in the actual UI. Keep application health unverified unless its checks actually ran; capture screenshots and update evidence.
