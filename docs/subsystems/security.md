# Workspace security

English | [中文](security.zh.md)

The Workspace security subsystem owns asset/task records, guided setup, planning, bounded investigation, shared exploration, findings, retests and supply-chain checks. Services require the live Workspace owner; saved scope and operation checks remain with the executing service. Restart reads saved state without automatically dispatching target operations.

The [security package reference](../../packages/client/ui-security/README.md) defines the request/result records, admission rules, durable state and supported investigation limits. The generated API below lists the current Host services and committed-record notification; opening a report does not perform an investigation.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxsecuritycontrol--securitycontrolservice"></a>

### `ctx.securityControl` — `SecurityControlService`

Owner-only commands reuse record revisions, checklist admission and Worker delivery.

```ts cordis-catalog
/** Execute one owner command; execution acceptance never implies completed investigation.
 * @param request Workspace-scoped command with current revision for mutable settings or execution.
 * @returns Compact current state and an explicit destination for open commands.
 */
@Remote({ resources: { workspace: (request: SecurityControlRequest) => request.workspaceId } }) async execute(request: SecurityControlRequest): Promise<SecurityControlResult>
```

Source: [`packages/client/ui-security/src/security-control.ts`](../../packages/client/ui-security/src/security-control.ts)

<a id="ctxsecurityconversations--securityconversationsservice"></a>

### `ctx.securityConversations` — `SecurityConversationsService`

Own task-to-Session mapping and Agent lifetime; Session projection owns transcript reads.

```ts cordis-catalog
/** Open the task's sole conversation, restoring the same persisted Session after restart.
 * @param request Task and Workspace identity.
 * @returns Identity for the existing Session projection/follow renderer.
 */
@Remote({ resources: { workspace: workspaceResource } }) open(request: SecurityConversationRequest): Promise<SecurityConversationValue>

/** Read provider-owned model choices for this task without starting inference.
 * @param request Task and Workspace identity.
 * @returns Current selection and safe engine catalogs.
 */
@Remote({ resources: { workspace: workspaceResource } }) async catalog(request: SecurityConversationCatalogRequest): Promise<SecurityConversationCatalog>

/** Save role selections for the next invocation; Main Agent changes require its Session to be idle.
 * @param request Task identity and catalog choice.
 * @returns The unchanged Session with the saved selection.
 */
@Remote({ resources: { workspace: workspaceResource } }) select(request: SecurityConversationSelectRequest): Promise<SecurityConversationValue>

/** Resolve the tool-free native route used by this task, including its model.
 * @param sessionId Owned task Session.
 * @returns Selected native route for the next request.
 */
routeFor(sessionId: SessionId): { provider: string; model: string }

/** Reject setup followup admission while the task selection is being saved.
 * @param request Task identity.
 */
assertSelectionSettled(request: SecurityConversationRequest): void

/** Submit one owner message; acknowledge only after the accepted inbox is durable.
 * @param request Task identity, text and stable retry identity.
 * @returns The Session identity and durable admission acknowledgement.
 */
@Remote({ resources: { workspace: workspaceResource } }) async send(request: SecurityConversationSendRequest): Promise<{ sessionId: SessionId; accepted: true }>

/** Stop only this task's current conversation and await durable turn settlement.
 * @param request Task and Workspace identity.
 * @returns After cancellation and persistence have settled.
 */
@Remote({ resources: { workspace: workspaceResource } }) async cancel(request: SecurityConversationRequest): Promise<void>
```

Types: [SessionId](core.md)

Source: [`packages/client/ui-security/src/security-conversations.ts`](../../packages/client/ui-security/src/security-conversations.ts)

<a id="ctxsecurityexecution--securityexecutionservice"></a>

### `ctx.securityExecution` — `SecurityExecutionService`

Persist dispatch before execution, bound repetition, and never replay after restart.

```ts cordis-catalog
/** Read persisted execution history without dispatching work.
 * @param request Owner task identity.
 * @returns Durable history without dispatching.
 */
@Remote({ resources: { workspace: workspaceResource } }) read(request: SecurityConversationRequest): SecurityExecutionState

/** Admit an investigation using the current saved task and plan.
 * @param request Current saved plan and optional legacy exact-target authorization.
 * @returns Durable admission state.
 */
@Remote({ resources: { workspace: workspaceResource } }) start(request: SecurityExecutionStartRequest): Promise<SecurityExecutionState>

/** Cancel the active investigation and await its child operations.
 * @param request Owner task identity.
 * @returns History after active children settle.
 */
@Remote({ resources: { workspace: workspaceResource } }) async cancel(request: SecurityConversationRequest): Promise<SecurityExecutionState>
```

