# エンジン別権限の統合記録

## 実装とレビュー

Agentの共通ヘルパーで許可値・既定値・イベント保存と復元を定義した。Codexはask、auto-review、full-accessをそれぞれsandbox・approvalPolicy・approvalsReviewerへ変換し、thread/startまたはresumeとturn/startへ渡す。生成済み公式CLI型でturn/startのsandboxPolicy形式とauto_review値を確認した。ClaudeはSDKで定義されたpermissionModeを渡し、bypassPermissionsのみallowDangerouslySkipPermissionsを有効にする。

既存APIのsandbox/mode・approval/policyは変更しない。UIと/permissionは現在のエンジンへ追従する。UIはエンジン切替時に古い確認・選択状態を破棄する。派生会話のコピー履歴中にある高権限は適用しない。不正な保存値をFull accessなどへ置換せず拒否する。

## 実行した確認

`pnpm install --offline --ignore-scripts` が終了した。永続化生成は `event:engine/permission` の追加のみを報告した。`pnpm run dev:desktop` のemit-only変換・バンドルが終了しreadyを確認した。ローカルHostの起動ログを確認した。`git diff --check` は出力なしで終了した。

## 未確認

利用者指示に従って自動テスト・lint・型検査は実行していない。推論・権限昇格を伴う実コマンドも送信していない。実際のCodex/Claudeでの権限制限・自動承認・再開時の動作と画面の目視は未確認。実装上の配線とパラメータをレビューした範囲と、実動作の確認を区別する。開発アプリは起動したまま維持する。コミット・pushはしていない。
