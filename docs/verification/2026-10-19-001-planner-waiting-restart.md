# Waiting Planner record restart verification

English | [中文](2026-10-19-001-planner-waiting-restart.zh.md)

## Observation

The native task showed an execution-read error and disabled investigation start after restart. The configured desktop home and task asset remained unchanged. Saved planning storage contained 32 plans, including one ready continue decision with no new items, two captured ongoing Workers and no stop identities.

## Hypotheses and evidence

A storage or profile mismatch would show missing task records; the expected task, assets and 32 saved plans were present. A reader rejection would occur if valid wait-only output was forbidden during initialization; the reader rejected every nonterminal ready plan without items, matching exactly the saved wait-only decision. Existing UI diagnostics did not expose this startup validation detail, so the saved domain structure and initialization predicate were inspected directly, without modifying data.

## Resolution

The startup reader accepts wait-only review plans only when an unstopped captured Worker remains, using the same validation as response admission. Empty initial proposals and invalid stop identities remain rejected. Focused restart regressions pass. Native recovery succeeds against unchanged records. The local Claude run executes six Workers, retains seven published facts and applies three Planner reviews; later Planner snapshots contain four and seven shared facts and explicitly cite them. Execution stops at the configured request budget with remaining work unverified. The native exploration view displays the committed facts and supporting links. The final UI also places newly published facts on the timeline using their recorded timestamp; legacy facts without a timestamp do not acquire invented events.
