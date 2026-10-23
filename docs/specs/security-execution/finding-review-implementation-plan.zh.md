# 发现复核实施计划

[English](finding-review-implementation-plan.md) | 中文

## Summary

> 分三个阶段调整现有发现、协调及界面职责，涉及约 20 个源文件与测试文件。存储字段可选；不更改供应商、环境、版本，不提交或推送。

## Findings

- [x] 扩展 `finding-types.ts`、`security-findings.ts` 和 `finding-groups.ts`，实现可撤销关联与保守的自动分组。
- [x] 在 `worker-types.ts`、`security-evidence.ts` 和 `security-http.ts` 记录请求上下文，不保留请求机密。
- [x] 验证旧数据、处置状态与原始再测试引用。

## Review

- [x] 更新 `security-execution.ts` 与 `security-planning.ts`，在发现、失败和预算边界复核终态结果。
- [x] 扩展 `planning-types.ts` 与 `planning-coverage.ts`，保留延续项目身份和权威复核上下文。
- [x] 调整 `report-model.ts`，以项目身份判断覆盖，不依赖共享 URL。

## Presentation and verification

- [x] 更新 `TaskFindingRecords.tsx`、`TaskSavedReport.tsx` 及客户端服务连接，显示代表发现和相关证据。
- [x] 运行范围测试、构建产物、聚合类型检查及相关 preflight 检查。
- [x] 用合成记录目视原生界面并登记截图。

## Compatibility

不得删除原始报告或再测试快照。缺失可选字段的旧记录仍可读取。用户分离阻止自动重新关联。预算约束仍由主机实施；取消与配置变更不得启动新复核。并行调度和额外调查能力不在此次范围。
