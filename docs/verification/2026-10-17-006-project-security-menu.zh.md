# 项目内安全导航验证记录

[English](2026-10-17-006-project-security-menu.md) | 中文

## 范围

本记录针对从现有 workspace/project 行的 Security 折叠菜单进入资产、任务、漏洞和代理的改动。按 workspace ID 隔离数据，新工作区从空状态开始。保留旧独立 Security 项目的存储值。

## 已执行检查

集成担当在1280×820实际桌面依次从现有 jabberwock 项目下的 Security 打开 Assets、Tasks、Vulnerabilities 和 Agents，确认对应主标签及 aria-current。折叠菜单关闭再打开后父 workspace 展开状态仍为 true，现有聊天 contenteditable 输入框可见，返回聊天后 Security 导航 active 数为0。记录时应用保持启动，显示菜单展开的资产0件画面。

不显示存储内容的限定布尔检查中，`legacyAcmePreserved`、`legacyInternalPreserved` 和 `workspaceNamespaceCreated` 均为 true。全局 `build:check` 通过两项检查，日志位于 `/tmp/jw-project-menu-build-check.log`。两个目标包的 TypeScript 检查、lint 和分别打包成功。两对目标文档的翻译整合检查成功，`git diff --check` 没有输出。未执行测试套件。

截图为 `.local-runtime/verification/2026-10-17-project-security-menu/menu.png`。在 `verify.py ui` 中登记画面 `プロジェクト配下のセキュリティメニュー` 和边界条件 `資産0件1280px幅`。初次迁移的历史结果保留在 [005](2026-10-17-005-security-ui.zh.md)。

## 未确认事项与限制

本地只有一个实际 workspace，跨 workspace 同时切换、重命名及 flat/search 显示尚未在实际应用确认，仅有代码审阅。本记录不声称通过新入口重新验证资产注册和重新加载恢复。

由于 ui-security 到 ui-workspace 的类型依赖边，同时使用多个 pnpm filter 为两个包启动 bundle 时，scheduler 会因依赖循环拒绝执行。按单独 filter 顺序打包均成功。标准构建使用根目录 tsc 和 tsdown，不使用该 pnpm scheduler。本次标准检查和实际应用启动成功，但多个 filter 同时执行的限制仍存在。

实际诊断、AI 执行和 G6 图仍未连接。未新增 shadcn 依赖。完成必要资料与数据保全判断之前保留 `jabberwock2/`。未提交或 push。
