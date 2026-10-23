# ADR 0007: A dedicated security service

English | [中文](0007-security-execution.zh.md)

## Status and decision

Accepted by the user. B provides a dedicated security service shared by the task UI and later by main-chat tools. The first milestone is task-scoped Main Agent conversation with durable history; Planner, Worker orchestration and approved target execution follow. See the [specification](../specs/security-execution/security-execution-spec.md).

## Alternatives

A directly connects existing native chat to diagnostic targets. Its native tools do not establish task scope enforcement, so prompt instructions alone cannot support the boundary. B reuses Host storage, Remote identity, and public pinned-DNS transport while owning diagnostic plans and runs separately. C redesigns the entire agent/runtime infrastructure; it repeats established services and exceeds the initial one-request milestone.

The planning milestone accepts an explicit request through the Main Agent and creates an immutable plan from saved task configuration and conversation. The Host requires all five setup checks, settled automatic saving and an unchanged task revision; completed-turn identity deduplicates handoff. Planner shows recorded attempt history and pending items without private reasoning or fabricated Worker instructions. A separate planning service owns its durable queue and runs a tool-free Planner Session. A keeps generation inside the chat service and couples independent lifecycles; B gives planning its own service object and reuses the established storage and Agent interfaces; C rewrites the whole runtime before planning and duplicates proven mechanisms. B remains the accepted choice. No native-tool bridge or diagnostic execution is added by this milestone.

## Guided setup decision

A adds a second extraction model call after every natural-language reply. It keeps the visible chat unchanged but doubles inference and separates reply success from configuration success. B gives task setup a dedicated owner and a narrow structured conversation engine, reusing the existing tool-free Claude adapter and Session projection; validated replies remain readable and proposals use the task store's revision checks. C replaces the Main Agent with a tool-using runtime and task-update tools; the native subscription loop needs a new tool bridge and permission design, exceeding guided setup. The user approved B for this slice. Revisit B if the adapter requires generic loop special cases, if safe structured output cannot be logged, or if conversations and setup acquire conflicting task stores.

The user subsequently requested automatic saving of clear setup answers. Completed validated proposals now reuse the same revision-checked application journal without a per-proposal acceptance step. Failed saves and conflicts stop progression rather than overwriting direct edits. This changes task configuration only, not diagnostic execution approval.

## Main Agent model selection

The user approved B: keep task conversation ownership and add a validated, durable engine/model selection. A only adds a Claude selector and leaves routing fixed; C replaces the subscription adapters and duplicates their authentication and Session ownership. B separates selection from execution permissions and preserves the task transcript. The model catalog comes from each native adapter, not a hardcoded product list. A provider is selectable only when its conversation-only restrictions are enforced; an unsupported provider stays visibly unavailable. Revisit this design if switching requires weakening those restrictions or moving task state into native threads.

## Consequences

The first conversation route uses Claude with native tools disabled, without altering ordinary chat permissions or introducing API keys. Codex is unavailable for this route until equivalent restrictions are enforced. Existing Session storage and native subscription adapters are reused; security business logic has its own owner.

The later initial executor permits one bounded public anonymous GET, no redirects, and no arbitrary shell or attack operation. Deny rules take priority; uncompiled constraints and unproven native planning routes prevent execution. A stopped run cannot become successful from a late response, and unfinished runs become interrupted on restart. Native Codex/Claude planning requires independent proof of tool disablement or Host-broker-only execution before connection.

## Reconsideration

Revisit the separation if security logic starts branching inside generic Session or API controllers, if screens and chat acquire separate state or command implementations, or if native tooling cannot enforce task-specific execution policy. Such a route stays disconnected until enforcement is available.

## One Worker and role models

