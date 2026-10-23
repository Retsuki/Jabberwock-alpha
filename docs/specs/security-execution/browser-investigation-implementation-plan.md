# Browser investigation implementation plan

English | [中文](browser-investigation-implementation-plan.zh.md)

> Add a private browser adapter, connect Worker transport and credential UI, then verify local login and Desktop operation. Three phases touch roughly 12 source/test files and paired documentation. No version change, persistent credential storage or automatic investigation restart.

## Phase 1: Browser and transport

- [x] Implement `src/security-worker-browser.ts` and extend `src/security-http.ts` / `src/security-worker-tools.ts` with checked browser transport, shared quota and private cookies.

## Phase 2: Worker and owner controls

- [x] Connect browser disposal and prompts in `src/security-workers.ts`; add memory-only credential configuration through `src/client/WorkerChat.tsx` and existing remote bindings.

## Phase 3: Verification

- [x] Run focused real-browser, transport, service and UI tests, artifact/check builds, and inspect Desktop screenshots. Record real-model verification separately.

## Constraints

Preserve unrelated changes. Keep current HTTP behavior, permissions and durable formats. Do not import experimental providers, store login secrets in Sessions or commit/push.
