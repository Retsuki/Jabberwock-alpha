# Security activity design QA

Final result: passed

## Visual targets and capture

Reference images: owner-provided screenshots retained outside the source distribution.

The references are 2032 by 1162 physical pixels. The comparison isolates the app-owned timeline at x357/y300, 1590 by 780 pixels, excluding browser chrome and the different application shell. Browser captures use a 2048 by 1152 CSS viewport at deviceScaleFactor 1; the timeline component measures 1644 by 823 pixels and is contained proportionally in a 1590 by 780 comparison area. Japanese labels and real stored verification records replace the reference Chinese sample content deliberately.

Full-view comparisons: `/tmp/jw-timeline-compare-closed.png` and `/tmp/jw-timeline-compare-open.png`. Focused toolbar, date, first-event and expansion comparisons: `/tmp/jw-timeline-compare-closed-focused.png` and `/tmp/jw-timeline-compare-open-focused.png`. Final application capture: `/tmp/jw-activity-final-native.png`. Exploration captures: `/tmp/jw-exploration-wide.png` and `/tmp/jw-exploration.png`.

## Findings and fixes

- The initial exploration fit compressed many records into an unreadable vertical strip. The graph now excludes conversation chatter from layout, packs each depth into at most six rows before adding columns, and opens at readable scale. Explicit fit and the minimap retain access to the whole graph.
- Long Japanese graph labels crossed node borders. Labels now truncate within each node; hover and selection retain the full recorded title and payload.
- A 12-hour time suffix wrapped into an extra line. Timeline rows now use 24-hour time and prevent wrapping in the time column.
- New activity types initially shared neutral markers. Review, execution and conversation types now have distinct icons and semantic colors.
- The search placeholder had insufficient visual prominence. It now uses the existing secondary-label token.

Post-fix captures listed above were inspected. No actionable P0/P1/P2 findings remain.

## Fidelity surfaces

Typography uses the existing application font and compact controls. Small labels, IDs and sources retain the reference hierarchy; titles truncate with full text in details. A minor difference in font metrics between the two products remains P3.

Spacing follows the reference horizontal toolbar, left time rail, circular event markers, seventy-pixel minimum row rhythm and right-aligned sources. The toolbar wraps at narrow application widths while the task header and tabs remain fixed.

Colors use the existing product tokens for new states and the established timeline palette. Data types and available filters follow actual records; no confirmed vulnerability, priority or goal-completion badge is fabricated to match sample content.

There are no raster illustration assets in the target content. Existing library icons and the functional SVG graph remain vector-sharp. Browser chrome, logos and shell navigation are not recreated.

Product copy is localized into Japanese, English and Chinese. Saved titles and model reports remain verbatim; known system activity messages use the existing localized dictionary. Stable full IDs remain available in details and search, with abbreviated presentation.

## Interaction evidence

Both the desktop application with existing investigation records and an isolated browser fixture passed search, sort controls, expandable records, refresh pause, fixed-header scrolling, graph selection, zoom and fit checks. Component tests additionally cover non-overlapping reads, old-task responses, empty records and preserving graph position. Browser console error list was empty. These views did not initiate inference or target investigation.

The scoped security suite passed 170 tests across 19 files. Build artifacts passed seven gates; aggregate build checks passed two gates. Focused lint and diff whitespace checks passed. This evidence concerns activity presentation, not new penetration-test capabilities.

## Follow-up polish

P3: exact font metrics and locale-specific date formatting differ between the reference and native browser environment. The current view keeps stored dates and task records rather than copying the reference sample dates.

## Implementation checklist

- [x] Connect timeline and exploration to saved task activity.
- [x] Compare collapsed and expanded timeline states against the supplied visual targets.
- [x] Fix unreadable graph layout and overflowing labels.
- [x] Verify interactions and inspect desktop rendering.

final result: passed

## Exploration trackpad and detail follow-up

