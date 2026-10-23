# Supply-chain check verification

English | [中文](supply-chain-check-verification.zh.md)

## Executed checks

The final focused regression passed 129 unique tests in seven files. Host/client `pnpm run build:check` passed both checks with zero failures, and ui-security TypeScript checking passed. Typert generated 32 public types; API/session-controller, ui-security and API/remotes bundles built successfully. Focused oxlint on the two final changed files passed, and `git diff --check` passed. The final regression includes local handling of cold-snapshot reconstruction failure so other saved runs can still restore. Earlier 47-feature and 93-history runs are supporting runs with overlap and must not be added to the final unique count.

Actual application UI started a fixed scan of `lodash@4.17.20` and `is-number@7.0.0`. Run `cec793f0-8405-4a53-9a17-737ce7e000ff`, Session `session-2693ab44-c6d6-4cdf-a56f-7d2e3aba2941`, checked two package/version pairs and returned five matching rows, five advisory dates and five fix fields, with zero warnings. Four progress stages were persisted: lockfile, advisories, formatting and done. No model turn started. A prior completed run restored after restart with five rows, named sidebar history and no automatic rerun.

Japanese report and expanded-impact screenshots are registered through `verify.py ui`: `tasks/verify/supply-chain-report-final-2026-10-21.png` and `tasks/verify/supply-chain-impact-final-2026-10-21.png`. These show known advisory findings, not confirmed application exploitability or an attack against a vulnerable target.

## Persistence and startup

The formal record `docs/persistence-changes/2026-10-21-security-supply-chain.md` acknowledges the new attribution source in four roots without changing the Session writer version. `verify-persistence-changes --json` reports 70 roots matching 21 history records. Older readers retain ordinary notice-message interpretation; new readers validate source kind, owning identities and run schema before restoration.

The existing API/remotes client bundle must be regenerated after the Remote contract changes. A stale generated bundle caused test application startup failure; rebuilding that carrier and fully releasing test ports 19601/19602/19623 before restart resolved it. This is a development verification prerequisite, not a new runtime dependency or a reason to modify the user's normal profile.

## Final restart and verification limits

The final version-three restart restored run `7cfed4bb-57a1-45c1-8427-d834504b5b49` in Session `session-1a9416e0-3e06-418f-b27a-f8dd7cdd47ea`: five rows with all five dates and fixes, no running Stop control, and named “Supply-chain check” sidebar history. The same four saved notices remained unchanged, each with `visibleInHistory:true`; model turns remained zero and no scan automatically restarted. The normal application recovered its original titles and the unintended Untitled internal-notice clutter disappeared. Host initialization reuses `sessionQuery.observeSession` with `projectionMode:none` for run restoration and cold-snapshot reconstruction without an additional read.

Final restart and progress evidence: `tasks/verify/supply-chain-restored-final-2026-10-21.png` and `tasks/verify/supply-chain-progress-ja-final-2026-10-21.png`. These supplement the final report and impact screenshots above. Grouped lint/network/manual-cancellation and narrow-layout edge checks are not marked complete without their own executed evidence. No commit or push was performed.

## Workspace tabs and explicit repair verification

The final extension regression passed 142 unique tests in eight files (`/tmp/jw-supply-chain-tabs-final-tests.log`). Host aggregate TypeScript checking passed (`/tmp/jw-supply-chain-repair-host-aggregate.log`), Client aggregate checking passed (`/tmp/jw-supply-history-ui-aggregate.log`), and ui-security TypeScript checking passed. Focused Host five-file lint and UI checks excluding the client entry passed; the entry's type-aware lint reports Host/Client Context error-type confusion. Full lint is not claimed, despite successful authoritative TypeScript checks.

Actual Electron UI showed one non-accordion Security entry, Assets/Tasks/Supply-chain tabs, an immediately retained running row and existing embedded Session details with no model composer. Five finding-level Fix buttons were visible. Individual repair from run `35f532e5-253c-43dc-ad16-f6ab0dba5ca2` updated `lodash` from 4.17.20 to 4.18.0 and its follow-up scan returned zero matches. Bulk repair from run `fa7cffd8-a5c5-46cd-a1ab-d3611547a37f` linked follow-up run `2362f8b8-d843-4a71-ae15-3886ff02a884`, reducing the five original matches to zero. The actual package manifest changed and each repair retained a private recovery backup. Model turns remained zero. These are dependency-definition/advisory results; node_modules installation and application functional health remain not run.

