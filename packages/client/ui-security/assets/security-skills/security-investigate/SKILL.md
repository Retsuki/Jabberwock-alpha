---
name: security-investigate
description: "診断タスクの調査開始・再開を依頼されたときに使う。「このタスクの調査を開始して」「中断した診断を再開して」に対応する。計画だけ、状況確認、結果表示には使わない。"
---

# security-investigate

## 手順

1. タスクが無ければ `security-task` で準備する。ローカル解析を外部対象の許可に読み替えない。
2. `read` の `revision`、`task`、`checklist`、`executions`、`modelCatalog` を確認する。`goal`、`scope`、`permission`、`operations`、`limits` 全てが必要。不足分だけ設定フローで解消する。同じ調査が実行中なら重複開始しない。新規実行は `executionLimits`、再開は対象の `executions` 行の `limits` を参照する。その `maxRounds`、`maxRequests`、`timeoutMs`、`maxConcurrentWorkers` が実効上限であり、`task.setup.limits` の文章は実行設定ではない。依頼された上限を保証できない場合や実効上限を取得できない場合は開始・再開せず、必要なHost設定の変更と現在値を説明する。
3. Host は現在のオーナー発言に明示的な開始・再開指示を要求する。過去の指示、単なる設定回答、能力の質問では開始しない。拒否理由を説明し指示を捏造しない。
4. Planner が自動モードなら `modelCatalog.planner` の利用可能な非 `default` モデルを選び `modelDecision:{engine,model,reason}` を付ける。固定モードでは保存済み設定を使い決定を省略する。自動選択で固定設定を変更しない。
5. `start` に `taskId`、`requestId`、最新の `expectedRevision` を渡す。必要な場合だけ実在の `planId`、許可範囲内の `targets:[{assetId,url}]` を付ける。再開は `resume` に同じ基本項目と保存済み対象実行の `resumeRunId` を渡す。IDやURLを推測しない。
6. 応答の `runs` から受理されたID・状態を示し `open` の `view:"sessions"` を返す。受理・実行中は完了ではない。

`requestId` は操作ごとに一意、同一要求の応答不明・再送では保持。競合は再読込で解消する。結果不明の操作を新IDで重複開始しない。拒否を別ツールで回避しない。

この操作ツールにはHostの実効上限を変更する機能はない。変更画面の存在や手順を確認できない場合は、画面で変更できると案内せず、必要な設定値と未対応の操作を説明する。