Source: [`packages/client/ui-security/src/security-execution.ts`](../../packages/client/ui-security/src/security-execution.ts)

<a id="ctxsecurityexploration--securityexplorationservice"></a>

### `ctx.securityExploration` — `SecurityExplorationService`

Host-bound capabilities cannot choose another task, role or evidence owner.

```ts cordis-catalog
/** Read committed knowledge without starting inference or target access.
 * @param request Owner task identity.
 * @returns Live source projections and committed annotations.
 */
@Remote({ resources: { workspace: resource } }) async read(request: ExplorationRequest): Promise<SecurityExplorationState>

/** Read bounded shared knowledge for an admitted Planner or Worker.
 * @param request Admitted task identity.
 * @param options Optional original node identities for a narrower read.
 * @returns Immutable current shared input within the model byte budget.
 */
async forPlanner(request: ExplorationRequest, options?: ExplorationReadOptions): Promise<SecurityExplorationState>

/** Bind exploration reads and evidence-linked publication to one admitted Worker.
 * @param run Admitted original Worker.
 * @returns Task/run-bound private capability.
 */
bindWorker(run: SecurityWorkerRun): ExplorationWorkerCapability

/** Apply only an authoritative ready plan; retries never append duplicate annotations.
 * @param proposed Validated ready output from the original planning owner.
 * @returns Updated shared projection.
 */
applyPlan(proposed: AnnotatedPlan): Promise<SecurityExplorationState>
```

Source: [`packages/client/ui-security/src/security-exploration.ts`](../../packages/client/ui-security/src/security-exploration.ts)

<a id="ctxsecurityfindings--securityfindingsservice"></a>

### `ctx.securityFindings` — `SecurityFindingsService`

Independent service; never fabricates Planner items or overwrites original evidence.

```ts cordis-catalog
/** Read findings and synchronize completed Worker reports.
 * @param request Owner task identity.
 * @returns Persisted findings and verification history, with no target access.
 */
@Remote({ resources: { workspace: resource } }) async read(request: SecurityConversationRequest): Promise<SecurityFindingState>

/** Update owner triage while preserving the original observation.
 * @param request Explicit owner triage.
 * @returns Updated task history, preserving original evidence.
 */
@Remote({ resources: { workspace: resource } }) async setStatus(request: SecurityConversationRequest & { findingId: string; status: FindingStatus }): Promise<SecurityFindingState>

/** Link or unlink one original finding without replacing its evidence or representative triage.
 * @param request Owner task, original finding and optional representative (absence unlinks).
 * @returns Updated task findings and unchanged retest identities.
 */
@Remote({ resources: { workspace: resource } }) async linkDuplicate( request: SecurityConversationRequest & { findingId: string; canonicalFindingId?: string }, ): Promise<SecurityFindingState>

/** Admit an independent verification of a saved finding.
 * @param request Explicit request for one new anonymous GET of the original finding URL.
 * @returns Durable acceptance and history.
 */
@Remote({ resources: { workspace: resource } }) async startRetest( request: SecurityConversationRequest & { findingId: string; requestId: string; notes: string }, ): Promise<SecurityFindingState>

/** Cancel one active verification and await settlement.
 * @param request Owner task identity and exact verification.
 * @returns History after cancellation settles.
 */
@Remote({ resources: { workspace: resource } }) async cancelRetest(request: SecurityConversationRequest & { retestId: string }): Promise<SecurityFindingState>
```

Source: [`packages/client/ui-security/src/security-findings.ts`](../../packages/client/ui-security/src/security-findings.ts)

<a id="ctxsecurityplanning--securityplanningservice"></a>

### `ctx.securityPlanning` — `SecurityPlanningService`

Own one isolated Agent per planning admission; format corrections share its Session.

