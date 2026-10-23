# ADR 0011: Planner review during Worker execution

English | [中文](0011-live-planner-review.zh.md)

## Summary

> Option B separates pool settlement from Planner decisions inside the existing task coordinator. Worker tools, scope enforcement and total budgets retain their owners. The owner authorized implementation.

## Alternatives

A adds a completion callback to the batch-oriented loop, duplicating review and stop ownership. B separates those existing responsibilities while preserving services, storage and task history. C replaces scheduling with a durable event queue for cross-host jobs, introducing recovery and deployment responsibilities absent from the current local application. B is selected.

## Decision scope

A settled Worker queues an immutable result for review while unrelated Workers continue. At most one Planner runs per task. Dispatch pauses during review; arrivals are queued for the next review. New pending items replace the undispatched queue. Running investigations remain owned until settled or explicitly cancelled by a validated run identity. Missing items do not imply cancellation or completion.

The coordinator retains HTTP reservations until cleanup finishes and recomputes available quota before admission. Review snapshots distinguish consumed requests, reserved capacity and currently available capacity. Final decisions, elapsed deadlines, scope changes and owner cancellation await all affected operations. Restart remains passive; explicit resume reconstructs unreviewed results from durable attempts and successful reviews.

## Reconsideration

Revisit if a result is reviewed twice, a completed result is lost during inference, or cancellation frees quota before cleanup. Cross-host execution requires a separate scheduling design.
