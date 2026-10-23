# Security execution specification

English | [中文](security-execution-spec.zh.md)

> 10-second summary: The dedicated security service shares saved tasks, task Sessions, Planner proposals and bounded Worker execution. Owners start investigation from registered assets and scope rules without entering URLs. Planner selects supported anonymous GET operations, reviews Worker evidence and decides whether to continue, finish or request input. Existing task records and exact-target execution history remain readable.

## Scope and approval

The user approved architecture B and a conversation-first delivery order. A registered Workspace owner opens a saved task, selects Sessions, sends a message, and receives a Main Agent response. The conversation reads the saved task description, objectives, assets and rules, records the exact model-visible context, and remains available after restart. Unsaved or failed task edits must settle before sending. Empty input, duplicate submissions, unavailable authentication, provider errors and cancellation have visible outcomes; failed turns do not become successful messages.

The first route uses the existing Claude subscription with native tools disabled. It does not introduce API credentials or change normal-chat permissions. Codex remains unavailable for this conversation-only capability until its adapter can enforce the same restriction. Model-facing instructions alone do not enforce tool restrictions. Task conversation sessions are owned separately from ordinary main-chat sessions and from task draft aggregates; callers cannot select another task's session identifier.

## Planner and investigation queue

The owner explicitly asks the Main Agent to start Planner in task Sessions. A completed structured response may request Planner together with a settings proposal. The Host saves the validated proposal first, suppresses the next setup question and starts planning against the saved revision. The Host requires five completed setup checks, settled automatic saving and an unchanged task revision. Session, turn and step identify an idempotent request; visible handoff failures support retry. Settings changes must finish saving before Planner admission. The client flushes task edits before admission. A dedicated planning service captures the saved task configuration, selected assets, record revision and quoted Main Agent conversation in an immutable input snapshot. It owns planning Sessions and plan records separately from task draft aggregates and ordinary conversation Sessions. Planning does not grant approval to execute a diagnostic operation.

A Planner runs through the existing Claude conversation-only route with native tools disabled. The complete prompt is recorded in its Session. Only an explicitly completed turn may supply the final plan; malformed JSON, unsupported fields, unknown asset references and failed or partial responses do not become queue items. The Host supplies item identifiers and pending status. Items describe their target, purpose and proposed approach; planning does not dispatch Workers automatically.

The service admits at most one active plan generation per task and uses a stable request identity for retries. It durably records generation, completion, cancellation, failure and restart interruption. A cancelled or interrupted plan cannot later become ready from a late model response. Restart retains completed plans and pending items without resuming an unfinished model request automatically. Workspace ownership and task identity are checked for reading, generation and cancellation; deletion or archival cancels active generation.

Sessions exposes Planner results and the task overview shows the same saved plan. The UI distinguishes planning in progress, ready but unexecuted, failed, cancelled, interrupted and empty results. Editing a task does not mutate a stored snapshot; the UI identifies a plan whose task or selected-asset configuration is outdated. Unrelated Workspace edits alone do not make a plan stale. The Planner panel derives operational history from recorded attempt states, timestamps, snapshots and pending items. It does not expose private reasoning or invent Worker assignments or results. Refresh reloads saved state, and cancellation stops active planning. There is no separate plan-creation button; checklist completion alone never starts planning.

## Task setup conversation proposal

The user approved this guided setup slice. Creation requires a task name and at least one registered asset, then opens Sessions with the Main Agent selected. The create action states that the selected task context is sent to the existing Claude subscription to begin setup. Saving the task precedes inference; failure preserves the draft and exposes an idempotent retry. Opening an older task never starts inference automatically.

The Main Agent asks one missing question at a time: goal and completion criteria, exact target scope, the owner's diagnostic permission, allowed/prohibited operations and exclusions, and execution limits/stop conditions. It uses current saved values and accepted answers instead of repeating answered questions. Ambiguous discussion remains discussion. A complete, validated change from a clear owner answer is saved automatically and continues to the next question, without a separate acceptance button. The UI can edit the same authoritative task fields directly.

Use a dedicated security setup service and an internal structured conversation engine. Reuse the current Claude tool-free route, collect its complete response, validate a strict reply/proposal object and publish only the validated human-readable reply into the conversation. Record the exact raw response and accepted input durably without displaying control JSON as chat text. The engine integration must not weaken native tool restrictions or add target access. Ordinary chat, Planner generation and Worker execution retain their separate responsibilities.