```ts cordis-catalog
/** Read attempts for this owner task, newest first; no read starts inference.
 * @param request Registered Workspace and task identity.
 * @returns Durable planning history including failed and interrupted attempts.
 */
@Remote({ resources: { workspace: workspaceResource } }) read(request: SecurityConversationRequest): SecurityPlanningState

/** Admit at most one attempt per task; the Host owns completion after this call returns.
 * @param request Task identity and stable retry identity.
 * @returns Planning history after the accepted attempt is durably recorded.
 */
@Remote({ resources: { workspace: workspaceResource } }) start(request: SecurityPlanningStartRequest): Promise<SecurityPlanningState>

/** Cancel an admitted attempt and wait until late model output can no longer commit.
 * @param request Registered owner task identity.
 * @returns Durable cancellation, or the completed result when completion already claimed its commit.
 */
@Remote({ resources: { workspace: workspaceResource } }) async cancel(request: SecurityConversationRequest & { planId?: string }): Promise<SecurityPlanningState>

/** Admit a review of authoritative terminal Worker results.
 * @param request Previous plan, terminal result IDs and approved targets.
 * @returns Durable admitted review history.
 */
@Remote({ resources: { workspace: workspaceResource } }) review(request: SecurityPlanningReviewRequest): Promise<SecurityPlanningState>

/** Repair shared annotations for an authoritative ready plan before any dispatch.
 * @param request Owner task and saved ready plan identity.
 */
async repairExploration(request: SecurityConversationRequest & { planId: string }): Promise<void>
```

Source: [`packages/client/ui-security/src/security-planning.ts`](../../packages/client/ui-security/src/security-planning.ts)

<a id="ctxsecurityrecords--securityrecordsservice"></a>

### `ctx.securityRecords` — `SecurityRecordsService`

Owner-only atomic record API; accepted writes settle after storage durability.

```ts cordis-catalog
/** Read existing records; a missing record returns an unsaved empty aggregate.
 * @param request - registered workspace identity.
 * @returns a detached aggregate at its current durable revision.
 */
@Remote read(request: SecurityReadRequest): SecurityRecords

/** Atomically replace a current aggregate after validating ownership and references.
 * @param request - workspace, expected revision and proposed records.
 * @returns the committed aggregate, with deleted-asset task references removed.
 */
@Remote async save(request: SecuritySaveRequest): Promise<SecurityRecords>
```

Source: [`packages/client/ui-security/src/index.ts`](../../packages/client/ui-security/src/index.ts)

<a id="ctxsecuritysetup--securitysetupservice"></a>

### `ctx.securitySetup` — `SecuritySetupService`

Persist validated answers separately and save only completed, revision-checked task updates.

```ts cordis-catalog
/** Check whether a task-owned Session uses conversational setup.
 * @param sessionId Session identity.
 * @returns Whether durable setup is active.
 */
isActiveSession(sessionId: SessionId): boolean

/** Read derived checklist and the latest completed proposal without inference.
 * @param request Task identity.
 * @returns Current setup state.
 */
@Remote({ resources: { workspace: resource } }) async read(request: SecurityConversationRequest): Promise<SecuritySetupState>

/** Begin the task's first setup question exactly once.
 * @param request Task identity, locale and stable admission identity.
 * @returns Setup state after durable inbox admission.
 */
@Remote({ resources: { workspace: resource } }) async begin(request: SecuritySetupBeginRequest): Promise<SecuritySetupState>

/** Retry a saved answer without overwriting intervening edits.
 * @param request Proposal and stable retry identity.
 * @returns Updated checklist and proposal state.
 */
@Remote({ resources: { workspace: resource } }) confirm(request: SecuritySetupConfirmRequest): Promise<SecuritySetupState>
```

Types: [SessionId](core.md)

Source: [`packages/client/ui-security/src/security-setup.ts`](../../packages/client/ui-security/src/security-setup.ts)

<a id="ctxsecuritysupplychain--securitysupplychainservice"></a>

### `ctx.securitySupplyChain` — `SecuritySupplyChainService`

No model calls, arbitrary executable, client directory, or package installation.

