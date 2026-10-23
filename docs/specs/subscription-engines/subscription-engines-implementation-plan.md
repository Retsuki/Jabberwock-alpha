# サブスク実行エンジン実装計画

> 10秒サマリー: 4フェーズでCodex/Claudeの主チャット実行を導入する。新規パッケージと既存Agent/API/設定UIの約20ファイルが対象。DB変更なし。既存LLMモデル経路と保存済み会話を維持する。

## 1. エンジンと接続管理

- [x] `packages/core/agent/src/execution-engines.ts` と `engine-types.ts` に実行・接続の型を定義する。
- [x] `packages/core/subscription-engines/` にCodex app-serverとClaude Agent SDKの実行を実装する。
- [x] 認証種別照合、APIキー排除、ネイティブ会話の保存、停止、承認を実装する。

## 2. AgentとAPIの接続

- [x] `packages/core/agent-loop/src/engine-step.ts` に独立した実行経路を設ける。
- [x] `packages/core/agent-loop/src/agent.ts` はエンジン選択を解決し、通常LLM処理と分離して委譲する。
- [x] `packages/api/session-controller/src/catalog.ts` と `commands.ts` にエンジンの選択・検証を接続する。
- [x] `packages/api/session-controller/src/index.ts` と `types.ts` に安全な接続APIを追加する。

## 3. UIと組み込み

- [x] `packages/client/ui-settings-models/src/client/SubscriptionConnections.tsx` と既存Models画面を接続する。
- [x] `packages/client/ui-model-selection/src/client/service.ts` で接続状態変更時のカタログ再取得を行う。
- [x] `packages/bundle/base/package.json` と `cordis.patch.yml`、コンパイル参照に新パッケージを登録する。

## 4. 起動確認

- [x] 依存を既存ロック版に揃えてインストールする。
- [x] emit-onlyとbundleを行い、開発アプリを再起動する。
- [x] 自動テスト・lint・型検査は実行せず、実施した範囲と未確認事項を報告する。

## 注意事項

APIキーへの自動切替、トークンの転用、無条件の権限バイパス、既存会話の破棄、コミット・pushはしない。認証は本人による公式フローとし、認証できていない状態を接続済みにしない。

## 実施した確認と残件

起動用のemit-only・bundleとアプリ／Hostの起動を確認した。型検査・lint・自動テスト・画面の目視・ログイン後の実推論は未実施。起動ログのトークンを使った内部API照会は、自動承認レビューが通常UI以外の資格情報利用として拒否したため実行していない。本人による設定画面の接続確認が必要。
