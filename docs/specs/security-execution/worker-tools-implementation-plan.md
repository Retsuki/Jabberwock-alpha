# Worker tools implementation plan

English | [中文](worker-tools-implementation-plan.zh.md)

## Summary

> Summary: Approved option B; three phases, approximately 15–25 files. Add optional Worker history fields and reuse existing Session events. Keep main-chat conversation-only routes unchanged.

## Table of Contents

- [Tool execution](#tool-execution)
- [Worker lifecycle](#worker-lifecycle)
- [Verification](#verification)
- [Compatibility](#compatibility)
- [Dev Note](#dev-note)

<a id="tool-execution"></a>
## 1. Tool execution

- [x] Add run-scoped host tools to `packages/core/agent/src/execution-engines.ts`.
- [x] Add the isolated MCP bridge to `packages/core/subscription-engines/src/claude.ts`.
- [x] Extend `packages/client/ui-security/src/security-http.ts` and `worker-policy.ts` with checked HTTP operations.
- [x] Add `security-worker-workspace.ts` for private work files and isolated offline analysis.

<a id="worker-lifecycle"></a>
## 2. Worker lifecycle

- [x] Connect `security-workers.ts` to dedicated execution routes, evidence history and owner instructions.
- [x] Extend `worker-types.ts` and `security-findings.ts` to associate findings with their actual observation.
- [x] Account for every child HTTP operation in `security-execution.ts`.

<a id="verification"></a>
## 3. Verification

- [x] Run focused transport, policy, bridge, lifecycle and compatibility tests.
- [x] Generate referenced Host declarations and pass type checks.
- [x] Investigate the synthetic local application from the actual Electron screen.
- [x] Save and show screenshots of Worker logs and findings.

<a id="compatibility"></a>
## Compatibility

Legacy missing fields describe a single GET. Restart never replays a pending operation. Errors cannot become success; mutation requests are not blindly retried. No version changes, commits or pushes are included.

<a id="dev-note"></a>
## Dev Note

Native Electron verification with the real Claude subscription confirmed multi-request investigation, evidence-backed findings and delivery of an owner instruction during execution. Worker and findings screenshots were captured and registered with the UI verifier. DeepSeek tool-loop unit tests do not establish actual DeepSeek model support; real DeepSeek execution remains unverified.
