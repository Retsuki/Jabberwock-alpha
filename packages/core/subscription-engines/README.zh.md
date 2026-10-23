# 订阅执行引擎

当前用户图片通过附件存储读取，在原生提交前验证持久引用与字节。文本和图片保持接收顺序，支持仅图片输入。Claude 接收 base64 图片块，Codex 接收内联图片 data URL。恢复会话只提交新输入。切换提供商时的历史共享仍限于文本，不重新读取过去的图片；图片载荷不会复制到引导记录中。文件附件仍不受支持并明确报错。取消或图片无法读取时会停止提交。

[English](README.md) | 中文

Jabberwock 通过官方 Codex app-server 和 Claude Agent SDK 驱动主聊天。原生工具在所选项目目录中执行一次；Harness 只接收文本流和持久化的 `engine/activity` 记录，不会再次执行原生工具调用。

`agentEngines` 服务提供 `codex-subscription` 和 `claude-subscription`，模型选项均为原生 `default`。环境中的 API 凭据和提供方路由覆盖会被清除。Codex 使用 OpenAI 提供方和 ChatGPT 登录；Claude 要求第一方 claude.ai 身份。未登录或使用 API 计费身份时执行失败，不会回退到 API 密钥。

普通 Claude 和 Codex 轮次通过可撤销的 `subscription-engines/host-tools` 瀑布收集额外宿主工具。提供者将每项能力绑定到当前 Agent 并执行自己的授权。Claude 使用 SDK MCP 工具；Codex 使用同捆 app-server 的实验性动态工具协议。目录、参数和结果记录在所属 Session 中。Codex 依据实时目录验证每次调用；声明变化时新建原生线程，并保留现有历史共享确认。专用的仅对话与 Worker 路径保持隔离。

`engine/session` 将原生会话标识绑定到所属 Harness Session，分叉不会复用父会话标识。向新的提供方会话共享已有用户和助手正文前，会明确询问目标和共享范围；拒绝后停止本轮。授权发送的完整引导文本记录在 `engine/bootstrap`。需要批准的原生工具通过当前 Agent 的人工问答服务请求批准，没有答复服务时拒绝。Claude 默认使用标准权限模式，只有明确选择后才改变，不读取用户或项目 SDK 设置。

`codexCommand` 可覆盖内置官方可执行文件；`claudeCommand` 指定已安装的官方 Claude CLI。`statusTimeoutMs` 和 `loginTimeoutMs` 限制认证操作时长，`modelListTimeoutMs`（默认 8000、最小 1000）限制 Claude SDK 模型目录的等待时长。凭据由官方 CLI 保存，认证状态不包含凭据值。

初始版本仅支持文本，附件会明确报错。原生工具摘要保存为活动事件，专用活动卡片由其他消费者提供。

Codex 模型选项来自官方 `model/list` 目录。运行时将 `default` 解析为目录声明的默认模型，并为每轮明确指定模型，不继承用户 CLI 的模型设置。目录中不存在的模型会报错，不会自动回退。失败时展示提供方的错误消息，不展示响应正文或凭据。

原生用量以替换式 `engine/usage` 快照记录。Codex 使用最近请求的上下文占用和累计令牌计数，缓存输入与未缓存输入分开，不生成虚构的分类明细。Claude 使用自动上下文报告或 `getContextUsage({ detail: 'summary' })` 的本地估算，以及原生结果令牌计数。summary 不调用按分类计数的 API。指标不可用不会让已成功的轮次失败。

仅限所有者调用的 `subscriptionQuota` 服务独立于 Session 上下文读取账户级订阅窗口。`read({ engine })` 与 `refresh({ engine })` 发起有截止时间的全新官方控制查询；同时读取共享进行中的请求，认证变化取消此前一代请求。Claude 使用实验性结构化 SDK 用量并设置 `skipBehaviors: true`；Codex 使用 `account/rateLimits/read`，按返回时长分类，不假设主要窗口为五小时。百分比及重置时间可为空；不支持、断连或失败的读取返回不可用，不执行推理、不检查会话、不包含凭据值，也不写入 Session。账户限制包含提供方报告的 Jabberwock 之外的账户用量。

每轮 Claude 调用都会创建新的 SDK query，恢复会话时原生计数会重新开始。Harness 恢复会话后只读取一次此前的 Claude 令牌快照作为固定基数，再加上当前 query 的最新累计计数；重复结果只替换当前 query 的贡献。仅含上下文的报告保留最新令牌快照。Codex 恢复后的原生计数已包含此前轮次，因此不叠加基数。

权限预设通过 `engine/permission` 按引擎独立保存，并在每轮开始时固定。Codex 可选择工作区沙箱加用户审批、同一沙箱加原生 `auto_review`，或明确的完全访问；会话初始化及每轮均显式传递设置。Claude 提供 `default`、`acceptEdits`、`plan` 和明确的 `bypassPermissions`；最后一项同时设置 SDK 要求的危险权限标记，现有人工审批回调仍保留。修改仅作用于下一轮，恢复原生会话时同样适用；不支持的已存值会阻止执行。分叉会话从安全默认值开始，不继承父会话的权限。

