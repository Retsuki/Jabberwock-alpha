# Workspace supply-chain check specification

English | [中文](supply-chain-check-spec.zh.md)

> B architecture approved; the fixed scanner and report UI are implemented. The verification record distinguishes executed checks from remaining checks. Workspace owners can check locked JavaScript dependencies against public advisories and review results in a persistent conversation. No LLM, dependency installation or automatic repair is required. Package names and versions are sent to the npm registry; source, environment files and credential-file contents are excluded. No new database is proposed.

## User flow

1. Click `サプライチェーンチェック` (Supply-chain check) under the Workspace's Security sidebar section.
2. Open a dedicated ordinary conversation belonging to that Workspace and automatically start its fixed scanner. Repeated clicks while its run is active reopen that conversation without another scan.
3. Display progress stages: identify lockfile, query advisories, format results. The owner can cancel the active run.
4. Save progress, outcome and factual findings in Session events. After application restart, the owner can read the conversation; no scan automatically resumes or restarts.
5. If the lockfile is absent or unsupported, the registry is unavailable, or cancellation interrupts coverage, show incomplete/error/cancelled status with the checked scope. Never equate an incomplete zero-finding result with safety.

## Coverage and results

The initial scope is npm and pnpm lockfiles for JavaScript/TypeScript applications, including Next.js. For shared workspace lockfiles, the result identifies the root lockfile and actual shared dependency scope instead of claiming package-local precision. It distinguishes direct/transitive relationships and production/development classifications, retaining shared or unknown classification when a reliable split is unavailable.

Results contain factual Markdown and structured rows: package, installed version, fixed version or explicit no-fix information, advisory severity, available GHSA/CVE identifiers and source links, advisory publication/update dates, general impact and its rationale, project-impact assessment (confirmed, conditional or unverified), direct/transitive relationship and production/development classification. Advisory publication/update dates must not be presented as the project discovery date. Summary counts state their counting unit and checked scope. An advisory without known fix information is distinguished from a verified absence of a fix.

This check matches known published dependency advisories. It does not prove code reachability, exploitability or absence of unknown vulnerabilities. A fully completed zero-advisory scan means no matches in the checked data, not that the application is safe.

## Report presentation

The conversation shows the saved result and a findings table. The owner can expand a row or open its report. Reuse the existing ExecutiveReport presentation and shared report components so severity, evidence, impact and limitations follow the product UI. The report distinguishes registry facts, general advisory impact and project-specific observations. Static imports alone cannot establish reachability or confirmed project impact.

## Host execution and sharing

The Host resolves the registered Workspace identity to its trusted directory. The caller cannot supply an arbitrary `cwd`. The scanner uses fixed, shell-free operations with bounded time, network responses and displayed output. It never installs packages, runs project scripts or applies fixes/updates. It sends lock-derived package names and versions to the npm registry for advisory matching, without submitting source, environment-file contents or credential-file contents. The scan conversation and report explain the destinations and data scope.

The npm registry audit response supplies the primary facts. Optional public GitHub advisory API lookup can supplement known GHSA identifiers, dates and impact descriptions: requests use a fixed GitHub API host, send only public GHSA IDs and require no token. Missing or failed enrichment remains unknown and never hides the primary result. Do not submit source, environment or secret-file contents to either service. This feature performs no payload execution, exploitation or attack against the application.

## Integration

`packages/client/ui-security/src/client/WorkspaceSecurity.tsx` owns the entry. Existing session-controller `commands.create` with `workspaceId` creates the conversation; `UiWorkspace.openSession` opens it. `uiConversation.events.register` renders scanner events. A fixed scanner owner uses existing Session lifecycle and `ctx.jobs.start`, and waits for its job through the jobs service so completion does not wake a conversation model. Jobs are ephemeral. Progress and results are saved as existing `user/message` notices with `source.kind=security-supply-chain`, `form=notice`, owning identities and a validated typed run snapshot. The source type permits optional `visibleInHistory?: true`; the producer explicitly writes true so the ordinary sidebar retains this conversation without exposing other internal notices. Stopping or unloading the run cancels its work, and registry failure remains an incomplete/error result.

The proposed namespace is `securitySupplyChain`; implementation may refine names without changing the contract. Operations accept identities and idempotency keys, not filesystem paths:

```json
{"operation":"start","workspaceId":"workspace-1","requestId":"request-1"}
{"accepted":true,"runId":"run-1","sessionId":"session-1"}
{"operation":"read","workspaceId":"workspace-1","runId":"run-1"}
{"operation":"cancel","workspaceId":"workspace-1","runId":"run-1"}
```

Existing Workspace/Gateway access checks apply to creation, reading and cancellation. A duplicate request returns the existing run/session identity. Concurrent start requests must not create two active runs for the same Workspace.

## Approved architecture

A asks a chat model to perform the check; it leaves scanner behavior dependent on model tools and instructions. B proposes a dedicated fixed scanner owner connected to existing Session, jobs and conversation event rendering; it avoids requiring an LLM or rebuilding chat persistence. C replaces the execution and conversation infrastructure, expanding the change beyond this check. B is approved. This specification records the agreed behavior; implementation and validation are tracked in the [implementation plan](supply-chain-check-implementation-plan.md).

## Acceptance criteria

Tests cover npm/pnpm locks, shared workspace scope, direct/transitive and dev/prod reporting, zero matches, advisory with/without fix information, absent/unsupported locks, network failure, timeout, cancellation and repeated/concurrent clicks. Actual UI verification must confirm the dedicated conversation, visible progress, persisted results after restart and no automatic rerun. External registry tests must use disclosed package/version data; no source or secret-file upload is permitted.

## Approved navigation and repair extension

B is approved and implemented; executed checks and remaining limits are recorded in the verification document. The existing scanner, saved conversation and report remain the current behavior. A single Security sidebar entry would open SecurityPage with top-level Assets, Tasks and Supply-chain tabs. The Supply-chain tab would show a task-style check list and a Start button at the upper right; starting would immediately add a running row. Opening a row would embed its existing Session conversation and report rather than create a second history.

Individual and bulk Fix actions would update dependencies and then run a new scan, preserving before/after results. Initial repair supports standalone projects and public direct dependencies only. The repair owner stages fixed npm/pnpm lock-only operations with install hooks/scripts disabled and isolated package-manager environment/configuration. It refreshes all advisory checks, verifies original manifest/lock hashes, then applies the manifest and lock with backups and starts a new scan. Detailed implementation must preserve these checks and report refused or failed steps. A reduced advisory count is not proof that the application still works; unexecuted application checks must remain unverified, never successful. Read-only scanning retains its no-install/no-update guarantee; only the explicit separate repair operation may change the manifest and lock. It does not refresh node_modules or verify application health.

A would add list and repair behavior to the chat route. B would reuse the scanner service and existing history, add list/read operations, and keep dependency repair in a separate owner; B is approved. C would rebuild scanner, history and navigation infrastructure and has the largest scope. Repair requires the explicit individual or bulk owner action and remains separate from starting a read-only scan. The [architecture decision](../../adr/0016-supply-chain-navigation-repair.md) records the responsibility split.
