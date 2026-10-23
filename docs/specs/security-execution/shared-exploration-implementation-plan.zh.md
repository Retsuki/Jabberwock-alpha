# 共享探索实施计划

[English](shared-exploration-implementation-plan.md) | 中文

## Summary

> 分三个阶段把一个共享注释域接入现有 Planner、Worker 和活动服务。预计修改十二个左右源文件及相关测试。保留既有来源记录和 Session 格式，不新增环境变量或扩大目标权限。

## Shared storage

- [x] 添加 `src/exploration-types.ts` 和 `src/security-exploration.ts`，实现串行任务写入、重试标识和证据验证。
- [x] 在 `src/index.ts` 及编译配置注册服务和有界模型读取配置。
- [x] 验证并发发布、来源校验、过期评估和重启行为。

## Agent integration

- [x] 在 `src/security-planning.ts` 和 `src/planning-types.ts` 扩展 Planner 快照和结构化输出。
- [x] 通过 `src/security-worker-tools.ts` 和 `src/security-workers.ts` 添加限定范围的知识读取与事实发布。
- [x] 在 `src/security-execution.ts` 派发前修复未应用的就绪注释。
- [x] 所有模型可见知识通过既有 Session 通知或工具结果记录。

## Display and verification

- [x] 将 `src/client/TaskActivity.tsx`、`activity-model.ts` 及探索路径和时间线连接到已提交知识。
- [x] 保留旧历史，不把日志消息当成观察事实。
- [x] 执行针对性测试、产物构建、聚合检查及原生本地模型验证并保存截图。

## Constraints

原始证据、发现处理状态及执行状态由既有服务管理。图注释不能扩大范围或确立任务完成。缺失或过期引用仍显示未验证。重启不自动重发网络请求。
