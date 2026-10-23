# 发现分组与结果复核

[English](finding-review-spec.md) | 中文

## Summary

> 任务所有者查看代表发现及关联证据。规划器在预算停止和重要边界前获得已保存结果。可选关联保留旧记录；错误分组必须可撤销。

## User flow

发现列表显示代表记录。展开后可查看各关联执行器的原始证据。用户可以选择另一发现为代表，或分离已关联记录。报告统计代表记录并保留相关证据。再测试保留原始发现身份。

执行器发现问题、失败或达到 HTTP 预算后，规划器复核已保存结果及剩余工作。延续项目保留来源引用；在相同 URL 完成无关项目不能满足它。预算耗尽后不再接受额外 HTTP 操作。

## Storage and API

`SecurityFinding` 增加可选的 `duplicateOfFindingId` 和 `duplicateReview`。缺失表示独立的旧记录。传输层记录的 `requestContext` 区分匿名读取与认证请求；缺失上下文不能用于自动分组。原始记录与再测试快照不变。

用户关联请求为 `{"workspaceId":"workspace","taskId":"task","findingId":"report-b","canonicalFindingId":"report-a"}`。省略 `canonicalFindingId` 表示分离记录。响应保留现有任务范围的 `findings` 和 `retests` 数组。拒绝跨任务、跨资产、自关联和循环关联。

复核请求引用 `executionRunId`；服务读取实际执行与发现数据，不信任外部传入的预算或模型生成的发现记录。复核快照持久保存发送给模型的上下文。不增加模型供应商或网络能力。

## Verification

验证完全重复关联、不确定记录分离、用户分离持久化、原始证据与再测试保留、旧数据、预算停止复核、延续项目覆盖及取消。界面验证采用本地合成记录，不调用真实模型或目标网络。