Setup supplies the same JSON Schema already logged in its task-context notice through `EngineRunRequest.responseSchema` on every attempt. Claude conversation-only uses SDK `outputFormat:json_schema` and accepts only schema-validated `structured_output`; success without that field, invalid output and SDK structured-output errors fail without prose fallback or proposal persistence. Only the exact internal `StructuredOutput` carrier may appear when a schema is requested; its permission input must validate against that schema, while native tools, agents, skills, plugins and MCP remain disabled. Other engines keep their existing text output and strict setup parsing. Main-chat and host-tools routes are unchanged and cannot opt into this schema path.

Setup metadata is optional on saved tasks so older tasks and immutable planning snapshots still load. The Host derives five checklist states from accepted setup information and the current task, rather than trusting model-supplied checkmarks. Scope and permission confirmations are bound to the selected assets; material configuration changes invalidate affected confirmations. A complete checklist means ready to hand off for planning, not permission to run diagnostic operations. The owner explicitly requests Planner through the Main Agent; Worker execution is excluded.

Only a registered Workspace owner may begin, read or confirm setup. The model cannot select arbitrary task identities, revisions, timestamps, approval status or running state. Proposal acceptance uses the current expected record revision; conflicting direct edits block application and preserve both the saved settings and the visible proposal for review. Partial, failed, cancelled or interrupted inference cannot apply a proposal. Automatic application waits for durable turn completion and idle state; conflicts and save failures stop progression and expose a retry. Duplicate begin/confirm requests do not create duplicate turns or writes. Restart preserves accepted answers and unfinished checklist items without silently resuming inference.

Illustrative begin request and response:

```json
{"workspaceId":"workspace-id","taskId":"task-id","requestId":"stable-request-id","locale":"ja"}
```

```json
{"sessionId":"security-session-id","accepted":true}
```

## Bounded execution

The flow is asset registration, task draft, structured plan preview, explicit owner approval, one bounded request, and task-detail result display. The first operation is one anonymous GET; HEAD can be considered only when the executor explicitly supports and validates that method. Arbitrary shell, attack payloads, multi-Worker coordination, authentication, and new API-key integration are excluded.

## Runtime ownership

The `securityWorkers` service owns a separate storage domain and run records. It must not store live execution state inside `securityRecords` draft aggregates. An immutable run captures the task configuration revision, scope, compiled operation, limits, and owner-approved plan. Only the authenticated owner of a registered Workspace may create, approve, start, inspect, or stop its runs; one task has at most one active run.

Run records capture the approved operation, start, stop, completion, failure and interruption durably. Restart marks unfinished runs interrupted rather than resuming requests automatically. A late request result must not overwrite a stopped or interrupted terminal state. Stop aborts both request and body reading, with conditional terminal writes preventing completion races.

## Scope and transport

Compile domain, IP, CIDR, and URL scope rules into explicit permitted operations, with deny rules taking priority. The request hostname and every candidate resolved address must pass the approved scope and public-address policy. Free-form constraints are not mechanically enforced text: unsupported or ambiguous rules block execution and ask for a structured, manually approved plan instead. Editing a draft cannot mutate a running plan.

Reuse public-address validation and pinned DNS connections from `packages/web/web-fetch-http/src/network.ts`; do not replace those checks with a URL-only check. The provider must reject proxy-routed requests internally, since its existing proxy route delegates DNS to a proxy and cannot prove the pinned-address policy. Configure zero followed redirects, bounded request/response bytes, and an explicit finite timeout. Send no cookies, Authorization headers, browser session, or model credentials. DNS rebinding, non-public addresses, unsupported schemes, and unresolved policy decisions fail closed.

## AI planning boundary

Current native adapters in `packages/core/subscription-engines/src/codex.ts` and `claude.ts` own their engine tools and permissions. They are not proven constrained diagnostic executors. Before connecting either adapter, demonstrate through current official contracts and existing code that planning has native tools disabled or can operate only through a Host broker that enforces the approved plan. Reject an unproven route. A safe manually approved structured plan can exercise the executor without claiming that Planner/Worker autonomy is already implemented.