The 12:54 screenshot exposed overlapping edge labels and an expanded response body covering the graph. Native wheel handling now pans on two-finger scroll and zooms around the pointer on pinch (Ctrl-wheel events), preventing page zoom. SVG letterboxing is included in the coordinate transform. Relationship lines are subdued until a connected node is selected; scope links stay subdued and unlabelled. Details keep the title and close action fixed below refresh controls, scroll independently, and initially collapse raw saved data with a bounded log viewport.

Verification: focused gesture, selection and payload tests; desktop CDP wheel/pinch event checks; final screenshot `/tmp/jw-exploration-trackpad-final.png`. Physical trackpad hardware gestures were not exercised by automation.

## Long related-item overlap correction

The 13:03 screenshot revealed that wrapping relation titles still used the shared compact button's fixed 28px height. Only exploration detail relationship buttons now use automatic height, a 28px minimum, 1.6 line height and safe long-token wrapping. The desktop check opens the recorded sensitive-file Worker, measures every related button for overflow and pairwise overlap, then expands the saved payload and captures `/tmp/jw-exploration-no-overlap.png`.

## Findings and retest delivery

References: the owner's ARTEX findings/retest screenshots from 13:07. Saved findings retain the severity/title/summary, target, triage and timestamp row hierarchy, with expandable PoC and a detail action. Retests retain the left finding picker and right selected-finding execution/history. The existing application shell and locale differ deliberately. Related text and evidence use variable height and bounded scrolling; task header/tabs stay outside these scroll regions.

Real-host browser verification used an isolated example.org fixture home with replaced model and network providers. It verified source proof disclosure, owner triage, running state, independent retest completion, fixed-state update, Session action availability and history after browser reload, with zero page errors. All HTTP and inference responses were fake; no live provider or target was tested. Desktop verification opened the real saved task in both tabs, confirmed empty findings for legacy narrative-only Worker history, and started no inference or investigation. The runtime remains open on Findings.

Evidence: `/tmp/jw-findings-real-ui.png`, `/tmp/jw-retests-real-ui.png`, `/tmp/jw-findings-final-dark.png`, `/tmp/jw-retests-final-dark.png`, `/tmp/jw-findings-native-empty.png`. Focused package tests: 195 passed in 22 files, including 19 findings/report host cases and 3 dedicated UI cases. Final artifacts: seven gates passed; aggregate checks: two passed. The legacy evidence is not classified retroactively. Current validation remains one anonymous policy-checked GET, not an authenticated or exploit-capable retest.

## Live native investigation, 2026-10-18

The owner explicitly authorized non-destructive GET investigation of an owner-authorized external target and sharing the task, related conversation and observations with Claude/Anthropic. The real native Start investigation button was used. The first attempt retained actual HTTP evidence but failed: the top page exceeded 65,536 bytes; two other Workers returned a complete leading JSON code block followed by prose, which the original report parser rejected. The parser now reads only that complete leading code block and still rejects malformed structured data and invented evidence quotations. Thirty focused report/Worker tests and artifact/aggregate builds passed. Failed attempts remain in history; they were not converted into success or findings.

Native restart then failed in welcome authentication. Two hypotheses were considered: Host/runtime failure and stale client authentication state. The old Electron profile contains 71 localhost cookies, approximately 16,117 bytes before other request headers; HTTP header size is a likely cause but the welcome error does not expose response status. A separate temporary Electron user-data directory restored startup with the exact same DSH_HOME, without deleting settings, credentials, tasks or logs. Desktop source was not changed. The remaining follow-up is authority-specific cookie handling and status-bearing startup diagnostics. Live verification continues with the temporary client directory `/tmp/jw-live-electron-user-data` and original durable storage.

Live follow-up execution `6e4acb8b-e6e9-4a00-9c9e-99d44ac92b8b` reached coordinator completed after nine real requests. Five Worker reports completed with zero structured findings; four retained failures: top-page size cap, intentional redirect refusal, and two report-format failures. The latest parser also accepts supplementary top-level report metadata and leading raw JSON followed by prose while strictly checking finding fields and evidence. Thirty-two focused tests passed; four actual retained model outputs parsed offline with zero findings. No failed historical attempt was rewritten. Planner completion is a workflow outcome, not a claim that the domain is vulnerability-free; incomplete observations and lack of authentication/exploit capability remain material limitations. All inference used actual Claude; test fixture providers were not loaded in the native app.

