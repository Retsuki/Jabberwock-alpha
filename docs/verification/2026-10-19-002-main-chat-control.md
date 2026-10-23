# Main-chat security control verification

English | [中文](2026-10-19-002-main-chat-control.zh.md)

## Scope

The native desktop application used a new ordinary main chat with Claude Sonnet 5.5. Session `session-0a7b5b36-7b77-4de6-95e6-c356fb403861` operated on synthetic task `0bd34466-6c4d-4c63-a7c4-340bbea86cd6` for the registered local fixture at `http://127.0.0.1:43188`. No external target investigation formed part of this test.

## Observed controls

Recorded native host-tool calls successfully listed tasks, created the synthetic task, updated it, read its state, returned explicit task navigation and stopped the idle task. The task button opened the actual overview and task Sessions; the overview displayed the saved objective and description. Planner and Worker model selections were saved as fixed Claude `sonnet` choices.

An initial setup confirmation failed because model-serialized fingerprints differed from the Host representation. Shared `normalizeSecuritySetup` now derives those fingerprints on the Host. The repeated update succeeded at revision 31, and the native checklist displayed all five confirmed items. This result does not establish that target investigation started.

## Investigation boundary

The explicit investigation-start message reached Claude, but Claude refused and no `start` host-tool call was recorded. Saved execution, plan and Worker counts remained zero. No safeguard workaround was attempted. Consequently this test verifies conversational reads, draft mutations, navigation and idle cancellation, but does not verify a running investigation, active cancellation, resumption or a live Worker follow-up from main chat. The operation delegation paths have focused tests; they are not substitutes for that missing model-driven end-to-end result.

Codex native control has no compatible host-tool bridge. Actual DeepSeek main-chat model execution was not tested; its Harness adapter is covered by focused tests.

## Checks and evidence

The final focused run passed 61 tests in five files (`/tmp/jw-main-tests-final.log`). A separate regression run passed 68 tests in three files; it overlaps the focused run and the counts must not be added. The latest artifact build passed seven checks (`/tmp/jw-main-build-last.log`). The final build check passed two checks (`/tmp/jw-main-build-check-last.log`). Added code passed focused lint (`/tmp/jw-main-newcode-lint.log`). Client lint still reports eight existing `sessions.retain/refresh` type errors in `client/index.ts`; repository-wide documentation validation also has existing failures. These are recorded limitations, not passing checks.

Registered native screenshots show [main-chat operations](../../tasks/verify/2026-10-19-214043-メインチャット-セキュリティ操作.png), [the saved task overview](../../tasks/verify/2026-10-19-214043-メインチャットから更新したタスク概要.png), and [the five-item checklist](../../tasks/verify/2026-10-19-214043-メインチャットから確認済み設定を保存.png). The screenshots demonstrate saved task control; they do not show an executing Worker.
