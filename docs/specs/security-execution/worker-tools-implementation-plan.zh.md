# Worker 工具实施计划

[English](worker-tools-implementation-plan.md) | 中文

## 摘要

> 摘要：已批准 B 方案，分三阶段，预计涉及 15–25 个文件。增加可选 Worker 历史字段并复用现有 Session 事件。主聊天的纯会话路由保持不变。

## 目录

- [工具执行](#tool-execution)
- [Worker 生命周期](#worker-lifecycle)
- [验证](#verification)
- [兼容性](#compatibility)
- [开发备注](#dev-note)

<a id="tool-execution"></a>
## 1. 工具执行

- [x] 在 `packages/core/agent/src/execution-engines.ts` 增加运行专属宿主工具。
- [x] 在 `packages/core/subscription-engines/src/claude.ts` 增加隔离的 MCP 桥接。
- [x] 为 `packages/client/ui-security/src/security-http.ts` 和 `worker-policy.ts` 增加经过检查的 HTTP 操作。
- [x] 增加 `security-worker-workspace.ts`，提供私有工作文件与隔离离线分析。

<a id="worker-lifecycle"></a>
## 2. Worker 生命周期

- [x] 将 `security-workers.ts` 接入专用执行路由、证据历史与所有者指令。
- [x] 扩展 `worker-types.ts` 和 `security-findings.ts`，将发现关联至其实际观测。
- [x] 在 `security-execution.ts` 计入每次子级 HTTP 操作。

<a id="verification"></a>
## 3. 验证

- [x] 运行针对传输、策略、桥接、生命周期与兼容性的测试。
- [x] 生成引用的 Host 声明并通过类型检查。
- [x] 从实际 Electron 界面调查合成本地应用。
- [x] 保存并展示 Worker 日志与发现的截图。

<a id="compatibility"></a>
## 兼容性

旧字段缺失代表单次 GET。重启不重放待处理操作。错误不能变成成功，不盲目重试变更请求。不包含版本修改、提交或推送。

<a id="dev-note"></a>
## 开发备注

原生 Electron 界面与真实 Claude 订阅验证确认了多请求调查、证据支持的发现及执行中所有者指令的传递。已捕获 Worker 与发现界面截图并登记到 UI 验证器。DeepSeek 工具循环的单元测试不代表已验证真实 DeepSeek 模型支持，真实 DeepSeek 执行仍未验证。
