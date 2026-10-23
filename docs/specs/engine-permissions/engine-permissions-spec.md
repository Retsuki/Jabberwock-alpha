# エンジン別の実行権限

> 10秒サマリー: 権限メニューを選択エンジンに合わせて切り替え、API実行・Codex・Claudeの設定を会話ごとに独立保存する。公式実行パラメータまで接続する。DB変更なし、新イベント追加。既定は制限付きの手動承認。

## 操作

1. モデルを選ぶと、その実行エンジンの権限が表示される。
2. 初回のCodexはAsk for approval、ClaudeはDefaultとなる。標準APIは従来設定を保持する。
3. CodexはAsk for approval、Approve for me、Full access。ClaudeはDefault、Accept edits、Plan、Bypass permissionsを提供する。
4. エンジンを切り替えて戻ると同じ会話内で前回の設定を復元する。別エンジンや新会話へ権限昇格を引き継がない。
5. 高権限モードは既存GUIのリスク確認を通す。実行中の変更は次のターンから適用する。

## 保存と実行

`engine/permission` にengineとpresetを保存する。ネイティブ設定では既存のsandbox/modeとapproval/policyを変更しない。既存API側の権限は従来どおり。権限メニューと/permissionコマンドは同じホスト検証を通す。不明なモードは拒否し、別モードへ黙って置換しない。

Codexはスレッド作成・再開とターン開始でsandbox・approvalPolicy・approvalsReviewerを明示する。Approve for meはworkspace-write境界を保ち、auto_reviewを使う。Full accessはdanger-full-accessとnever。ClaudeはpermissionModeと必要な明示的オプションを渡す。ネイティブ承認の範囲を超える独自の無条件許可は加えない。

## 互換性と確認

古い会話のネイティブ設定未記録は手動承認の既定で読み取る。投影の旧キャッシュはstateVersion更新で再構築する。新しいイベントを含む会話の旧ビルドへの降格制限を記録する。利用者指示により自動テスト・lint・型検査は実行せず、ソースレビューと必要な開発用変換・起動の範囲を報告する。実推論は送信しない。
