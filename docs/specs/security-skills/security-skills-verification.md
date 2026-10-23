# Security skills verification

English | [中文](security-skills-verification.zh.md)

## Summary

The product packages five workflows in `ui-security/assets/security-skills`, uses the existing registry and loader, and exposes plan-only control through the existing planning owner. The package archive includes all five `SKILL.md` files and the shared instructions. No repository-local development-skill installation is required.

## Automated evidence

On 2026-10-20, 206 focused tests across 14 files passed, including skill policy and disposal, Loader registration, cross-workspace lookup, plan-only routing, bounded failures, native Host tools, cancellation, resume catalogs and existing setup admission. Artifact build passed seven gates; the following aggregate build check passed both compiler gates. Five skill format validations and five affected documentation pairs passed. Persistence verification matched 70 roots against 20 history records; no persisted record format changed.

## Provider evidence

| Route | Evidence | Remaining verification |
|---|---|---|
| Harness model tools | Shared registry, scoped loader and security-control routing tests | No configured API model was available in the isolated app; no real DeepSeek API request was made. |
| Claude Sonnet 5.5 | Real desktop task creation, configuration, planning, status, start, stop and report navigation; calls and results checked in saved Session events | Investigation was stopped when its configured Host limits differed from the requested bounds; no target HTTP request was observed. |
| Codex subscription | Real `gpt-6-astra` desktop run after one-time synthetic-history approval: `security-report` loading, `security_control` list/read/open and report-button navigation; engine and calls verified in saved Session events | This report-only request completed without starting investigation or retesting. |
| Isolated task routes | Existing conversation-only and Worker capability policies remain separate | No new Host capabilities are granted by product skill discovery. |

A final desktop check loaded the updated investigation instructions, read the effective limits and declined the stricter requested start. Saved events contain the read operation and no new start operation for that request. Explicit invocation bodies and the native description catalog were also present in saved Session events.

## Observed limitations

`task.setup.limits` is descriptive text. New execution limits come from Host configuration; resumed executions retain their saved limits. Control reads expose both, and the investigation workflow checks them before dispatch instead of claiming that text changes the execution budget. Per-task machine-enforced limit configuration is outside this change.

The existing owner-intent parser rejects an entire message containing certain negative phrases, even when the phrase restricts targets rather than cancels investigation. A separate unambiguous start instruction reached the existing execution owner; no authorization check was weakened.

Selecting Codex immediately before the first message produced an initial Claude request followed by the saved Codex selection. This first-turn selection behavior was observed in existing model-selection code and remains outside this change. After explicit one-time approval, the subsequent Codex request completed with saved `engine: codex` and `gpt-6-astra` evidence. Screenshots: `/tmp/jw-security-skills-codex-verified-chat.png` and `/tmp/jw-security-skills-codex-verified-report.png`.

The repository-wide package check still reports existing subscription-engine publication metadata, web-fetch package file-list and remote Client project-reference inconsistencies. The security package's asset distribution check passes. The full generic preflight suite was interrupted; the focused tests and explicit build checks above are the verification evidence.
