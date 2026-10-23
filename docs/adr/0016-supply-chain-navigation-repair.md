# ADR 0016: Supply-chain navigation and repair ownership

English | [中文](0016-supply-chain-navigation-repair.zh.md)

## Summary

The owner approved B: reuse the fixed scanner and saved Session history, provide one Security destination with tabbed check navigation, and keep dependency repair in a separate operation owner. The [specification](../specs/supply-chain-check/supply-chain-check-spec.md) defines behavior; implementation is complete, with executed checks and remaining limits recorded in the feature verification document.

## Alternatives

| Option | Structure | Tradeoff |
| --- | --- | --- |
| A | Add list and repair branches to chat | Couples mutation policy to conversation presentation. |
| B, approved | Reuse scanner/history and separate repair ownership | Keeps read-only checks independent from explicit project file updates. |
| C | Rebuild scanner, history and navigation | Replaces existing persistence and cancellation for a larger change. |

## Decision

The Security page owns Assets, Tasks and Supply-chain navigation. Check details embed the existing Session conversation and factual report; they do not duplicate history. The scan service owns advisory facts, list/read and saved results. A separate repair owner validates explicit individual/bulk actions, stages fixed npm/pnpm lock-only updates with scripts/hooks disabled and isolated environment/configuration, refreshes all advisories and checks original file hashes before applying backed-up manifest/lock changes and rescanning.

Initial repairs cover standalone public direct dependencies only. Scanning never implies permission to repair. Repair does not update node_modules or establish application health. Missing validation remains unverified; a lower advisory count cannot turn it into success. Host contracts and any persisted type transition must be validated through their existing mechanisms before completion is reported.

## Reconsideration

Revisit B if supported repair requires workspace-wide or private dependency resolution, arbitrary project lifecycle scripts, conflicting mutation owners, or a rollback that cannot preserve the original files. Do not broaden the fixed operation silently or delegate unrestricted shell execution to chat.
