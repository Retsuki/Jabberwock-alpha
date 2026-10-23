# 共享探索信息

[English](shared-exploration-spec.md) | 中文

## Summary

> 提案：Planner 与 Worker 共享任务内的目标、调查、观察、发现及提示，并保留明确的支持关系。既有执行与证据服务仍是权威来源。专用域保存共享注释，旧记录继续可读。模型主张必须与实际采集证据区分。

## User flow

所有者从现有任务会话启动调查。Planner 接收包括未解决调查与阴性结果的探索摘要，把新调查关联到目标和已有观察。Worker 在其他 Worker 运行时读取共享信息并记录有观察依据的结果。Planner 审查新结果并保存后续调查和目标评估。探索路径与时间线显示同一份已提交信息，并链接原始证据。

## Records and ownership

拟议的 `securityExploration` 服务拥有任务级版本、共享注释和类型化关系。任务目标、计划项、Worker 执行、HTTP 观察及发现保留原有所有者和标识。引用记录由所属服务解析，共享存储不会成为执行状态或发现处理状态的第二所有者。

共享实体包括目标、调查、事实、发现和提示。事实包含简短主张、来源 Worker 和观察引用；实际观察到的阴性结果也是知识。提示是未经验证的建议。采集的 HTTP 数据支持观察，但不会自动确立漏洞或目标完成。关系表达派生、产出、支持及矛盾，并保留来源标识和相关资产。

Planner 可提出新调查和有证据关联的目标评估。Worker 仅能为自身获准任务及来源观察发布结果。执行状态转换仍由 Host 管理。模型不能通过图写入扩大范围、覆盖其他 Worker 证据、标记漏洞已修复或宣告任务完成。

## Service and model inputs

所有者按任务标识读取。Agent 使用绑定准入任务、角色及运行的私有能力；模型参数不能选择其他任务或角色。读取提供有限摘要和节点详情。所有模型可见结果通过既有 Session 或工具日志保存。写入验证引用、保留原始证据、串行处理任务变更，并在通知前按重试标识去重。

读取请求示例：

```json
{"taskId":"local-lab","query":"overview"}
```

返回示例：

```json
{"revision":12,"goals":[{"id":"goal-1","assessment":"unverified"}],"facts":[{"id":"fact-1","summary":"The anonymous response contains synthetic invoice data","source":{"workerRunId":"worker-1","observationIndex":2}}],"unresolvedInvestigations":["investigation-2"]}
```

Planner 保留严格验证的结构化响应，并接收不可变探索快照。Worker 工具提供范围内读取和事实发布。Planner 注释在输出验证后幂等应用；部分应用失败时，修复完成前不派发新工作。重复证据仍可通过原始记录访问，仅凭措辞相似不能合并无关事实或发现。

## Compatibility and verification

已有历史以稳定来源标识只读投影；打开任务不触发推理或目标访问。删除或不可用的来源明确显示为未解决。任务设置版本改变会使旧目标评估失效，但不删除历史证据。并发写入保留两个 Worker 的结果，重启不重发网络请求。

验收覆盖两个并发 Worker 共享结果、基于证据的后续计划、阴性观察、无依据主张、跨任务引用、重试幂等、过期评估、应用中断和旧数据。使用现有本地虚构应用验证原生界面并保存截图；模型拒绝仍显示为失败。