## Response capture and real report, 2026-10-18

The approved capture/report change separates the 4 MiB response-file limit from the 64 KiB per-response model budget. Saved reports expose acquisition and analysis coverage independently, distinguish zero findings from complete testing, and retain failed/partial/unsupported work. The Markdown view and copy use the same saved records; response bodies stay behind expandable evidence. A screen review removed duplicated raw setup JSON and separated authoritative acquisition metadata from AI-authored summaries.

Real native execution `8a0984bf-a75f-49d8-a3e6-89b6b7cc1412` was started through Main Agent conversation with anonymous public HTTP-only scope clarified. Main Agent and Planner/Workers used actual Claude. Three Workers completed: HTTPS top page, robots.txt and sitemap.xml. The top page's 80,765 bytes were fully saved to a task-owned file; 65,365 model-visible bytes remained under the 65,536 budget. Acquisition is complete and analysis is partial. The model summary incorrectly called capture partial; the report preserves that summary as AI-authored text while showing the authoritative saved metadata separately. One HTTP redirect remained blocked and was not followed.

The next Planner review returned malformed JSON consisting of an unfinished object followed by a second object. The execution stopped as failed; no permissive JSON repair or historical rewrite was performed. This is an unresolved live-model output failure, not a response-size failure or a completed diagnosis. The report shows failure and remaining gaps; zero findings does not certify safety. An earlier Main Agent refusal enclosed in a complete JSON fence exposed a separate presentation defect; strict fenced response parsing now displays the refusal and never synthesizes an execution action.

Desktop report display, Markdown copy, long-content scrolling and saved Worker selection were exercised. The copied report was opened as text and its beginning and end checked. Physical trackpad hardware and a live fixed retest were not exercised in this pass. Synthetic boundary tests cover exact/over-cap acquisition, bounded file reads, UTF-8, storage failure, conservative completion and report rendering. Final verification: 228 security tests in 25 files passed; seven artifact gates and two aggregate checks passed; focused lint, persistence-change verification and four bilingual pairs passed. Native restart retained all saved observations. Final screenshots: `/tmp/jw-report-live-top.png`, `/tmp/jw-report-live-acquisition.png`, `/tmp/jw-report-live-end.png`; preflight UI evidence entries 58–60. Copied artifact: `/tmp/jw-real-investigation-report.md`. Native download-button delivery was not exercised; Markdown copy and final text were verified.

The repository-wide client-i18n check remains red with 87 findings in other UI/Host copy, including existing preview key literals and setup/findings messages. No `TaskSavedReport` or response-capture source appears in that diagnostic list. These unrelated findings were not rewritten as part of this change.

## Planner and Worker token headers, 2026-10-18

ARTEX's session header uses input, cache-read and output counters with exact cache-write details. The saved-task header now uses the same compact grouping, consuming existing Session projection baselines and live control updates without opening an Agent or starting inference. Planner aggregates distinct task-owned plan Sessions; the selected Worker includes its own follow-ups. Native cumulative snapshots are replacements, and generic measurements require an actual usage observation. Missing measurements remain unavailable instead of becoming zero. Header metrics wrap under long titles without overlapping.

Native UI values were checked independently against retained Session logs: 11 Planner Sessions totaled input 514,484, cache reads 157,282, cache writes 1,380,716 and output 24,388. Worker `f51674cc-4ade-4f84-a85d-14476d96d5a9` reported input 43,511, cache reads zero, cache writes 130,034 and output 1,660. Switching from Worker to Planner preserved both scopes, 1024-pixel viewport labels did not overlap, and reading headers left execution, plan and Worker records byte-for-byte unchanged. No new target or provider request was started. Read-only source reproduction: `/tmp/jw-security-token-usage.py`; browser verification: `/tmp/jw-token-ui.mjs`; outputs: `/tmp/jw-token-ui-results.json`.

