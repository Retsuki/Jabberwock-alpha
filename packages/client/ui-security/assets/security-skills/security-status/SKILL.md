---
name: security-status
description: "診断の進捗、準備不足、失敗、停止を確認する。「調査どうなった？」「診断を止めて」「この Worker に追加指示して」で使う。停止と送信は明示された場合だけ行う。"
---

# security-status

## 手順

1. `read` の `checklist`、`executions`、`planners`、`workers`、`retests` を確認する。現在状態、不足条件、保存されたエラーを分ける。承認待ちを推測しない。詳細は `open` の `view:"sessions"` で案内する。
2. 状況確認だけなら読取で終える。停止が明示された場合は `stop` に `taskId` を渡し成功応答を待つ。失敗・結果不明を停止完了と扱わない。
3. 追加指示が明示された場合は `workers` から受信者を特定し、複数なら確認する。`message` に `taskId`、`requestId`、既存Workerの `runId`、`text` を渡す。同一要求の再送では `requestId` を保持する。Plannerには送れない。
4. `accepted:true` は受理であり完了ではない。受信者IDと受理状況を示す。追加指示で許可範囲を広げない。

全体、Planner、Worker、再検証の状態を混同せず部分失敗も残す。開始・再開が明示されたときだけ `security-investigate` を使う。
