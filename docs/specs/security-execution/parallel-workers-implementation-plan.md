# Parallel Worker implementation plan

English | [中文](parallel-workers-implementation-plan.zh.md)

## Summary

> Three phases adjust Worker lifecycle, existing coordination and status presentation. Optional snapshot and dispatch fields preserve legacy sequential runs. No new provider, network tools, version, commit or push is included.

## Worker lifecycle

- [x] Index active investigations by run in `security-workers.ts` while keeping task admission serialized.
- [x] Isolate start retries, messages, approvals and cancellation; add a task-stop fence.
- [x] Add checked internal reservation admission and operation settlement.

## Coordination

- [x] Add the validated concurrency setting in `index.ts` and optional fields in `execution-types.ts`.
- [x] Reserve rolling-pool quotas before dispatch in `security-execution.ts`; collect every owned result before review.
- [x] Preserve request consumption, explicit resume and passive restart behavior.

## Presentation and verification

- [x] Show concurrent activity with existing task and Worker components.
- [x] Exercise overlap, quotas, cancellation races, routing isolation and compatibility with controlled fixtures.
- [x] Build artifacts, run aggregate type checks and inspect the native UI without live inference.
