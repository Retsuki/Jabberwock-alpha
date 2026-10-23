# 安全资产与任务持久化规范

[English](security-persistence-spec.md) | 中文

> 10 秒速览：工作区所有者登记资产并创建草稿任务，Host 重启后数据仍然保留。现有安全页面使用 Host 拥有的存储域，桌面配置由现有 SQLite 提供者支持。本阶段新增安全持久记录，不修改 Session 历史；诊断执行仍未连接。

## 已批准范围

用户于 2026-10-17 批准 B 方案：复用现有应用基础设施，并增加安全专用管理层。本阶段保存企业、目标范围与归属依据、分类资产及未执行的任务草稿。不启动 Planner、Worker、模型请求、扫描、复测、审批或报告生成。

## 用户流程

1. 在现有工作区下打开安全页面，登记企业及其资产范围。
2. 添加分类资产，并填写名称、描述、目标并选择资产来创建任务。
3. 离开页面或重启应用，再打开同一工作区读取已保存记录。
4. 通过明确操作编辑或删除记录；写入失败须显示错误，不得报告成功。

空工作区保持为空。演示行不得变成已保存的客户记录。切换工作区不得显示另一工作区的数据。加载与写入错误必须与空列表明确区分。

## 存储与访问

Host 拥有经过验证的持久记录，并在 Remote 边界检查工作区身份。客户端通过现有已认证 Remote 连接调用类型化命令，不直接打开 SQLite。存储提供者确认写入后，变更才算完成。存储域独立于聊天 Session 日志与凭据，不需要新增数据库运行时或环境变量。

持久任务状态为草稿：创建、读取、更新、归档、置顶与删除操作不代表执行状态转换。资产登记只记录用户输入，不发现或访问目标。范围值描述登记目标，本阶段不执行运行时授权控制。任务详情中的演示内容必须与已保存的执行证据明确分开。

## Remote 契约

`securityRecords.read` 接收 `{"workspaceId":"workspace-id"}`，对未保存的空工作区返回 `{"workspaceId":"workspace-id","revision":0,"companies":[],"assets":[],"tasks":[]}`，且不插入记录。

`securityRecords.save` 接收完整聚合，以 `expectedRevision` 替代 `revision`。例如，`{"workspaceId":"workspace-id","expectedRevision":0,"companies":[],"assets":[],"tasks":[]}` 提交空聚合并返回 `{"workspaceId":"workspace-id","revision":1,"companies":[],"assets":[],"tasks":[]}`。遇到 `security/conflict` 后，调用者必须重新加载，不得静默覆盖更新版本。无效记录或未注册工作区以 `security/rejected` 拒绝。Remote 访问仅限所有者。

`jabberwock_security` 域从版本 1 开始，在 `workspaces` 表中为每个工作区保存一个原子聚合。删除企业会移除其资产；删除资产会移除任务中已有的对应引用。新增悬空引用会被拒绝。任务记录保留资产 ID、草稿元数据、归档/置顶标记及数字格式的创建/更新时间戳。权威模式见 `packages/client/ui-security/src/security-records.ts`，Host 实现见 `packages/client/ui-security/src/index.ts`。

## 任务概览草稿编辑

已批准的 B 方案延续在每个任务中保存可选 `goals`、`constraints` 和 `scopeRules` 数组，复用现有聚合及按版本检查的保存队列。每个目标为 `{id,text}`；每条操作约束为 `{id,action,text}`，其中 `action` 为 `allow` 或 `deny`；每条范围规则为 `{id,action,kind,value,note}`，其中 `kind` 为 `domain`、`ip`、`cidr` 或 `url`。ID 独立于文本标识可编辑行。

用户可原位编辑每一行、添加空白草稿行或删除行。空文本、值和备注仍是有效的可编辑草稿。变更复用现有 500 ms 自动保存队列，并在失焦或页面导航时提交待保存内容；保存成功指示必须获得 Host 确认。这些数组仅记录诊断意图：运行时策略执行仍未连接，UI 不得声称允许/禁止规则已保护或约束执行。

未包含这些字段的旧记录仍可读取：UI 将每个缺失数组视为空数组。这些可选字段不改变存储域版本 1，也不重写旧浏览器记录。模式保留缺失数组为可选字段；UI 提供空数组与虚拟初始行，不因打开页面而写入。已执行的编辑与重启证据记录于实施计划。

## 兼容性与验收

保持 `jabberwock.security.v1` 与 `artex-state-v1` 浏览器记录不变。不得静默导入、清除或将旧记录分配给工作区。不得将 Acme 示例作为种子写入 Host 存储。不得修改现有 Session 格式或执行权限。

验收要求企业范围、分类资产与草稿任务在 Host 重启后仍保留；编辑和删除也须保留。检查空数据、工作区隔离、错误可见性与旧记录保留。运行时验证证据另行记录；本规范不代表验证结果。参见[实施计划](security-persistence-implementation-plan.zh.md)。
