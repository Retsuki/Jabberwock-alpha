# Shared exploration information

English | [中文](shared-exploration-spec.zh.md)

## Summary

> Proposed: Planner and Workers share task-scoped goals, investigations, observations, findings and hints with explicit supporting links. Existing execution and evidence owners remain authoritative. A dedicated domain stores shared annotations; old records stay readable. Model claims must remain distinguishable from captured evidence.

## User flow

The owner starts an investigation from the existing task conversation. Planner receives the current exploration summary, including unresolved investigations and negative results, and associates its proposed investigations with goals and existing observations. Each Worker can read shared information and record observation-backed results while other Workers run. Planner reviews new results and records its next investigations and goal assessments. Exploration and timeline display the same committed information, with links to the original evidence.

## Records and ownership

The proposed `securityExploration` service owns task-scoped revisions, shared annotations and typed relationships. Existing task goals, plan items, Worker executions, HTTP observations and findings keep their original owners and identifiers. Referenced source records are resolved by their owning services; the shared store does not become a second owner of execution state or finding triage.

Shared entities cover goals, investigations, facts, findings and hints. A fact includes a concise claim, source Worker and observation references; an observed negative result is valid knowledge. A hint is an unverified suggestion. Captured HTTP data supports an observation but does not automatically establish a vulnerability or completed goal. Relationships express derivation, production, support and contradiction. Source identity and related assets are retained.

Planner may propose new investigations and evidence-linked goal assessments. Worker may publish results only for its own admitted task and source observations. Execution state transitions remain Host-owned. Models cannot change scope, overwrite another Worker's evidence, mark a finding fixed or declare task completion through graph writes.

## Service and model inputs

Owner reads use task identity. Agent access uses a private capability bound to admitted task, role and run; model arguments cannot choose another task or role. Reads provide a bounded overview and node detail. Every model-visible result is logged through the existing Session/tool path. Writes validate references, preserve original evidence, serialize task mutations and deduplicate retry identities before publishing changes.

Illustrative read request:

```json
{"taskId":"local-lab","query":"overview"}
```

Illustrative result:

```json
{"revision":12,"goals":[{"id":"goal-1","assessment":"unverified"}],"facts":[{"id":"fact-1","summary":"The anonymous response contains synthetic invoice data","source":{"workerRunId":"worker-1","observationIndex":2}}],"unresolvedInvestigations":["investigation-2"]}
```

Planner keeps its validated structured response path and receives an immutable exploration snapshot. Worker tools expose scoped reads and fact publication. Planner annotations are applied idempotently after validated output; a failed partial application is repaired before further dispatch. Duplicate evidence remains available through original source records, and similar wording alone cannot merge unrelated facts or findings.

## Compatibility and verification

Existing histories are projected read-only using stable source identities; opening a task never starts inference or target access. Deleted or unavailable sources remain visibly unresolved. A task-setting revision change invalidates stale goal assessments without deleting historical evidence. Simultaneous writes preserve both Workers' results, and restart never repeats network requests.

Acceptance covers two concurrent Workers sharing a result, evidence-linked follow-up planning, negative observations, unsupported claims, wrong-task references, retry idempotence, stale assessments, interrupted application and old records. Native UI verification uses the existing local synthetic application and records screenshots; provider refusals remain visible failures.