The parent review checked the official [Codex App Server contract](https://learn.chatgpt.com/docs/app-server), whose dynamic tools are experimental and require experimental API opt-in, and [Claude SDK permissions](https://code.claude.com/docs/en/agent-sdk/permissions), where auto-approved tools can skip `canUseTool` and require a `PreToolUse` interception boundary. Existing native prompt assembly does not forward the full system instruction as an enforcement mechanism. These facts require adapter-specific proof; they do not establish that the proposed planning boundary works.

## UI and acceptance

Task details distinguish saved configuration, immutable approved plan, actual run state, and observed evidence. Show only events and results the executor records; do not promote sample findings into real vulnerabilities or call registered scope an enforced control before compilation succeeds.

Acceptance covers scope denial, pinned-address checking, proxy rejection, zero redirects, byte/deadline bounds, owner isolation, single-active-run admission, stop races, and restart interruption. Focused policy and lifecycle tests and deterministic composed-UI execution have passed. Live Worker model responses and remote-principal isolation remain unverified. See the [implementation plan](security-execution-implementation-plan.md).

## Main Agent model selection

The owner selects an engine and an advertised model in the Main Agent header. The task conversation mapping stores the selection with backwards-compatible Claude/default values. Selection changes require an idle Session, preserve the transcript and draft, and apply to the next turn, including guided setup. Host validation rejects unsupported engines and unknown models; changing models never expands execution permissions. Catalog failures are visible and do not silently change the selection. Planner and Worker selection follow the role model policy below.

## Worker execution and role models

Overview and conversational preferences share `task.agentModels`; `task.agentModelModes` makes Planner and Worker automatic unless explicitly fixed. In automatic mode the Main Agent chooses a Planner model and Planner chooses a Worker model for each item, with actual advertised IDs and concise reasons validated by the Host. Fixed owner preferences override automatic decisions. A missing mode preserves explicit legacy models as fixed and treats missing/default models as automatic. Each new invocation captures its resolved model and reason; later edits leave running agents unchanged. Older plans lacking item decisions remain readable but require replanning before automatic Worker execution. Main Agent header selection retains its existing task-local behavior.

`securityWorkers.start` accepts an explicit owner-approved operation: `{workspaceId,taskId,planId,itemId,assetId,url,requestId,expectedRevision}`. The Host validates the current saved configuration against the ready plan, setup readiness, registered target, deny-first scope and exact GET operation before any target request. Unsupported free-form constraints reject. `read` only projects durable runs; `cancel` stops the active attempt. A separate storage domain retains immutable input, selected model, timestamps, observed HTTP evidence and model summary. Duplicate requests return the admitted run; cancellation and restart cannot become late success. Native tools are disabled throughout model interpretation; response bodies are quoted untrusted data, never instructions.

The first Worker follows no redirects, sends no credentials, rejects proxy routes and non-public addresses, pins the validated DNS answers and applies configured request, response-byte and model deadlines. Its output describes observations, not confirmed vulnerabilities. Other operations, concurrent Workers remain unavailable. Explicitly started execution can dispatch approved structured GET operations and return observations to Planner.

## Planner and Worker execution loop

The owner starts a task-owned execution from a ready plan and current saved revision without entering URLs. The execution service captures `targetMode: asset-scope`, selected registered assets, task scope rules and finite round, request and total-time limits before dispatch. Planner chooses HTTP(S) paths and allowed descendants of registered root domains, emits supported structured anonymous GET operations, receives authoritative terminal Worker observations, and chooses continue, complete or needs-input. Host policy validates every operation against the captured asset scope and deny-first rules; Worker rechecks every DNS candidate before a pinned connection. Unsupported investigations require owner input rather than becoming completed findings. Legacy executions without this mode retain exact approved asset/URL restrictions and are never silently widened or resumed.

Each round stores the instruction plan, Worker run IDs and Planner decision. Requests run sequentially through the existing policy-checked Worker executor; repeated operations do not silently generate an endless investigation. Stop cancels active work and awaits settlement. Restart marks unfinished execution interrupted without resuming network traffic. Changed task settings stop dependent dispatch. Completion means the approved bounded observation workflow ended; it does not certify the asset free of vulnerabilities or produce a penetration-test report.

## Main Agent delegation and Session navigation

A current owner request to run or delegate investigation produces a structured `start-investigation` action, distinct from planning-only `start-planner`. Completed output and current readiness precede admission; a same-turn patch is saved first. Automatic Planner selection supplies a real advertised model and reason. The execution coordinator owns initial planning, child cancellation and subsequent review, so missing model metadata in a legacy plan cannot trigger an unselected default or uncontrolled dispatch. Stable action identity deduplicates completion delivery.

The Sessions sidebar lists actual Workers individually beneath their heading. Selection remains attached to the same run while progress updates or new Workers appear. Planner activity uses chronological round separators and expandable instruction/report rows, with stop and failure feedback. Headings remain fixed while sidebar and activity content scroll independently.

## DeepSeek role models

Main Agent, Planner and Worker select models advertised by the existing DeepSeek account and API providers. Routes keep separate authentication and catalogs; unavailable choices fail without switching provider or model. The tool-free adapter uses logged discussion input and preserves cancellation and task isolation. Switching providers keeps the visible transcript; sharing prior discussion requires explicit consent for that Session and destination. Existing Claude/Codex selections remain readable. Choices apply to future invocations, including automatic role decisions; HTTP scope enforcement stays independent of the model.

## Worker conversation and execution log

Selecting an actual Worker opens its chronological conversation: captured Planner instruction, public HTTP request outcome, Worker report, correlated Planner review and owner follow-ups. A ready saved plan contributes its actual review summary only when its Worker run references include that run; stable plan-derived entry identities prevent duplicates. Request details and saved evidence expand in place; private model reasoning and invented tool activity are excluded. Running and completed Workers use the same view, with a fixed title/composer and independently scrolling transcript. Saved history survives reopening and restart.

A follow-up belongs to the exact task and Worker run. It requests tool-free analysis of captured task context and existing evidence using the captured model; it does not issue another HTTP request, restart investigation or execute commands in text. Ownership and task availability are checked and stable request identities deduplicate retries. One owner instruction may queue while the initial Worker runs; its analysis starts after the initial operation settles. An active or queued follow-up blocks another submission. Conversation state is separate from the original execution result. Cancellation and restart retain history without turning unfinished replies into successful reports. Planner remains responsible for new investigation operations.

## Recorded activity views

Timeline and exploration share a task-owned projection of plans, Workers and executions with stable entity identities. Timeline exposes persisted times, source, status, related records and recorded payload. Search, category filters and sorting never modify storage. Automatic refresh pauses on request; overlapping or stale-task reads cannot replace active task data. Exploration distinguishes target-scope context from recorded derivation. Missing observations and interrupted attempts remain visible without fabricated findings or goal achievement. No view starts inference or target traffic.

## Findings and retest workflow

Workers register structured evidence-supported findings separately from narrative summaries; suspicions and generic observations do not become confirmed vulnerabilities. Each finding belongs to a workspace and task, references its source Worker and asset, and preserves the original HTTP evidence. Severity and owner triage are separate from retest execution and verdict. Existing Worker histories remain readable without inventing findings.

The owner selects a finding, optionally supplies fix-version or test-condition notes, and starts a targeted retest. The service captures the original finding and current task restrictions, records admission before execution, and uses the same public DNS-pinned anonymous GET policy and finite limits as Workers. Retests have independent sessions, fresh evidence and immutable terminal history; duplicate starts reuse an active attempt. Verdicts are reproduced, fixed and inconclusive. Unreachable targets, unsupported operations, incomplete evidence or missing comparable conditions cannot imply fixed. Only completed fixed results automatically update triage; original evidence remains unchanged. Cancellation, restart and task removal stop work without automatic resumption.

Both tabs show real saved data, retain selected identity while refreshing, disclose load and action failures, and preserve long evidence within scrolling details. Retest history exposes execution status, verdict, notes, timestamps and evidence; the task title and tabs stay outside the scrolling content.

## Captured response storage and report

New operations retain a finite response file independently of the finite text supplied to the model. Model-visible excerpts identify byte windows and remain logged in the Session. Capture truncation produces partial acquisition, not a size-limit failure; network, storage, policy and deadline failures remain failures. Legacy inline evidence remains readable. Full acquisition does not imply full model analysis, and neither incomplete acquisition nor incomplete analysis can close a retest as fixed.

Planner review receives authoritative operation coverage. A proposed completion with failed, partially checked, unexecuted or unsupported work becomes needs-input rather than an unchecked claim of goal completion. The Report tab reads the latest execution snapshot and saved evidence, findings and retests without a new model or HTTP request, preserves gaps and provides matching Markdown. Its counts describe planned operations rather than unique HTTP requests. Zero findings is distinct from complete testing and never certifies asset-wide safety.

## Planner and Worker token headers

Saved-task Sessions show input, cache-read and output token counts at the right of the Planner and Worker headers. Planner totals include each distinct saved Planner Session for the task. A Worker shows only its own Session, including owner follow-up replies. Tooltip details retain cache-write counts and exact values. Compact counts do not imply a monetary charge.

The client reads existing provider-reported Session usage without starting an Agent, sending model input or contacting diagnostic targets. Native cumulative snapshots replace earlier snapshots rather than adding them again; API-model totals use the existing token projection. Missing measurements appear as an em dash, reported zero remains zero, and missing sessions cannot silently become a complete aggregate. Refresh and task/Worker switching preserve source identity and discard stale reads. No new metering store or persistence schema is introduced.

## Asset coverage

Coverage shows saved company, domain, subdomain, IP, service, application and endpoint relationships. Eligible registered task assets form the denominator; an actual matching task-owned HTTP observation marks an asset observed once, including partial observations or subsequent model failure. Planning alone does not mark an asset observed. Company and context connector nodes are excluded. Deny rules take precedence, unresolved scope is disclosed, and zero or uncertain denominators have no percentage. Observation reach never establishes diagnostic completion. No DNS lookup, asset registration, model invocation or target access occurs while viewing this tab.

The graph supports search, kind and observation filters, grouped folding with incremental expansion, node dragging, two-finger panning, pointer-anchored pinch zoom and fit controls. The detail panel retains a fixed header and scrolling saved references, bounded evidence previews and links to the corresponding Worker conversation. Refresh preserves identities and discards stale responses; failures retain existing data with an explicit retry state.

## Planner response recovery and explicit continuation

The Planner uses one output contract per mode. A completed response that fails JSON syntax or structural validation receives a bounded correction request in the same tool-free Session; each correction and answer remains logged. The configured total response attempts defaults to two and cannot exceed three. Asset, model and operation-policy rejection, storage failure, cancellation and elapsed timeout are not format-retry conditions. The original planning timeout bounds all correction attempts together. Invalid outputs never become executable items through substring extraction or JSON concatenation.

The Main Agent header offers explicit continuation of the latest failed, cancelled or interrupted investigation. Continuation uses a new request and execution identity, retains the source execution unchanged and records its source identity. Task revision, operational settings, registered assets and target authorization must still match. Existing completed and failed Worker results are reviewed without another target request; interrupted or cancelled work remains unverified and may be dispatched again. Request and successful-review round budgets carry forward; an explicitly resumed attempt receives a new elapsed-time window. Restart never automatically resumes work. A rejected or unconfirmed continuation stays visible with a retry path and stable request identity. Reports retain the referenced observations and distinguish completion from unresolved work.

Worker result formatting follows the same bounded rule after one HTTP acquisition. A malformed JSON report can request another response using the retained evidence in the same Session, without repeating the target request. `workerResponseAttempts` defaults to two and is capped at three; the existing model deadline covers all responses. Evidence-quotation rejection is not a formatting retry. Legacy Worker snapshots remain readable, and old failed histories are not rewritten as completed.

## Local vulnerability verification

An owner-authorized synthetic local application is investigated through the real task UI, Planner, Worker HTTP transport and finding import. Local HTTP requires an explicit exact-origin host configuration; normal deployments remain public-only. Local mode permits only canonical IPv4 loopback with a configured port, retains registered service/endpoint and deny-first scope checks, and cannot expand from model instructions. Findings must originate from actual anonymous HTTP evidence and quoted content; fixture facts or expected findings are never inserted into task storage. The application uses synthetic records exclusively and binds no external interface.


## Executive report presentation

> Saved task reports present eight sequential executive sections using existing UI primitives and theme tokens. This is a read-only presentation change; no persistence, model request or execution behavior changes.

The report flows vertically through executive summary, risk overview, top five findings, recorded business impact, evidence-backed risk scenarios, suggested remediation priorities, scope and limitations, and conclusion. Cards may share a row within a section; the eight sections never form separate newspaper columns. Tables scroll locally on narrow viewports. The existing complete Markdown export and expandable technical evidence remain accessible.

A pure projection derives active severity counts, affected registered assets, exact saved-title groups and remediation priorities from the canonical report. False positives and duplicates are excluded from reported findings; fixed items remain in history but not active risk; accepted risks remain active. Aggregate risk means the highest active saved severity, not an independent audit rating. No active findings is not a safety verdict. Findings span task history while operation coverage uses the latest execution snapshot; both scopes are labeled.

Impact and scenarios reuse saved finding summaries and quoted evidence, marked as recorded AI assessment rather than confirmed business losses. Response priorities derive from severity; deadlines, business loss, comparison with a previous test, organization details and unavailable categories are not invented. No new AI generation occurs on report reads. Empty, unstarted, in-progress and incomplete investigations retain visible coverage qualifications.
