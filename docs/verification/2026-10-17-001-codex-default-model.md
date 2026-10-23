# Codex default の実行失敗

## 状態

原因判定済み。修正の起動用ビルドとアプリ／Hostの再起動を確認した。ユーザーによる実応答の確認待ち。

## 観測

2026-10-17 12:52のユーザー操作1件で、Codex default に「このプロジェクト把握できる？」を送信すると `Codex turn ended: failed` となった。ログイン状態の検証を通過した後、ネイティブ会話の task_complete は HTTP 400 と、`gpt-6.1-sol` がChatGPTアカウント経由のCodexで非対応という具体的なエラーを記録していた。画面への変換処理が turn.error を捨て、failed のみ表示していた。

## 仮説と判定条件

1. 認証失敗: account/read が未認証、または認証エラーなら採用。実際は認証済みの検証を通過してモデル非対応の400なので不採用。
2. default がユーザー設定の非対応モデルを継承: 要求モデルが公式CLIカタログ外であり、default指定がネイティブ要求に未指定なら採用。両方を確認し採用。
3. 通信・権限・実行環境の別要因: モデル解決後にも失敗した場合、具体的な turn.error をもとに再調査する。

## 計測と実施結果

ネイティブ記録の task_complete.error と turn_context.model のみを読み、認証情報ファイルは読まなかった。公式Codex CLI 0.153.4のapp-serverに initialize と model/list だけを送り、モデルへの推論は送っていない。

model/listは4件を返した。既定は `gpt-6-astra`、他は `gpt-5.6-sol`、`gpt-5.6-terra`、`gpt-5.6-luna`。`gpt-6.1-sol` は含まれていなかった。一覧は利用権限の最終保証ではなく、成功した推論の代用にはしない。

## 修正

`packages/core/subscription-engines/src/codex.ts` と `index.ts` で、defaultをmodel/listのisDefaultから解決し、thread開始・再開とturn開始へモデルを明示する。個別モデルはカタログ内の存在を確認し、非対応の場合に別モデルへ自動変更しない。失敗時は turn.error の具体的なメッセージを画面へ伝える。

## 検証範囲と次の操作

自動テスト・lint・型検査はユーザー指示により実行しない。起動用emitとbundle、アプリ／Hostの再起動を確認した後、ユーザーに同じチャットから再送してもらう。認証トークンを起動ログから取り出す内部API照会は前回の自動承認レビューで拒否されており、今回も行わない。
