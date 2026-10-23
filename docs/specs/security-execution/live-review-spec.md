# Planner review during investigation

English | [中文](live-review-spec.zh.md)

## Summary

> Review completed Worker results without waiting for the whole pool. Preserve existing UI and tool permissions. Optional domain fields retain old histories; no Session-format change is planned.

## User flow

The owner starts the saved task normally. When a Worker finishes, the Planner reviews its saved result while other Workers continue. The history displays which results informed each decision. A continue decision can add investigations or explicitly stop obsolete running investigations. A wait-only continuation is accepted only when a captured Worker remains active. Terminal decisions stop and settle remaining work before publishing the outcome.

## Coordination

One coordinator owns the pending queue, active run identities and HTTP reservations. Settled results awaiting review are separate from active operations. Review admission captures terminal result identities across owned plan generations plus a read-only snapshot of active Workers. A successful review acknowledges only its captured completed results; results arriving during inference trigger a later review. Failed or cancelled reviews acknowledge nothing. Planner invocation and request limits remain finite.

The latest continue plan replaces only pending work. Running semantic objectives and confirmed coverage prevent duplicate dispatch. `stopWorkerRunIds` is optional and may contain only identities captured as running for this execution; omission stops none. A target already settled before cancellation is preserved. Cancelled objectives remain unverified. Continue with no new items requires a captured active Worker that is not stopped by the same decision.

Each review is reserved durably in optional execution `reviews` with its stable request identity, previous plan, captured Worker IDs, resulting plan identity and application status. Planner validates this record against execution-owned dispatches. New snapshots retain explicit Worker/plan/item references; old manual reviews retain their same-plan rule. A ready decision left unapplied by interruption is applied only on explicit resume, with idempotent stop and admission identities.

## Budget and history

Snapshots expose consumed HTTP requests, outstanding reservations and unreserved capacity. Outstanding reservations never become free merely because a review starts. Admission always revalidates the current task and total quota. Old plans without stop fields stop no individual Worker. Interrupted work never automatically resumes after restart. Explicit continuation retains consumed budget and successful reviews, reconstructing completed but unreviewed results without repeating their target requests.

Example review output: `{"decision":"continue","summary":"Keep the active check and inspect the new lead","items":[],"stopWorkerRunIds":[]}`. This wait-only output is valid only with an active captured investigation; ordinary manual reviews retain their nonempty continuation requirement.

## Verification

Controlled Workers and model responses prove review before a slow Worker finishes, serialized reviews, no lost arrivals, exact stop validation, preserved reservations, no repeated objective, terminal cleanup and restart compatibility. Native UI checks reuse task history. A real-model local test uses only the existing synthetic loopback application and its saved permissions.