```ts cordis-catalog
/** Start a fixed check once; concurrent clicks reopen the existing owned run.
 * @param request Registered Workspace and stable click identity.
 * @returns Ordinary conversation and saved scanner state.
 */
@Remote({ resources: { workspace: resource } }) async start(request: SupplyChainStartRequest): Promise<SupplyChainRun>

/** Read saved facts without executing inference or another scan.
 * @param request Registered Workspace and optional prior run.
 * @returns Saved result or an explicit absence.
 */
@Remote({ resources: { workspace: resource } }) read(request: SupplyChainReadRequest): SupplyChainReadResult

/** Cancel only the exact owned check; no arbitrary job identity is accepted.
 * @param request Original Workspace and run.
 * @returns Terminal saved state after cancellation settles.
 */
@Remote({ resources: { workspace: resource } }) async cancel(request: SupplyChainCancelRequest): Promise<SupplyChainRun>

/** List saved checks without starting a model or another scan.
 * @param request Registered owner Workspace.
 * @returns Newest saved results first.
 */
@Remote({ resources: { workspace: resource } }) list(request: SupplyChainListRequest): SupplyChainListResult

/** Hide one finished check from list, read and repair; the Session log keeps every earlier snapshot as evidence.
 * Project manifests, lockfiles and repair recovery files are never touched.
 * @param request Original Workspace and run.
 * @returns Deletion time. Repeating the request returns the original time only after the Session log flush succeeds again;
 *   a rejected flush leaves the outcome unknown, so retry until it resolves.
 */
@Remote({ resources: { workspace: resource } }) async deleteRun(request: SupplyChainRemoveRequest): Promise<SupplyChainRemoveResult>

/** Repair exact saved package groups with fixed package-manager commands.
 * @param request Saved check and optional package names; versions and commands are never accepted.
 * @returns Durable repair progress on the original run.
 */
@Remote({ resources: { workspace: resource } }) async repair(request: SupplyChainRepairRequest): Promise<SupplyChainRun>
```

Source: [`packages/client/ui-security/src/security-supply-chain.ts`](../../packages/client/ui-security/src/security-supply-chain.ts)

<a id="ctxsecurityworkers--securityworkersservice"></a>

### `ctx.securityWorkers` — `SecurityWorkersService`

Persist approved input before accessing the target and never resume interrupted requests.

```ts cordis-catalog
/** Read persisted Worker history without starting work.
 * @param request Owner task identity.
 * @returns Durable observations without starting work.
 */
@Remote({ resources: { workspace: workspaceResource } }) read(request: SecurityConversationRequest): SecurityWorkerState

/** Set or clear one task's Host-memory-only login credentials.
 * @param request Owner-selected origin and credentials; omission clears them.
 * @returns Credential presence without returning any submitted values.
 */
@Remote({ resources: { workspace: workspaceResource } }) setBrowserCredentials(request: SecurityBrowserCredentialsRequest): { configured: boolean }

/** Admit a Worker for the selected saved plan item.
 * @param request Owner-approved exact URL and captured current revision.
 * @returns Persisted admission history.
 */
@Remote({ resources: { workspace: workspaceResource } }) start(request: SecurityWorkerStartRequest): Promise<SecurityWorkerState>

/** Start only against an authoritative execution-owned quota reservation.
 * @param request Exact saved grant and parent execution identity.
 * @returns Durable Worker admission history.
 */
startReserved(request: SecurityWorkerStartRequest & { executionRunId: string }): Promise<SecurityWorkerState>

/** Cancel the selected Worker and its active conversations.
 * @param request Owner task identity.
 * @returns History after cancellation settles.
 */
@Remote({ resources: { workspace: workspaceResource } }) async cancel(request: SecurityConversationRequest & { runId?: string }): Promise<SecurityWorkerState>

/** Wait until the selected investigation and its owned handle disposal settle.
 * @param request Owner task and exact Worker run.
 * @returns Nothing after cleanup, without starting or resuming work.
 */
async waitForSettled(request: SecurityConversationRequest & { runId: string }): Promise<void>

/** Decide one exact pending operation; the decision does not grant future permissions.
 * @param request Owner task, run and pending approval identity.
 * @returns Current durable Worker history.
 */
@Remote({ resources: { workspace: workspaceResource } }) async approveTool( request: SecurityConversationRequest & { runId: string; approvalId: string; allow: boolean }, ): Promise<SecurityWorkerState>

/** Submit an owner message to an existing Worker conversation.
 * @param request Owner message and stable delivery identifier.
 * @returns Durable acceptance; replies arrive through read.
 */
@Remote({ resources: { workspace: workspaceResource } }) async send(request: SecurityWorkerSendRequest): Promise<SecurityWorkerState>
```

Source: [`packages/client/ui-security/src/security-workers.ts`](../../packages/client/ui-security/src/security-workers.ts)

<a id="security-records-events"></a>

### `security-records/*` events

<a id="security-recordschanged--emit"></a>

#### `security-records/changed` — emit

Durable security records changed.

```ts cordis-catalog
/** Durable security records changed.
 * @mode emit
 * @param records Committed Workspace records.
 */
'security-records/changed'(records: SecurityRecords): void
```

Source: [`packages/client/ui-security/src/index.ts`](../../packages/client/ui-security/src/index.ts)
<!-- END GENERATED cordis-surface -->
