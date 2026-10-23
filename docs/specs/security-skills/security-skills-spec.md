# Security workflow skills

English | [中文](security-skills-spec.zh.md)

## Summary

> Proposed requirements: Jabberwock owners can create security tasks, request Planner plans, start investigations, inspect progress and open reports through ordinary chat. Product-bundled skills guide existing services; they do not implement another execution system. No new persistence format is assumed. Wrong task selection, unintended execution and unavailable provider tools are the main risks. Implementation is outside this document.

## Owner flow

An owner says “Analyze this project.” The main agent resolves the current Workspace, reads registered assets and existing tasks, and distinguishes local source review from remote security investigation. An unambiguous request proceeds to an existing relevant task or a new draft. The agent asks only for missing information that affects target selection or execution; a general request never grants access to arbitrary remote targets.

The agent saves the agreed objective, completion criteria, scope, allowed operations and limits. It reuses existing confirmed settings without asking for them again, while preserving Host authorization checks. A request for a plan invokes Planner without dispatching Workers. An explicit investigation request starts the existing execution workflow once its readiness requirements are met. Previously established authorization remains usable within its scope; if the Host requires a current instruction that the conversation cannot supply, the agent explains the specific requirement rather than inventing consent.

The agent reports the saved task identity and a navigation action after creation, and the accepted run identity after dispatch. It distinguishes accepted, running, completed, failed, cancelled and interrupted states. A later request for results reads saved evidence and provides the report navigation action without initiating another investigation.

## Skill requirements

Names below are provisional. Users can invoke skills explicitly or discover them through natural-language requests; they do not need to learn the names.

| Skill | Trigger and outcome |
|---|---|
| `security-task` | Create or configure a diagnostic task; read current tasks and registered assets, avoid unintended duplication, save a draft and return its identity and overview action. |
| `security-plan` | Ask Planner for an investigation plan or a revised plan; save the result and return its status without starting target operations. |
| `security-investigate` | Delegate an investigation; resolve the task, check readiness and explicit authorization, and start or resume the existing Planner/Worker workflow. |
| `security-status` | Explain current progress, pending approvals, failures and missing prerequisites; stop or send Worker instructions only when requested, naming the recipient. |
| `security-report` | Read saved results and expose the report view; summarize evidence, outstanding findings and coverage gaps without claiming that no findings means safety. |

Each skill declares when to use it, when not to use it, prerequisites, supported tools, ordered actions, observable success and recovery behavior. Shared rules have one owner and are loaded only when needed. The investigation skill can invoke the task workflow when no task exists; it must not recursively delegate task control to internal Planner or Worker Sessions.

## Product behavior

Skills ship with Jabberwock and become discoverable in ordinary owner chats for registered Workspaces, including projects other than the Jabberwock source checkout. Installing repository-local development skills alone does not satisfy this requirement. Skill descriptions and user replies support Japanese. Only the relevant workflow body is loaded; tool inputs, outputs and model-visible skill content use the existing durable Session mechanisms.

Capability availability is checked for each execution engine. A visible skill must either have its required tools or clearly explain the unavailable capability and offer the existing task-screen route. It must not claim an operation succeeded, use undocumented storage writes, or substitute UI automation to bypass a missing tool. Provider support must be verified, not inferred from the ability to chat.

Report display means returning a working task-report navigation action using the existing UI mechanism. Automatic panel switching and file export are separate features, not implied by this requirement. Empty, unfinished, failed and truncated results remain explicit; users can open the full saved view when a bounded tool response omits details.

## Existing operations and required additions

The existing [main-chat adapter](../../../packages/client/ui-security/src/security-chat-tools.ts) and [command schema](../../../packages/client/ui-security/src/control-types.ts) expose `list`, `read`, `create`, `update`, `start`, `resume`, `stop`, `message` and `open`. The [operation service](../../../packages/client/ui-security/src/security-control.ts) delegates to existing owners. Skills reuse these operations and their revision checks and retry identifiers.

`message` addresses an existing Worker, not Planner. The chat command set has no plan-only operation; fulfilling `security-plan` requires an explicit Planner operation backed by the existing planning service. Asset registration is also absent from this command set: an unregistered target must use the existing asset-registration route, never a fabricated asset ID. Broader asset management is outside the initial skill scope.

The current Codex driver does not expose the same native host-tool bridge as the Claude path. The implementation must establish a provider capability matrix and an actual skill-loading path before promising equivalent behavior. Provider integration changes require their own design review. This specification does not prescribe a new package, tool schema or database.

An existing report-navigation request is:

```json
{"command":{"action":"open","taskId":"task-example","view":"report"}}
```

Its result carries the navigation destination and the service's serialized data:

```json
{"action":"open","workspaceId":"workspace-example","taskId":"task-example","view":"report","data":"{}"}
```

The result above illustrates the envelope only; actual data comes from the service. A plan-only request schema remains a design decision, not an existing API.

## Acceptance criteria

- “Analyze this project” selects the current Workspace and the correct task workflow; ambiguous local-versus-remote intent or multiple matching tasks causes a targeted question before mutation.
- “Create a task” saves one draft, returns its identity and performs no target request; retrying the same operation does not create a duplicate.
- “Ask Planner for a plan” records planning activity and produces a plan without dispatching Workers or accessing targets.
- An authorized investigation request with complete settings starts once; incomplete settings identify only the missing prerequisites, and conflicting edits require a fresh read.
- “How is it going?” reads current state; a stop request waits for the existing stop operation and does not report completion prematurely.
- “Show the report” returns the correct report action, preserves saved evidence and starts no new run; missing or partial results remain distinguishable.
- Cross-workspace identifiers, internal agent control attempts, unregistered assets and unsupported provider capabilities cannot produce unauthorized or fabricated success.
- Supported providers pass recorded tool-routing scenarios and real-model end-to-end checks separately; GUI navigation is visually verified. Merely loading a SKILL.md file is insufficient.

## Scope and open decisions

Initial scope is chat orchestration of the security workflow. New diagnostic tools, unrestricted shell access, automatic source-code remediation, scheduling, external report distribution and ARTEX feature parity are excluded. Local source analysis must not silently become remote investigation.

Before implementation, decide the supported provider set, the plan-only operation and skill distribution/loading design. Skill names may change without changing the user-facing outcomes. No runtime implementation or release is authorized by this requirements document.

## Further reading

The [official skill documentation](https://code.claude.com/docs/en/skills) describes discovery through descriptions and loading workflow content on demand. Jabberwock's own skill registry and execution adapters remain authoritative for supported behavior.
