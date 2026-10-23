# Parallel Workers

English | [中文](parallel-workers-spec.zh.md)

## Summary

> Independent saved investigations run in a rolling pool. Shared HTTP budgets, isolated controls and passive restart remain mandatory. Optional persisted fields preserve old histories.

## User flow

A task dispatches up to the configured concurrency. Each Worker has its own conversation, activity indicator, instructions and approvals. A free slot takes another pending item while other Workers continue. Individual stop affects its selected Worker; investigation stop settles every owned Worker. Existing Planner review uses settled results. Important findings and failures stop new dispatch while current operations settle.

## Budget and persistence

`executionMaxConcurrentWorkers` defaults to 3; optional `snapshot.limits.maxConcurrentWorkers` captures the value. Legacy absence resolves to 1. Slots cannot exceed pending items or available HTTP requests. Durable `dispatches` reserve exact request identities, targets and quotas before admission. Consumed settled requests plus outstanding reservations cannot exceed the execution limit. Unused quota returns only after the Worker operation, including disposal, settles.

Coordinator-only `startReserved` requires the current execution and an exact saved reservation. Manual start cannot bypass an active execution budget. Reusing a request identity with different inputs is rejected. Admission remains task-serialized; operations are indexed by Worker identity.

## Stop and restart

Task cancellation fences admissions, aborts every owned Worker and awaits cleanup. Scope changes and deadlines use the same cancellation ownership. Restart marks unfinished records interrupted and never replays a reservation. Explicit resume retains actual consumption and successful reviews, then creates new reservations. Older strict readers reject unfamiliar fields before execution.

## Verification

Controlled fixtures exercise overlap, slot refill, quota limits, disposal before quota release, isolated messages and approvals, cancellation, storage failure and passive restart. No external investigation is required.
