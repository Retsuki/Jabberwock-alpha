# プロジェクト配下のセキュリティ導線の確認記録

English | [中文](2026-10-17-006-project-security-menu.zh.md)

## 対象

既存workspace/project行のSecurityアコーディオンから資産・タスク・脆弱性・エージェントへ遷移する変更を対象とする。workspace IDごとにデータを分離し、新規workspaceは空で始める。旧独立Securityプロジェクトの保存値は保全する。

## 実行した確認

統合担当が1280×820の実デスクトップで、既存jabberwockプロジェクト配下のSecurityからAssets・Tasks・Vulnerabilities・Agentsを順に開き、対応するメインタブとaria-currentを確認した。アコーディオン閉開後も親workspaceの展開状態はtrueで、既存チャットのcontenteditable入力欄は表示され、チャットに戻るとSecurityナビゲーションのactive件数は0になった。記録時点ではメニューを開いた資産0件画面でアプリを起動維持している。

保存内容を表示しない限定した布ール検査で `legacyAcmePreserved`、`legacyInternalPreserved`、`workspaceNamespaceCreated` がすべてtrueだった。全体 `build:check` は2検査を通過し、ログは `/tmp/jw-project-menu-build-check.log` に残した。対象2パッケージのTypeScript検査・lint・個別バンドルが成功した。対象2対の翻訳整合性検査が成功し、`git diff --check` の出力はなかった。テストスイートは実行していない。

スクリーンショットは `.local-runtime/verification/2026-10-17-project-security-menu/menu.png`。`verify.py ui` に画面 `プロジェクト配下のセキュリティメニュー` と端境条件 `資産0件1280px幅` を登録した。初回移植の過去結果は [005](2026-10-17-005-security-ui.md) に残す。

## 未確認と制限

手元の実workspaceは1件のみのため、別workspaceへの同時切替、rename、flat/search表示は実機未確認で、コードレビューのみである。新導線からの資産登録と再読み込み復元の再確認は、本記録では成功を主張しない。

ui-securityからui-workspaceへの型依存辺により、複数pnpm filterで2パッケージのbundleを同時起動すると依存循環としてschedulerが拒否する。単独filterの順次バンドルは両方成功した。標準ビルドはrootのtscとtsdownを使い、当該pnpm schedulerを使わない。今回の標準検査と実アプリ起動は成功したが、複数filter同時実行の制限は残る。

実診断・AI実行とG6図は未接続のまま。新しいshadcn依存を追加していない。必要資料とデータ保全の判断が済むまで `jabberwock2/` は保持する。コミット・pushはしていない。