Verification: 234 security tests in 26 files passed, including six token-header aggregation/component tests. Seven artifact gates, two final aggregate checks and focused lint passed. A test fixture's strict optional-property type error was fixed before the final aggregate check; production source was unchanged. Screenshots: `/tmp/jw-planner-tokens.png`, `/tmp/jw-worker-tokens.png`, `/tmp/jw-worker-tokens-compact.png`; header crops `/tmp/jw-planner-token-header.png` and `/tmp/jw-worker-token-header.png`. Actual saved Claude usage and reported-zero display were checked in the native app; unavailable-data and live projection replacement were covered with component fixtures rather than additional paid model calls.

## Asset coverage verification — 2026-10-18

Verified the real saved 今日飲み task in the native desktop app at 1440×1000 and 1024×768. One registered eligible domain with saved HTTP observations produces 1/1 observed (100% reach), explicitly distinct from completed diagnosis. Checked asset selection, independent detail scrolling, Worker navigation, pointer-anchored pinch, two-finger pan and fit. Compact details hide the overlapping legend; graph controls remain visible. Investigation, planning and Worker storage remained unchanged while viewing. Screenshots: `/tmp/jw-coverage-details.png`, `/tmp/jw-coverage-compact.png` (registered with verify.py ui). Focused security suite: 256 tests in 29 files passed; artifacts 7/7 and aggregate checks 2/2 passed. Multi-asset folding, empty/unknown scope, stale reads and retained error data were verified with fixtures/tests rather than a new live investigation.

## Investigation stabilization — 2026-10-18

The real desktop Main Agent header resumed the failed 今日飲み execution without changing its original record or repeating its four saved GET operations. The first live review exposed missing item fields; the full per-mode response contract now covers those fields and has a reproduction test. A subsequent real Claude Planner review continued successfully, dispatched three new scoped anonymous GET observations and reached needs-input at the inherited three-round limit. Two new Workers completed; the account-deletion HTTP 200 observation retained an invalid-JSON model failure. That historical failure remains unchanged. Worker syntax/schema correction was then added and verified with controlled malformed responses, one-HTTP-only assertions, proof rejection, cancellation and shared deadline tests; no claim is made that the old failed Worker was repaired retroactively.

The native Report tab shows the latest execution, localized round-limit stop reason and unresolved observations without claiming diagnosis completion. The Main Agent disables continuation for needs-input and directs the owner to Overview. Status notices stay inside the main conversation column so they do not squeeze the chat. Screenshots: `/tmp/jw-stability-resume-ready.png`, `/tmp/jw-stability-report.png`, `/tmp/jw-stability-report-end.png`, `/tmp/jw-stability-needs-input.png`. The report's beginning and end were inspected. Focused security regression: 292 tests in 29 files passed; the final notice-placement change also passed 23 Session tests. Artifacts and aggregate checks passed. Session persistence verification reports no declared type changes. No branch, commit, push or release was performed.


## Local vulnerable application verification — 2026-10-18

Created a loopback-only ProjectDesk fixture at http://127.0.0.1:43187 using synthetic settings and users. Registered a separate company, service asset and task `790d133c-f472-4455-9183-c607d0c0a27b` through the native desktop UI. The real Main Agent completed all five checklist items; it used Claude Sonnet 4.6 for successful delegation and selected Claude Sonnet for Planner and Workers. The owner explicitly approved this test’s synthetic conversation sharing only. No expected routes, secrets, findings or direct record edits were provided to the models.

The live test exposed exact-phrase operation compilation failures. Anonymous GET, denied mutation/credential use and service-origin-only restrictions now map narrowly to capabilities enforced by the existing transport. Unknown phrases and reversed permissions remain rejected. Initial investigation correctly stopped at ten requests before validating paths discovered in robots.txt. The owner-facing setup and development host budget were then raised to twenty; profile watching interrupted an intervening run, whose history remains retained. Reopening the screen cleared its uncertain operation state.

