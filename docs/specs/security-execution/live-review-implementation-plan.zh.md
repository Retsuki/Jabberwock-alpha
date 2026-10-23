# Planner 实时审查实施计划

[English](live-review-implementation-plan.md) | 中文

## 概要

> 分三阶段分离池生命周期、扩充权威审查快照并验证现有界面。约八个源码及测试文件变化，新增可选领域字段，不扩充供应商或工具。

## 池与协调器

- [x] 在 `src/security-execution.ts` 及必要的独立池模块分离活动池与审查等待。
- [x] 清理前保留预留，排队已结束结果，串行准入 Planner。
- [x] 审查后替换待办，保留活动标识与语义去重。
- [x] 终局、明确单独停止和用户停止均等待清理。

## 审查记录

- [x] 在 `src/planning-types.ts`、`src/security-planning.ts` 增加权威活动快照和校验后的可选停止标识。
- [x] 区分消耗、预留与可用额度，拒绝跨任务或执行引用。
- [x] 明确继续时恢复未审查终态结果，不自动回放。

## 验证

- [x] 扩充 `tests/execution.host.spec.ts`、`tests/planning-admission.host.spec.ts`，覆盖审查重叠、结果到达、取消与旧数据。
- [x] 更新双语 README 与设计资料。
- [x] 运行针对测试、lint、产物构建和聚合检查，再查看原生任务历史并执行已授权的本地真实模型测试。
