# ADR 0012: Shared exploration ownership

English | [中文](0012-shared-exploration.zh.md)

## Summary

Option B introduces one shared exploration service while retaining existing task, execution, evidence and finding owners. ARTEX's typed exploration nodes, relationships and role-specific reads/writes provide the reference. The owner approved B.

## Alternatives

| Option | Structure | Consequence |
|---|---|---|
| A | Append shared summaries to each plan and Worker record | Lowest initial effort; concurrent updates, repeated copies and relationship queries remain distributed |
| B | Dedicated shared annotations and relationship owner; existing source records retain ownership | Adds a service and scoped agent access; integrates current execution and UI without migrating every record |
| C | Replace task, plan, Worker and finding persistence with one exploration store | Unified persistence, but requires changing execution, retests, reports, compatibility and all current readers |

B is recommended. C spans substantially more than three times B's work because existing lifecycle and evidence storage must also move; A leaves several writers without a common commit owner.

## Scope

The [specification](../specs/security-execution/shared-exploration-spec.md) defines records, role permissions, idempotence, model logging and acceptance. The initial scope connects existing investigations to shared information; it does not introduce additional network tools or broaden target permissions.

## Reconsideration

Revisit the storage split if source owners must synchronously update one another to preserve ordinary graph reads, or repeated partial application cannot be repaired deterministically before dispatch. Keep source references and retry identities stable during any replacement.
