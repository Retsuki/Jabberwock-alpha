---
name: security-task
description: "診断タスクを作成・設定する。「このプロジェクトを解析したい」「診断タスクを作って」「調査条件を変えて」で使い、登録資産と既存タスクを確認して下書きを保存する。"
---

# security-task

## 手順

1. ローカルソースレビューとリモート診断が曖昧なら確認する。ローカル解析を外部対象の調査許可に読み替えない。同じ目的の既存タスクを確認し重複を避ける。未登録対象は画面での資産登録を案内する。
2. 新規作成は `create` に `name`、登録済み `assetIds`、`requestId`、最新の `expectedRevision` を渡す。
3. 合意した設定だけ `update` で保存する。引数は `taskId`、`requestId`、最新の `expectedRevision`、`patch`。既知の設定を聞き直さず不足分だけ確認する。
4. 保存結果のタスク名・ID・残る準備条件を伝え、`open` に `taskId` と `view:"overview"` を渡す。作成・設定だけでは開始しない。

`patch` は `name`、`description`、`objective`、`assetIds`、`goals`、`constraints`、`scopeRules`、`setup`、`agentModels`、`agentModelModes` の必要な項目だけ含める。配列と入れ子の更新では既存値・IDを保持する。

- `goals`: `{id,text}` の配列。
- 対象ホスト・URLの限定や除外は `scopeRules` に保存し、操作制約の自由文として重複保存しない。許可範囲の意味を変えず、操作はHostが対応する表現（例: `GET only`）にする。表現できない制約は削除せず、対応できないことを伝える。
- `constraints`: `{id,action:"allow"|"deny",text}` の配列。GETのみの許可は `GET only` と保存する。未承認の操作を加えない。
- `scopeRules`: `{id,action:"allow"|"deny",kind:"domain"|"ip"|"cidr"|"url",value,note}` の配列。説明なしの `note` は空文字。新規項目は一意の非空ID。空配列は登録資産の範囲を使い、範囲を無制限にしない。
- `setup.limits` は停止条件などの説明文で、実行回数・時間の機械的な設定ではない。`read.executionLimits` がHostの実効上限。依頼より緩い上限しか適用できないときは、上限が設定できたと言わず、調査開始を保留して違いを説明する。
- `setup`: `{completionCondition,permission:{assetIds,confirmed},scope:{assetIds,rules,confirmed},operations:{constraints,confirmed},limits}`。未設定なら全項目を用意し未回答は空文字・空配列・false。`scope.rules` は適用する `scopeRules` 配列のJSON文字列、`operations.constraints` は適用する `constraints` 配列のJSON文字列。
- `agentModels`: `planner` / `worker` ごとの `{engine,model}`。`main` の変更はこの操作では拒否されるため、メインAgentのモデル選択UIを案内する。`read` の `modelCatalog` 内の候補を使う。`agentModelModes` は `planner` / `worker` ごとの `auto` / `fixed`。一度の自動選択を固定設定にしない。

`setup` のtrue確認フラグを含む更新では、現在のオーナー発言で該当事項を明示的に承認した原文を `confirmationQuote` に渡す。原文が無ければ捏造せずHostの制約を説明する。変更不要な確認済み設定は保持する。

`requestId` は操作ごとに一意、同一要求の再送では保持。競合時は再読込する。保存確認前に完了と言わない。

この操作ツールにはHostの実効上限を変更する機能はない。変更画面の存在や手順を確認できない場合は、画面で変更できると案内せず、必要な設定値と未対応の操作を説明する。
