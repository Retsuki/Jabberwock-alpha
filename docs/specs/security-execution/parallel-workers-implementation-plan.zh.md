# 并行 Worker 实施计划

[English](parallel-workers-implementation-plan.md) | 中文

## Summary

> 分三个阶段调整 Worker 生命周期、现有协调与状态展示。可选快照和派发字段兼容旧串行记录。不增加供应商或网络工具，不更改版本，不提交或推送。

## Worker lifecycle

- [x] 在 `security-workers.ts` 按运行索引活动调查，保留任务级串行受付。
- [x] 隔离启动重试、指令、审批和取消，增加任务停止屏障。
- [x] 增加内部预约校验与操作结束等待。

## Coordination

- [x] 在 `index.ts` 增加经校验的并发设置，在 `execution-types.ts` 增加可选字段。
- [x] 在 `security-execution.ts` 派发前预约滚动池配额，收集所有所属结果后复核。
- [x] 保留请求消耗、明确恢复和被动重启行为。

## Presentation and verification

- [x] 使用现有任务与 Worker 组件显示并行活动。
- [x] 用受控夹具验证重叠、配额、取消竞争、路由隔离与兼容性。
- [x] 构建产物、运行聚合类型检查并目视原生界面，不调用真实推理。
