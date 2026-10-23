# ADR 0006: Host-owned security persistence

English | [中文](0006-security-persistence.zh.md)

## Decision

The user approved option B on 2026-10-17: reuse the existing Host storage and authenticated Remote infrastructure while giving security management its own durable records. Workspace identity partitions company scopes, typed assets, and unexecuted task drafts. The desktop storage-domain provider owns SQLite; browser component lifetime does not own saved business records. See the [specification](../specs/security-persistence/security-persistence-spec.md).

## Alternatives

A adds persistence to the existing browser preview store. It avoids Host work but leaves records tied to an origin and separates saved tasks from future execution ownership. B adds a security management owner alongside existing Host services and keeps the current UI. C replaces the security application and execution infrastructure wholesale. C repeats existing authentication, workspace, and storage mechanisms without helping the first restart-safe save flow.

## Consequences

A successful save requires Host storage acknowledgement. Empty Workspaces receive no demonstration seed, and legacy browser values stay untouched. Saved tasks remain drafts: persistence grants no target access and starts no diagnosis. Existing execution permissions and Session formats remain unchanged. Task-detail previews must not present sample evidence as results of a saved task.

Revisit execution, target enforcement, Planner/Worker coordination, and evidence storage in their own design before connecting runtime actions. The approved first increment is asset and task persistence only; this decision does not claim that runtime acceptance checks have passed.

The approved overview-editing continuation retains B: optional typed task policy arrays reuse the aggregate and CAS save queue. A keeps rows in local component state and loses restart retention; C redesigns task storage and APIs, duplicating the existing revision control without a need in this increment. Persisted allow/deny drafts are not enforced execution policy.
