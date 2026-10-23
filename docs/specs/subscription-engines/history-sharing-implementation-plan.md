# History-sharing settings implementation plan

English | [中文](history-sharing-implementation-plan.zh.md)

> Deliver provider-specific history-sharing settings in three phases across the subscription engine and Models settings packages, approximately eight source/test files plus paired documentation. Reuse active-profile persistence. No environment variables, database migration or breaking Session change are required.

## Scope

Follow the approved B design in the [specification](history-sharing-spec.md). The existing settings service owns persistence and access checks; the common native prompt builder owns sharing decisions.

## Phase 1: Provider policy

- [x] Add optional volatile `historySharing` config fields in `packages/core/subscription-engines/src/index.ts`, defaulting each provider to `ask`.
- [x] Pass the current provider value through `src/claude.ts` and `src/codex.ts` into `src/shared.ts` for every native entry path.
- [x] Skip the sharing question only for explicit `allow`; retain existing conversation permissions, text filtering, native resume and cancellation.
- [x] Extend `packages/core/subscription-engines/tests/history-sharing.spec.ts` for defaults, isolation, allow, ask restoration and content boundaries.

## Phase 2: Models settings

- [x] Extend `packages/client/ui-settings-models/src/client/SubscriptionConnections.tsx` with provider-specific policy choices and destination/content explanations.
- [x] Bind the existing config forms and settings mutation operations in `src/client/index.ts`; retain revision conflict and Gateway/settings permission behavior.
- [x] Add localized labels in `src/client/locales.ts` and focused UI/store tests. Do not introduce a new Remote endpoint or preference file.

## Phase 3: Verification

- [ ] Run affected tests, type checks, lint and required artifact build checks; preserve unrelated uncommitted changes.
- [ ] Verify omitted config and old Session data keep their existing behavior.
- [ ] Inspect the actual settings screen, save a provider-specific choice in an isolated test profile, reload/restart, and capture screenshots. Restore the test choice; do not change the user's normal profile.
- [ ] Validate paired documentation and record actual checks and remaining unverified behavior. Do not claim external model verification without executed evidence.

## Constraints

Never treat an earlier one-time data-sharing approval as permission to enable application-wide `allow`. Do not weaken tool or target authorization, import system/tool/credential-file content, change DeepSeek policy, erase existing per-conversation permissions, commit or push.

## Verification evidence

The implementation and regression checks cover phases one and two. The focused Models UI run passed eight tests (`/tmp/jw-history-ui-final.log`); a combined run passed 238 tests in twelve files (`/tmp/jw-history-settings-regressions.log`). The subsequent stop-reason run passed forty tests in three files, including native history-sharing coverage (`/tmp/jw-stop-reason-final-tests.log`). Counts overlap and must not be added. Artifact build passed seven checks (`/tmp/jw-history-build.log`), and Host/client build checks both passed (`/tmp/jw-history-check.log`). This record does not mark the combined lint checklist complete.

Actual Models settings saved Claude=`allow` while Codex remained `ask`, and the restart assertion verified both values. The isolated profile patch retains only the explicit Claude override; omitted Codex still defaults to `ask`. UI evidence is registered in `tasks/verify/pending.json` as `2026-10-20-220646-Provider-history-sharing-settings.png`, sourced from `/tmp/jw-northline-docker-shots/history-sharing-after-restart.png`. Restoration of the test choice is not verified, so the corresponding checklist remains open.

Normal NORTHLINE shopping and bounded Claude Sonnet investigation have separate evidence in the [EC verification record](../security-execution/ec-lab-verification.md). Neither establishes that an actual malformed model response was corrected successfully in a setup conversation. The subsequent real-model setup check observed three bounded corrections, continued format failures, and one successful name-only save; it did not recover the goal/completion-condition proposal. Codex remained disabled for this conversation-only route. The linked record contains the exact task and evidence; complete setup and successful real-model recovery are not verified.
