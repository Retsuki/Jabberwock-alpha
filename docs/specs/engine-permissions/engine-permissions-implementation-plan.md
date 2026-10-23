# エンジン別実行権限の実装計画

> 10秒サマリー: 3段階で保存・実行、ホスト、UIを接続する。約15ファイルと生成物。DB変更なし、新イベントあり。環境変数追加なし。

## 1. 保存と実行

- [x] `packages/core/agent/src/engine-permissions.ts` に許可値と会話別復元を定義する。
- [x] `packages/core/subscription-engines/src/codex.ts` と `claude.ts` で次ターンの実行パラメータへ反映する。

## 2. ホストと画面

- [x] `packages/interaction/permission-presets/src/index.ts` の投影と/permissionをエンジン別にする。
- [x] `packages/client/ui-permission-presets/src/client/` のメニュー、確認、slash表示を現在エンジンへ追従させる。
- [x] 別エンジンへの権限継承、UIの古い確認状態、APIの既存権限の改変を防ぐ。

## 3. 統合

- [x] workspace依存・永続化スキーマと対応記録を生成する。
- [x] ソース差分をレビューし、開発用変換と起動を確認する。
- [x] 実推論・UI目視・テストの未確認範囲を明示する。無断でコミット・pushしない。
