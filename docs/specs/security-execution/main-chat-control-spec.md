# Main-chat security control

English | [中文](main-chat-control-spec.zh.md)

## Summary

> Approved design: owners can manage workspace security tasks from the ordinary main chat and open the same task screens. A common operation service delegates to existing record, setup, execution and Worker services. Existing task permission, revision and budget checks remain authoritative. No persistence format change is expected; cross-workspace access and mistaken task selection are the main risks to verify.

## Owner flow

The owner asks the main chat which security tasks exist or how one is progressing. The agent reads the current workspace and presents task names, identifiers, status and findings. If several tasks match a request, the agent asks which task the owner means before changing anything.

The owner can create a task with its name and registered assets, discuss its settings, and ask to start an investigation. Missing checklist items remain visible and block execution through the existing admission checks. A successful setting change is immediately available in the task overview; opening a returned task link selects that task's screen.

The owner can stop or resume a task and send additional instructions to a selected Worker. An accepted instruction is not a claim that new investigation has finished. The existing Worker discussion and Planner execution owners determine what can run and what requires replanning.

## Operations

The workspace-bound operation owner supports task and asset listing, task detail, execution status, findings, task creation and configuration changes, execution start/cancel/resume, Worker instructions and task navigation. It reuses existing service methods rather than introducing a second execution controller. Main-chat tools provide model-readable descriptions and bounded results; they report rejected requests without inventing successful state.

The `security_control` tool accepts a command without model-selected workspace identity and returns a bounded result:

```json
{"command":{"action":"read","taskId":"task-example"}}
```

```json
{"action":"read","workspaceId":"workspace-example","taskId":"task-example","data":"{\"revision\":1,\"task\":{\"name\":\"Local verification\"}}"}
```

Configuration changes apply against the latest stored revision. A concurrent edit returns a conflict that requires a fresh read; the adapter does not silently overwrite an entire stale workspace snapshot. Task and asset identifiers must belong to the calling workspace. The model cannot choose a different workspace to gain access.

## Ownership and limits

`src/security-control.ts` owns workspace resolution, request validation and delegation; `src/control-types.ts` defines its protocol, and `src/security-chat-tools.ts` adapts ordinary chat tools. Record storage owns durable settings; setup owns checklist evaluation; execution owns starts, cancellation, resumption and budgets; Workers own their transcripts and instructions. Both the ordinary chat and task screens observe these same owners.

Only the owner's ordinary workspace chat receives these tools. Security internal Sessions do not gain recursive control of tasks or unrelated conversations. Model-visible tool inputs and outputs remain in the invoking Session's normal tool history. Existing provider consent, credentials and operation authorization remain in force. Native Claude host tools and the Harness tool route used by DeepSeek expose the command; Codex has no compatible bridge and cannot perform these controls.

Browser investigation, arbitrary external tool execution, deleting task data and widening credentials are outside this feature. Tests use synthetic local tasks and do not investigate external targets.

## Acceptance

Focused tests cover workspace isolation, missing tasks, ambiguous selection, stale revision conflicts, checklist rejection, cancellation, resumption, Worker instruction delegation and navigation. A native application test sends requests through the ordinary main chat and verifies the resulting task screen and saved service state. Screenshots and test output establish observed behavior; this design document does not claim that implementation or verification has completed.
