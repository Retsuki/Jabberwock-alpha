# Shared exploration implementation plan

English | [中文](shared-exploration-implementation-plan.zh.md)

## Summary

> Three phases connect one shared annotation domain to current Planner, Worker and activity owners. Approximately twelve source files and focused tests change. Existing source records and Session formats remain intact; no environment variable or target permission change is required.

## Shared storage

- [x] Add `src/exploration-types.ts` and `src/security-exploration.ts` with serialized task writes, retry identities and evidence validation.
- [x] Register the service and bounded model-read configuration in `src/index.ts` and compiler faces.
- [x] Verify concurrent publication, source validation, stale assessments and restart behavior.

## Agent integration

- [x] Extend Planner snapshots and structured output in `src/security-planning.ts` and `src/planning-types.ts`.
- [x] Add scoped knowledge reads and fact publication through `src/security-worker-tools.ts` and `src/security-workers.ts`.
- [x] Repair unapplied ready annotations before dispatch in `src/security-execution.ts`.
- [x] Log all model-visible knowledge through existing Session notices or tool results.

## Display and verification

- [x] Connect `src/client/TaskActivity.tsx`, `activity-model.ts` and both exploration/timeline consumers to committed knowledge.
- [x] Retain old history without reclassifying log messages as observed facts.
- [x] Run focused tests, artifact build, aggregate checks and native local-model verification with screenshots.

## Constraints

Original evidence, finding triage and execution status remain owned by existing services. Graph annotations cannot broaden scope or establish task completion. Missing or stale references remain unverified. No automatic network replay occurs after restart.