The approved B architecture owns Worker runs in a dedicated service, separate from immutable Planner proposals and editable task records. The first Worker accepts an explicitly selected plan item, registered asset and exact anonymous GET URL. A directly exposes native shell tools and cannot enforce task scope; C replaces the existing transport and Agent lifecycle without a new enforcement benefit. B reuses public-address resolution and pinned connections, rejects proxy routing, and records evidence before a tool-free model summarizes it. Unsupported natural-language constraints block admission. Future attack tools and concurrent Workers require their own compiled operations.

Task Overview stores independent Main Agent, Planner and Worker model choices in the task record. The Main Agent header edits the same choice. Legacy Main Agent mappings remain readable when no task override exists; Planner and Worker follow the automatic/fixed policy below. Each new Planner or Worker captures its selected route; changing settings never retargets a running invocation. A provider without enforced tool-free execution remains unavailable.

## Automatic role model selection

The owner approved automatic Planner and Worker selection through the existing role services rather than replacing the runtime. Main Agent chooses Planner and Planner chooses each item's Worker from the actual safe catalog, recording concise operational reasons instead of private reasoning. Fixed owner preferences override automatic choices and apply only to new invocations. This separates model delegation from execution policy: model choice cannot widen allowed targets or tools. Explicit legacy models remain fixed; absent/default selections become automatic. Older plans without model decisions require replanning for automatic Worker execution.

## Planner feedback coordination

The selected B design adds a task-owned execution coordinator beside the existing Planner and Worker services. Direct orchestration inside the UI (A) would lose ownership and cancellation on navigation; replacing the existing execution services (C) would discard tested scope and persistence behavior without adding a needed capability. The coordinator retains explicit approved targets, finite limits and child identities while reusing the executors. Revisit this boundary if concurrent Workers or new tool capabilities cannot be admitted and cancelled independently without duplicating policy.

## Asset-scoped investigation

The owner authorizes investigation within saved task assets and scope rules instead of supplying individual URLs. The coordinator captures this scope for new runs; Planner chooses paths and permitted descendants of registered root domains, and Worker policy validates each operation and resolved address. This reuses existing admission, pinned transport and lifecycle ownership without granting native tools. Legacy exact-target runs retain their restrictions and restart never resumes network requests.

## DeepSeek conversation adapters

The approved B design reuses configured DeepSeek account/API catalogs through lookup-only tool-free engines shared by all roles. Adding provider branches to each role (A) would duplicate routing and validation; replacing the existing engine and execution services (C) would discard tested ownership without adding capability. Task-local optional consent preserves prior records and scopes historical discussion sharing to one Session and destination. Revisit the adapter if new providers require capabilities beyond text conversation or cannot preserve cancellation and model-owned catalogs.

## Worker conversation ownership

The owner approved B: extend the existing Worker service with durable, run-scoped conversation while reusing model and execution boundaries. A display-only transcript cannot accept owner follow-ups with durable lifecycle ownership. C rebuilding execution would replace tested scope and cancellation without adding the requested conversation capability. The ARTEX-style view records public instructions, execution outcomes and replies, excluding private reasoning.

Follow-ups analyze captured evidence without new network access, separating conversation from Planner-authorized operations. Reconsider this boundary if ongoing Worker tool use or parallel turns require independent operation admission and cancellation; the composer alone grants neither capability.

## Activity projection decision

The user approved connecting timeline before exploration to existing durable records. B shares a deterministic client projection and existing owner-scoped read APIs. A maintains independent reductions in both views, risking inconsistent links. C adds a second event store or replaces the coordinator and duplicates available history. Revisit B when atomic cross-service snapshots or history pagination need a dedicated read service. Graph edges use explicit saved references, not inferred causality.

## Findings and targeted retests

The owner approved B: give findings, triage and retest history a dedicated durable service, and share the existing bounded HTTP transport and task policy with Workers. A adding triage to Worker history mixes mutable owner decisions with execution evidence. C replacing the execution runtime adds unrelated lifecycle risk. A finding retains its original source and evidence; a retest captures its own input, model, session and fresh observation. Successful completion with an evidence-supported fixed verdict is the only automatic transition to fixed. Failures and incomplete evidence cannot close a finding. Revisit the shared operation interface before adding authenticated or non-GET validation; do not widen current transport implicitly.