主聊天的 Claude 分组提供 `Claude default` 和已认证 SDK `supportedModels()` 返回的模型，使用与 `claude-conversation` 相同的发现流程，并受 `modelListTimeoutMs` 限制。账户不是第一方 claude.ai 订阅，或 CLI、SDK 请求、截止时间失败时，分组仅保留 `Claude default` 并记录一条警告，不会消失。成功列表会缓存，并发调用共享同一次查询；失败不缓存，下次重试。开始 `connect('claude')` 或 `connections()` 发现 Claude 状态不是 `connected` 时清空缓存。

模型订阅卡片提供独立的 `historySharing.claude` 和 `historySharing.codex` 配置设置。两者默认 `ask`；显式选择 `allow` 后，允许当前会话及本安装中新会话的文本历史引导共享。设置复用既有 volatile 配置并在重启后保留。改回 `ask` 恢复普通会话级确认；单独授予的会话级始终许可仍有效。当前输入图片不变，历史图片、工具及凭据文件不会加入引导。DeepSeek 路由不受这些设置控制。提供方设置产生的引导记录为 `history-sharing-policy` 活动，不授予永久会话许可。提供方范围指 Claude/Anthropic 或 Codex/OpenAI，也包括切换到同一提供方的另一个订阅账户。

`EngineRunRequest.responseSchema` 仅在 `claude-conversation` 请求原生 JSON Schema 输出，调用方在任务上下文中记录同一 schema。SDK 接收 `outputFormat`，只有验证通过的 `result.structured_output` 会转成响应文本；缺失、无效或失败时拒绝，不回退到普通文字。仅在请求 schema 时接受 SDK 内部的精确名称 `StructuredOutput`，权限钩子的输入也必须符合该 schema。内置工具、MCP、代理、技能及插件访问仍禁用。原生主聊天和 host-tools 路由拒绝此 schema 选项；不带该选项的普通请求保留原有最终文本行为。

内部 `claude-conversation` 路由不出现在主聊天目录中。它复用同一订阅认证，禁用全部内置工具、MCP、技能、代理定义与插件，并拒绝原生工具请求。未请求响应 schema 时，SDK 初始化声明工具会在消费助手输出前失败；仅有 schema 专用的内部输出载体例外。仅会话输出来自 SDK 成功最终结果；中断或重试的部分文本不会拼接到完整响应中。普通 Claude 权限预设保持不变。

仅供查找的 `claude-host-tools` 路由要求显式提供 `EngineRunRequest.hostTools`。它将对象 JSON Schema 转换为类型化的进程内 MCP 工具，同时禁用原生工具、代理、技能和插件。钩子与初始化检查拒绝本次请求工具集之外的能力。操作策略由工具所属服务执行；模型可见的工具参数与结果会写入并刷新 Session 活动记录。流式输入保持开放直到原生结果返回，以维持 SDK MCP 传输。

`register()` 添加仅供查找的内部引擎，不改变主聊天模型目录。内置和已注册标识不可被替换，包括 `claude-conversation`。注册插件负责绑定返回的清理函数；清理仅移除该次注册，服务卸载会清空全部内部注册。

仅供查找的 `claude-conversation` 引擎通过已认证 SDK 的 `supportedModels()` 控制请求发现模型选项，不提交用户提示。发现过程禁用工具和外部能力来源，使用 `statusTimeoutMs`，并在成功、失败、取消或服务卸载时关闭托管进程。`default` 保持为明确选项；目录失败不会返回合成模型列表。由于已安装的 App Server 协议没有经过验证的全部工具禁用模式，纯会话消费者无法使用 Codex。

历史共享与原生工具审批分别询问：仅允许本次、在此会话中始终允许或拒绝。始终允许的决定由仅限 Host 的投影从 `engine/activity` 历史共享记录重放，仅适用于确切的 Session 标识和目标提供方。分叉 Session 和其他提供方需要重新答复。拒绝或取消会停止历史引导；原生工具审批保持独立。

2026-10-20 的原生 Electron 界面检查向 Claude Sonnet 5.5 和 Codex（默认解析为 `gpt-6-astra`）发送了合成图片。两者都正确读取了仅存在于图片中的代码 `VISION-7342` 并统计彩色图形，随后在恢复原生会话后回答了纯文本追问。Codex 还接受了不带文本的下一张图片，并读取其不同代码 `VISION-9185`。引擎及准入专项测试共 91 项通过；产物构建、汇总类型检查和持久化检查均通过。截图记录于仓库根目录的 `tasks/verify/2026-10-20-002239-*`。
