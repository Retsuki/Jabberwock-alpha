# Main-chat control implementation plan

English | [中文](main-chat-control-implementation-plan.zh.md)

## Summary

> Three phases connect ordinary workspace chat to existing security operations and verify the native screen. Approximately six to ten source and test files are expected. No database format, environment variable or external target authorization change is planned. The owner approved [option B](../../adr/0014-main-chat-security-control.md).

## Common operations

- [x] Add `packages/client/ui-security/src/security-control.ts` and `src/control-types.ts` for workspace-bound reads and validated mutations.
- [x] Delegate settings to `src/index.ts` record ownership, checklist handling to `src/security-setup.ts`, execution to `src/security-execution.ts`, and Worker instructions to `src/security-workers.ts`.
- [x] Register dependencies and client access without adding an independent execution loop or rewriting Session persistence.
- [x] Test cross-workspace identifiers, stale writes, missing records and rejected execution admission.

## Main-chat tools and navigation

- [x] Add `src/security-chat-tools.ts` with workspace identity derived from trusted context; exclude internal security Sessions and connect native Claude host tools plus the Harness route.
- [x] Provide bounded task, asset, status and finding reads; task creation/update; start/cancel/resume; Worker instructions; and task screen navigation.
- [x] Keep normal tool history, provider consent and error reporting intact.
- [x] Verify that tool results name the actual selected task and that navigation opens the same saved record in `src/client/`.

## Native verification

- [x] Run focused security and adapter tests and the artifact build; record existing lint failures separately.
- [x] Use the ordinary main chat in the running desktop application to list tasks, create/read/change a synthetic task, and open its overview.
- [x] Verify execution and Worker-message delegation with focused fixtures.
- [ ] Complete a real-model main-chat start, active stop/resume and live Worker instruction test; Claude refused before invoking start.
- [x] Capture native screenshots and record actual outcomes, including provider or environment limitations.

## Constraints

Keep original tasks and evidence intact. Do not add browser tools, silently broaden scope or treat tool acceptance as completed investigation. Preserve existing storage revisions and restart behavior. Check off a verification item only after its output is available; this plan records pending work rather than completed results.

## Verification result

[Native verification](../../verification/2026-10-19-002-main-chat-control.md) records successful task controls and screenshots. Investigation end-to-end verification remains incomplete because no start tool call occurred; existing lint and documentation failures remain reported.