Screenshots: `tasks/verify/supply-chain-workspace-running-2026-10-21.png`, `tasks/verify/supply-chain-workspace-list-2026-10-21.png`, `tasks/verify/supply-chain-workspace-detail-2026-10-21.png`, and the individual-rechecked, bulk-repair-result and bulk-rechecked captures. Final registered restart screenshots are `tasks/verify/supply-chain-workspace-restored-list-2026-10-21.png`, `tasks/verify/supply-chain-workspace-restored-repair-2026-10-21.png` and `tasks/verify/supply-chain-workspace-restored-zero-2026-10-21.png` (also registered as the 2026-10-21-230217 captures).

The successor persistence record `2026-10-21-security-supply-chain-repair` adds optional definition fingerprints and repair snapshots without changing the Session writer version or earlier accepted records. Verification reports 70 roots matching 22 history records. Older scans remain readable but cannot be repaired automatically without a fresh saved definition fingerprint.

The final restart retained seven history rows and correctly displayed the latest-update column. The zero-match follow-up `2362f8b8-d843-4a71-ae15-3886ff02a884` restored completed; the original bulk run restored its completed/applied repair. Details rendered two embedded cards and zero model composers. Re-reading persisted events (`/tmp/jw-supply-chain-repair-ui-events.json`) confirmed seven runs, 34 notices, zero model turns and both completed repairs with `definitionOnly:true` and `runtimeTests:not-run`; no scan started automatically. The normal application displayed the new route and retained one existing cancelled run without deletion or rerun.

Final `pnpm run build:check` passed Host and Client with zero failures (`/tmp/jw-supply-chain-tabs-final-build-check.log`; Host 9.23 seconds, Client 20.74 seconds). The final applied-definition wording passed 22 focused UI tests, TypeScript checking and focused lint; this strengthens existing cases and does not increase the earlier 142 unique-test count. The client-entry full-lint limitation above remains. Actual empty-history UI was not exercised because the normal profile had saved history; the zero-advisory screen was exercised. No application runtime/functional-health success is claimed.

<a id="current-verification-2026-10-22"></a>

## 2026-10-22 regression and actual application check

The current focused regression passed 109 tests across seven files (`/tmp/jw-current-full-regression.log`). The subsequent Host and Client aggregate build checks both passed, with zero failures (`/tmp/jw-final-build-check.log`). A separate Desktop regression passed 156 tests across three files (`/tmp/jw-welcome-origin-passing.log`); its count is not added to earlier runs, whose coverage overlaps. The existing `welcome-startup.spec.ts` still has two failing assertions expecting the old native Welcome window; the current entry opens the workspace instead. These failures remain open test/implementation inconsistencies, not successful checks.

Actual Electron operation checked the synthetic standalone npm project `/tmp/jw-supply-validation-20261022`: `lodash@4.17.20` produced five advisory matches. The report's bulk repair updated the dependency definition to `4.18.0`, and follow-up run `43ee9bbe-f1be-428d-9571-a47c60876722` returned zero matches. Restarting with the original application user-data directory restored both history rows. These results cover dependency definitions, advisory lookup, UI repair and restoration; they do not verify installation, application health, vulnerability exploitation or an LLM-driven diagnosis.

Startup exposed HTTP 431 from native Welcome requests carrying accumulated browser cookies. Welcome HTTP and account streams now reuse only the cookie already issued by the owned Host's token exchange, reject different origins and refuse redirects. The original user-data directory started successfully after this change. No stored cookies were deleted. Failure diagnostics include the HTTP status without cookie values or token-bearing URLs.

Repair reports retain the follow-up ID as text with an explicit deleted-result caveat rather than a potentially broken fragment link. A generic preflight run did not finish: recursive environment discovery followed a deep symlink path and was stopped after approximately fifteen minutes. It is not recorded as passed; the focused tests and aggregate build checks above are the executed verification.

The final combined run passed 265 tests across ten files (`/tmp/jw-all-final-tests.log`); this is the latest count, not an addition to the earlier overlapping runs. At a 1280 CSS-pixel viewport, the Actions column initially fell outside the visible table. Its history-only right-sticky styling was then checked in the actual application: the column's right edge was 1247 pixels and both actions remained visible. Screenshot: `tasks/verify/2026-10-22-supply-chain-actions-visible.png`.

Deleting only follow-up `43ee9bbe-f1be-428d-9571-a47c60876722` through the UI reduced this synthetic project's history from two rows to one. The original five-match run remained, its follow-up reference stayed as text, and no broken fragment anchor was present. This deletion check does not delete the original evidence or the repaired project definitions.
