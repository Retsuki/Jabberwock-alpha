# Context and subscription usage implementation plan

English | [中文](subscription-quota-implementation-plan.zh.md)

## Summary

> Implement approved B in three phases across the subscription engine, its remote projection, and existing conversation/sidebar UI. Reuse context measurements and existing authentication. No database migration, Session event or environment variable is expected. Provider availability is verified separately from UI fixtures.

## 1. Account observations

- [x] Add typed read-only account-usage results and the service in `packages/core/subscription-engines/src/quota.ts`.
- [x] Implement bounded Claude SDK and Codex app-server reads in `packages/core/subscription-engines/src/`, using actual reported window durations.
- [x] Deduplicate concurrent reads, scope observations to the authenticated provider connection and cover cancellation, unavailable data and valid zero.
- [x] Expose the common result through the existing Host/client remote services without persisting account snapshots into Sessions.

## 2. Context placement

- [x] Extend `packages/client/ui-sidebar-right/src/client/tabs/usage/UsageBody.tsx` with provider quota windows, reset times and explicit observation state.
- [x] Add a compact context ring to the conversation composer beside its model control; opening it selects existing Usage details.
- [x] Reuse existing context occupancy and locale dictionaries; retain responsive layout and avoid comparing unrelated provider/model observations.

## 3. Verification and documentation

- [x] Run focused Host/client tests for zero, unavailable, stale, mismatched provider/model and reset-time presentation.
- [x] Run `build:artifacts` followed by `build:check` and focused documentation checks.
- [x] Launch the native app, inspect the composer ring and Context panel, and capture screenshots. Record unavailable provider data honestly.
- [x] Update the subscription-engine and sidebar README pairs against the implemented behavior and record translation pairing.

## Constraints

Do not issue inference requests to obtain usage. Do not inspect conversation bodies, scan credential stores, infer allowance from token counts, assume the primary limit is five hours or turn an optional usage failure into a failed chat turn. Existing Session usage events and cumulative counters retain their meanings.

## Verification

On 2026-10-19, `build:artifacts` passed seven gates (`/tmp/jw-quota-build7.log`) and the subsequent `build:check` passed two. Host tests passed 58 cases across eight files before the final classification adjustment; the final focused Claude suite passed 11 cases. The latest client/sidebar, projection and remote suites passed 274 cases across 19 files (`/tmp/jw-quota-final-clienttests.log`). Persistence verification passed with 70 roots and 20 records; `git diff --check` passed.

The visible native Electron window was exercised through CDP port 19223. Two separate synthetic Claude Sonnet 5.5 turns returned `OK` and supplied context measurements: the composer ring showed 3%, opened the right panel, and the panel showed approximately 32.4K / 1M. Claude account observations showed five-hour usage 8%, weekly usage 17% and Fable usage 0%, with reset times and manual refresh. Codex account usage displayed unavailable; no cause is inferred. Opening and closing Context details worked. Account-quota reads used control queries without inference; the two synthetic turns tested context separately.

Screenshots: [Context panel](/tmp/jw-quota-complete-panel.png) and [subscription windows](/tmp/jw-quota-allowance-panel.png). These values describe this observation, not fixed account limits.