## Response storage and reporting

The owner approved separating captured HTTP bytes from model input and adding a report from saved records. A increasing the model prompt limit alone retains the same coupling between storage and inference. B keeps bounded task-owned response files, bounded model excerpts and explicit acquisition/analysis gaps, while reusing current execution ownership. C replacing the coordinator and storage runtime adds unrelated lifecycle changes. B keeps partial capture distinct from execution failure and prevents a model completion claim from hiding incomplete checks. Reports derive from saved records without another inference request; zero findings is not an asset-wide safety conclusion.

## Header token presentation

The owner approved B: reuse existing Session usage projections and one shared header presentation for Planner and Worker. A duplicates reading and counting in each header. C introduces a separate meter and durable totals that could diverge from Session history. B keeps provider measurements authoritative and requires no execution or persistence changes. Revisit the read path if visible active Sessions cannot publish current usage without opening an inference turn; token display must never start investigation.

## Asset coverage projection

The owner requested ARTEX-equivalent asset coverage. The existing approved read-only projection approach remains B: derive asset relationships and observation counts from saved records and reuse existing read services. A extending the sample graph with independent counters duplicates source ownership; C introducing another coverage store and execution runtime duplicates available evidence. B adds no persistence or execution authority. Registered scope determines the denominator, actual HTTP evidence determines reach, and unknown scope cannot imply complete coverage. Stable SVG relationships provide drag, pan, zoom and folding without another graph dependency. Revisit server-side projection when asset discovery or record volume requires authoritative pagination.

## Investigation recovery

Investigation stabilization keeps the existing Planner, Worker and coordinator responsibilities. Strict model-boundary validation remains authoritative; a bounded same-Session format correction addresses recoverable response errors without repairing invalid JSON locally or retrying rejected policy. Explicit continuation creates a linked execution rather than mutating old history or silently restarting after boot. Existing terminal observations and consumed request/round budgets remain owned by that execution chain. Task revision changes require a fresh investigation. This targeted correction does not introduce another runtime or store. Revisit orchestration only if persisted child admission can no longer reconstruct the pending work without guessing execution outcomes.

## Local verification origin

The owner requested an actual local vulnerable application test. The existing shared request-policy owner admits explicit exact IPv4 loopback HTTP origins, defaulting to none. This keeps one task/asset/scope validation path and the same captured evidence for model-driven finding import. A test-only bypass would not verify real admission; a new network runtime would duplicate existing pinning and capture ownership. Exact configured origins keep local verification bounded without changing public-network resolution or enabling LAN discovery. Revisit the policy representation before supporting general private networks, hostname-based local targets or authenticated requests.


## Executive report presentation ownership

The approved B design separates a pure executive projection and themed section renderer from the existing authoritative report and export. Styling the Markdown DOM (A) would not express count/status distinctions and compact summaries consistently; replacing report generation/storage (C) would duplicate evidence and execution ownership for a presentation request. The projection never requests models or changes durable records. Revisit generation ownership only if separately authored, reviewable business assessments require their own persisted lifecycle.

## Native structured setup output

The owner approved B for repeated malformed setup responses: carry the existing logged JSON Schema through the execution request and Claude SDK's native output-format option, then retain the existing strict proposal parser. A would continue prompt-only correction and cannot enforce the native result format; C replaces the conversation runtime and its proven ownership and persistence. B adds no target access or general tool capability.

SDK success does not prove structured output is present; missing or invalid output fails. The exact internal `StructuredOutput` name is admitted only for an explicitly requested schema, with input validation in both permission paths. Real tools remain rejected. Schemas on native main-chat or host-tools routes fail explicitly; other engines retain their current textual validation behavior. Revisit this choice if the SDK cannot enforce this isolated carrier without exposing external capabilities. No Session schema or persistence format changes.
