# Live Planner review implementation plan

English | [中文](live-review-implementation-plan.zh.md)

## Summary

> Three phases separate pool lifetime, extend authoritative review snapshots and verify existing UI. Approximately eight source/test files change with optional domain fields and no provider or tool expansion.

## Pool and coordinator

- [x] Separate active pool ownership from review waits in `src/security-execution.ts` and an owning pool module if required.
- [x] Retain reservations through disposal; queue completed results and serialize Planner admission.
- [x] Replace pending items after review while preserving active identities and semantic deduplication.
- [x] Apply terminal, explicit individual and owner stop decisions with awaited cleanup.

## Review records

- [x] Extend `src/planning-types.ts` and `src/security-planning.ts` with authoritative running snapshots and validated optional stop identities.
- [x] Distinguish consumed, reserved and available quota; reject forged references across task or execution.
- [x] Reconstruct unreviewed terminal results on explicit resume without automatic replay.

## Verification

- [x] Extend `tests/execution.host.spec.ts` and `tests/planning-admission.host.spec.ts` for overlapping review, arriving results, cancellation and backward compatibility.
- [x] Update paired README and design references.
- [x] Run focused tests, lint, artifact build and aggregate checks, then inspect native task history and a permitted local real-model test.
