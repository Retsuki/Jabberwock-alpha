# Finding review implementation plan

English | [中文](finding-review-implementation-plan.zh.md)

## Summary

> Three phases update existing findings, coordination and UI owners in approximately 20 source and test files. Storage fields are optional; no provider, environment, version, commit or push changes are included.

## Findings

- [x] Extend `finding-types.ts`, `security-findings.ts` and `finding-groups.ts` with reversible links and conservative automatic grouping.
- [x] Record request context in `worker-types.ts`, `security-evidence.ts` and `security-http.ts` without retaining request secrets.
- [x] Verify legacy data, triage and original retest references.

## Review

- [x] Update `security-execution.ts` and `security-planning.ts` to review terminal results at findings, failures and budget boundaries.
- [x] Extend `planning-types.ts` and `planning-coverage.ts` with carried-item identity and authoritative review context.
- [x] Align `report-model.ts` with item identity rather than shared URLs.

## Presentation and verification

- [x] Update `TaskFindingRecords.tsx`, `TaskSavedReport.tsx` and client service wiring to show representative findings and related evidence.
- [x] Run focused tests, build artifacts, aggregate type checks and relevant preflight checks.
- [x] Inspect the native UI with synthetic records and register screenshots.

## Compatibility

Never delete original reports or retest snapshots. Missing optional fields remain readable. Owner separation prevents automatic relinking. Stop budget enforcement remains host-owned; cancellation and changed settings cannot trigger another review. Parallel scheduling and additional investigation capabilities are outside this change.
