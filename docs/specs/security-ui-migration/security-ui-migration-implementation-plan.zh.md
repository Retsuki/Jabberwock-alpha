# 安全界面迁移实施计划

[English](security-ui-migration-implementation-plan.md) | 中文

> 10 秒速览：分三个阶段将已迁移的安全视图接入现有工作区行。改动主要涉及 `ui-workspace` 与 `ui-security`。不计划新增界面依赖、Host 数据库、Session 格式、认证或实际诊断执行。

## 1. 工作区导航

- [x] 在 `packages/client/ui-workspace/src/client/` 提供 `sidebar.workspaces.project.children`，传入工作区 ID 和显示标题。
- [x] 在 `packages/client/ui-security/src/client/index.ts` 注册 Security 折叠菜单；按工作区 ID 与视图将 Assets、Tasks、Vulnerabilities 和 Agents 导向主面板。
- [x] 从用户流程移除全局 Security 入口和独立项目选择器；保留现有聊天导航。

## 2. 隔离的草稿状态

- [x] 在 `jabberwock.security.v1` 下使用 `workspace:${workspaceId}`；新工作区为空，并保留所有独立旧项目值。
- [x] 安全标题跟随当前工作区名称，保留现有目标注册及诊断与发现详情。
- [x] 保留执行未连接提示和现有组件样式；不新增 shadcn 依赖。

## 3. 审阅与保全

- [x] 在桌面检查折叠菜单选择、四种视图、父级展开、导航选中状态及现有聊天。
- [ ] 在桌面检查跨工作区切换、重命名和扁平与搜索显示；这些目前仅有代码审阅。
- [x] 确认空工作区视图，以及旧 Acme/internal 保全和工作区命名空间创建的布尔检查。
- [ ] 通过新工作区入口重新检查注册和重新加载恢复；先前观察属于记录 005。
- [ ] 决定是否可将原型移到废纸篓之前，清点暂缓功能及所需资料和数据。

## 暂缓清单

G6 覆盖可视化、Next.js 专用聊天、实际 AI 与诊断执行，以及浏览器源数据导入均不在本次迁移范围。需要新组件依赖的界面保持暂缓，待用户审阅。满足验证和保全条件之前保留 `jabberwock2/`。

## 验证记录

[初次迁移记录](../../verification/2026-10-17-005-security-ui.zh.md)记录先前的全局面板实施，并不验证工作区折叠菜单。在[工作区导航记录](../../verification/2026-10-17-006-project-security-menu.zh.md)中记录当前检查，并遵循用户对自动运行测试的限制。未经要求不提交或 push。
