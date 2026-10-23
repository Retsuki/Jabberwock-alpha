# 安全持久化实施计划

[English](security-persistence-implementation-plan.md) | 中文

> 10 秒速览：分三个阶段，在约十二个实现及装配文件中实现重启后保留的资产与草稿任务记录。通过现有提供者新增一个安全存储域；保持旧浏览器记录、Session 格式及引擎权限不变。

## 阶段一：Host 存储与 Remote 命令

- [ ] 定义带工作区归属的版本化企业、范围、分类资产与任务草稿记录。
- [ ] 按现有存储域和 Remote 模式新增安全专用 Host 控制器。
- [ ] 在 Web/桌面 Host 装配中注册控制器并暴露类型化客户端 API。
- [ ] 验证持久输入与工作区存在性；等待写入完成并传播错误。

基础设施参考 `packages/workspace/workspace/src/spec.ts` 与 `packages/api/workspace-controller/src/index.ts`。新安全模块拥有自己的记录；不得向聊天代理循环或工作区注册表追加安全业务。

具体所有者文件为 `packages/client/ui-security/src/security-records.ts`（模式）、`packages/client/ui-security/src/index.ts`（Host 服务）及 `packages/client/ui-security/src/client/records-state.ts`（客户端快照和读取/保存操作）。

## 阶段二：现有页面集成

- [ ] 将 `packages/client/ui-security/src/client/ProjectAssets.tsx` 中挂载期间的演示状态改为工作区级加载与明确持久变更。
- [ ] 将 `packages/client/ui-security/src/client/TaskList.tsx` 连接到已保存草稿任务及任务创建。
- [ ] 通过 `packages/client/ui-security/src/client/SecurityPage.tsx` 传递工作区身份，并区分加载、空数据与错误状态。
- [ ] 将任务详情示例面板与持久任务元数据分开；禁用不可用的执行操作。

保留现有 UI 原语与主题变量。不得添加依赖、shadcn、自动示例种子、浏览器存储迁移或诊断执行服务。

## 阶段三：验证与文档

- [x] 通过 UI 创建企业、资产及带所选资产 ID 的草稿任务；停止 Host，以同一 `DSH_HOME` 重启，并在新浏览器中确认企业、资产、任务名称、描述、目标、草稿状态与所选资产。
- [ ] 验证编辑与删除的持久性。
- [ ] 验证两个工作区身份不共享记录，且旧浏览器值保持不变。
- [ ] 捕获真实桌面 UI，并检查窄屏操作。
- [x] 记录实际检查与剩余限制；实现确认后更新客户端 README 双语对。

已观察证据：`build:artifacts` 通过七个构建检查。恢复后的 UI 截图为 `/tmp/jw-persistence-assets-restored.png` 与 `/tmp/jw-persistence-task-restored.png`；主代理已通过 `verify.py ui` 登记 UI 证据。尚未演练并发窗口冲突与失败路径。

本阶段未获准运行完整测试套件。未观察到的验收项目保持未勾选；如实报告存储或启动阻塞，不得描述为验证成功。新增环境变量与破坏性迁移不在范围内。

## 任务概览编辑扩展

- [x] 在 `packages/client/ui-security/src/security-records.ts` 中添加可选类型化目标、操作约束和范围规则数组；接受空草稿行和旧记录缺失字段，不提升存储域版本。
- [x] 将 `packages/client/ui-security/src/client/TaskDetail.tsx` 中本地目标/约束/规则状态改为原位行编辑与删除，并使用现有 `records-state.ts` 自动保存队列。
- [x] 在 500 ms 后、失焦与导航时提交变更；显示实际保存/失败状态，并明确执行约束尚未连接。
- [x] 验证每类行在重新加载后保留、删除后不恢复、空行仍可编辑，且缺失三个字段的旧记录仍可打开。

扩展验证证据：模式冒烟检查接受旧字段省略与空草稿行，并拒绝无效 action。七个 `build:artifacts` 检查、两个 `build:check` 检查及六个受影响文件的 lint 均通过。UI 输入、选择器、第二行、重新加载保留、行删除及删除后保留均通过；Host 停止并使用同一 home 重启后，新浏览器恢复了编辑记录。已检查 1450×1000 宽屏与 1000×850 窄屏截图 `/tmp/jw-task-policies.png` 和 `/tmp/jw-task-policies-narrow.png`。本扩展尚未验证通信失败与并发写入行为。
