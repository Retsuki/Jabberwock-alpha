---
name: security-plan
description: "Planner に調査計画を依頼・修正したいときに使う。「計画だけ作って」「プランナーに方針を考えてもらって」に対応し、調査を開始せず計画を保存する。"
---

# security-plan

## 手順

1. `read` の `planners`、設定、`checklist`、`revision`、`modelCatalog` を確認する。タスクが無ければ `security-task` で作成する。準備条件が不足していれば不足分だけ設定する。
2. Planner が自動モードなら `modelCatalog.planner` の利用可能な非 `default` モデルを選び、`modelDecision:{engine,model,reason}` を渡す。固定モードは保存済み設定を使う。自動選択を固定設定へ変更しない。
3. `plan` に `taskId`、一意の `requestId`、最新の `expectedRevision`、必要な `modelDecision` を渡す。同一要求の再送では同じ `requestId` を使い、競合時は再読込する。`start` / `resume` は代替にしない。`message` は Worker 宛てであり Planner には使わない。
4. 返却の `plans` にある ID と状態を示す。`planning` は受理・作成中であり保存完了ではない。`read` で保存済みの結果だけ確認し、失敗・中断はそのまま伝える。
5. `open` に `taskId` と `view:"sessions"` を渡し、計画を確認する導線を返す。

この操作は Planner の計画作成だけを依頼し、Worker の起動や対象へのアクセスは行わない。計画の作成を調査開始や結果の確定と取り違えない。