Final execution `0810eb5a-60ae-46d9-9954-cb109feba727` completed after nineteen real Workers and two review rounds, within twenty requests and ten minutes. Planner review independently selected the discovered routes. Anonymous HTTP 200 evidence fully captured `/debug/config` (213 bytes) and `/api/admin/export` (230 bytes). Findings `45cb9977-5f82-40ad-b68f-2b6527ab9e08-finding-0` and `6469d0d7-2e8a-42eb-a84f-fa4cc41a35d4-finding-0` are high severity: exposed synthetic database/API settings and exposed synthetic users/reset tokens. An earlier informational robots-path finding is retained separately. The models, HTTP acquisition, finding import and final completion were real; deterministic fixture tests are separate evidence.

Verification: 303 security tests in 31 files, seven artifact checks, two aggregate checks, focused lint and git diff checking passed. Existing shortcomings observed without rewriting history: occasional malformed Main Agent JSON, duplicate initial probes when starting a new run, and uncertain operation display after host restart. Fixed-mode fixture responses have deterministic HTTP coverage; live repair-and-retest was outside this discovery test.

Final native screenshots: `/tmp/jw-lab-findings.png` (high severity findings, preflight entry 68) and `/tmp/jw-lab-report.png` (completed execution with nineteen confirmed operations, entry 69). The local app and saved task remain available for inspection.

The report was copied using the real UI and saved as `/tmp/jw-lab-report.md` (23,701 characters); its beginning and end were opened and inspected. It records completed execution, both HTTP 200 leaks, no retests and the retained anonymous GET limits.


## Executive report presentation — 2026-10-19

Reference: user-provided executive report image, interpreted as eight sections in one vertical scroll rather than two newspaper columns. Existing Button, Tag, product icons, semantic theme colors, radius and hairline tokens are retained. The pure projection derives active risk separately from coverage, excludes dismissed findings and keeps fixed history out of unresolved totals. No business losses, dates, comparison periods or unsupported vulnerability classes are generated. Existing full technical Markdown remains the export format and is folded below the executive display.

Native verification used saved local task `790d133c-f472-4455-9183-c607d0c0a27b`: three saved/active findings, two high and one information, zero fixed; these values were independently recounted from saved records. All eight sections are reachable, technical details toggle, and runtime errors are zero. Desktop widths 1440 and 1024 have no document-wide horizontal overflow; the table scrolls locally. The old zero-finding task retains incomplete coverage and does not claim safety. Seven security JSON files remained byte-for-byte unchanged across viewing. Dark colors were checked by temporarily applying the existing body theme attribute, without saving a preference; original theme and viewport were restored.

Screenshots: `/tmp/jw-executive-top.png`, `/tmp/jw-executive-risk.png`, `/tmp/jw-executive-scenario.png`, `/tmp/jw-executive-bottom.png`, `/tmp/jw-executive-compact.png`, `/tmp/jw-executive-empty.png`, `/tmp/jw-executive-dark.png`; top, compact, empty and dark are preflight entries 70–73. The real copied technical report `/tmp/jw-executive-report.md` has 23,701 characters; its beginning and end were opened and verified. Reference sections, existing theme fidelity, wrapping and scrolling have no remaining P0/P1/P2 findings. Final result: passed for the changed native report presentation.

Verification: 311 security tests in 33 files, focused lint, final combined build with nine artifact/aggregate checks, diff check and paired documentation checks passed. The broad GUI run has 30 failures in 11 files outside the focused security suite; new report CSS deviations found by its style contracts were corrected. Focused global style rechecks retain four failures from existing other sheets, with neither report sheet in their diagnostics. The broad Web replay outcome is recorded separately below and must not be treated as passed. No release, commit, push or model call was performed for this presentation verification.

Broad Web replay finished with 176 failed files, 17 passed and one skipped; 169 tests failed, 48 passed and 541 skipped. The primary blocking error is the absent Playwright Chromium headless shell revision 1228, with secondary unconsumed replay fixtures after browser launch failed. This is not a passed Web regression suite. Native CDP verification used the running installed Electron application and succeeded independently; no browser binary, environment preferences or unrelated fixtures were changed to mask the failures.
