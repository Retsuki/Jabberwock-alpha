# 安全技能实施计划

[English](security-skills-implementation-plan.md) | 中文

## 摘要

> 通过现有技能注册表同捆五个工作流，连接仅规划操作和原生技能工具，并验证发现、加载和操作。三个阶段涉及约 20 个源代码、资源和测试文件以及配对文档。不计划修改数据库格式或版本；保留已有未提交工作。

## 已批准设计

方案 B 复用安全服务和共享技能注册表。方案 A 仅复制资源，仍无法完成操作；方案 C 替换可用的注册表和执行归属，却没有必要的能力收益。产品资源与 `ui-security` 同属一个包；共享指令随选中的工作流加载。原生适配器只公开明确注册的工具，保留实时授权，并记录模型可见的调用与结果。

## 阶段 1：产品工作流

- [x] 通过现有包清单发布 `packages/client/ui-security/assets/security-skills/`。
- [x] 在 `packages/client/ui-security/src/security-skills.ts` 和现有插件入口注册元数据与延迟加载正文。
- [x] 验证源代码工作区以外的注册表发现、延迟加载与提供者卸载。

## 阶段 2：操作与提供者连接

- [x] 在 `packages/client/ui-security/src/control-types.ts`、`security-control.ts` 和 `security-chat-tools.ts` 添加仅规划分派，保留规划准入和修订检查。
- [x] 将 `packages/skill/tool-skill/src/index.ts` 的加载器共享给原生宿主工具，保留可见性、调用策略和取消检查。
- [x] 在 `packages/core/subscription-engines/src/codex.ts` 和 `index.ts` 连接 Codex 动态工具；恢复时重新绑定调用，并明确处理目录变化。
- [x] 已保存进度响应中的失败详情保持有界，并更新相关包参考文档。

## 阶段 3：验证

- [x] 运行技能、安全控制和原生驱动的针对性测试，包括拒绝操作以及不启动 Worker 的仅规划分派。
- [x] 构建产物并执行构建检查；检查最终差异和打包内容。
- [x] 在合成工作区通过支持的真实模型验证发现、加载与控制，并在桌面应用中目视验证报告导航。
- [x] 记录提供者特有限制，区分模型检查和录制测试。

## 约束

合成测试不包含凭据、已有私人会话正文或无关证据。保留现有授权检查。验证任务创建、规划、状态和报告导航无需访问目标。不授权提交或推送。
