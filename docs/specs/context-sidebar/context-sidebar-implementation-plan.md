# 常時表示コンテキストパネル実装計画

> 10秒サマリー: Codex風の概要カードと詳細サイドバーを分離する。3フェーズ、約15ファイル。DB変更なし。新しい会話イベントを追加するため永続化変更を記録する。環境変数追加なし。

## 1. 使用量の観測と保存

- [x] `packages/core/agent/src/engine-types.ts` に共通のスナップショット型を定義する。
- [x] `packages/core/subscription-engines/src/` で公式Codex通知、Claude SDKの応答とsummaryを取得し、`engine/usage` を保存する。
- [x] `packages/llm/token-meter/src/` で `engineUsage` 投影を登録する。

## 2. 常設概要

- [x] `packages/client/ui-sidebar-right/src/client/` に概要カードを置き、クリックで既存DockLayoutの使用状況タブへ切り替える。
- [x] 通常幅では概要から始め、詳細表示中は概要を隠し、狭い幅のfullscreen動作を維持する。
- [x] en/zhのロケールを揃える。上限0、未取得、上限超過、エンジン切替を扱う。

## 3. 統合

- [x] 永続化変更の生成物と記録を更新する。
- [x] 差分をレビューし、開発用の変換と起動ログを確認する。
- [x] UIの目視可否と未検証範囲を明記する。利用者指示によりテスト・lint・型検査は実行しない。

## 注意事項

既存の認証・権限・サンドボックスを変更しない。未知の値を0にせず、累積値を現在コンテキストとして表示しない。ネイティブ実行時に既存API側の推定を現在値として流用しない。キャッシュと入力・推論と出力を重複加算しない。OutputsやSubagentsなど、参考画像の他の機能は追加しない。

## 利用者の訂正を反映した変更範囲

`packages/client/ui-layout/src/client/` は一時的な概要幅を詳細の保存幅と分離する。概要表示時の余白は300px、カード自体は280pxとする。自動で詳細を開く処理は撤回する。

## チャット内配置の修正

`ui-conversation` の `conversation.content` に session scope の概要slotを追加する。ヘッダーには影響させず、scrollBodyの既存会話・入力欄と同じスクロール領域へ配置する。本文幅計測とドラッグ用ハンドルは概要表示中の余白を考慮する。外側のlayout専用状態は撤去する。詳細タブを開く動作と既存のサイドバーボタンは維持する。
