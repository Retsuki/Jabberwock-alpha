# ADR 0010: Rolling Worker pool

English | [中文](0010-parallel-worker-batches.zh.md)

## Summary

> Approved option B extends existing coordination with a rolling Worker pool and immutable request reservations. Original histories and model/tool ownership remain intact.

## Alternatives

A concurrent-start patch leaves task-keyed Worker state, cancellation and request budgets unsafe. B changes those responsibilities together and reserves quota before dispatch. C replaces coordination with a persistent distributed job queue, adding migration and scheduling responsibilities beyond the current local workflow. The owner approved B and ARTEX-style slot refill.

## Decision scope

Each Worker owns a finite HTTP quota reserved before admission. An available slot takes the next pending investigation without waiting for unrelated Workers. Unused quota returns only after operation disposal. Worker admission remains serialized while execution and controls are run-owned. Task cancellation fences queued admission, aborts owned operations and awaits settlement. Saved reservations never authorize replay after restart. The existing Planner review consumes settled results; important findings and failures stop further admission while existing work settles.

## Reconsideration

Revisit if quotas can be double-allocated, cleanup cannot be awaited, or task-wide cancellation admits new work. Distributed scheduling requires a separate design.
