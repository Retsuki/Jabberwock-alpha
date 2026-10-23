/** `settings.permission` namespace dictionaries (the Permission row's copy). */

/** Locale namespace shared by both current-session permission pickers. */
export const PERMISSION_ACCESS_NS = 'permission.access'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'title': '权限',
  'description': '选择新会话的默认权限模式',
  'loading': '加载中',
  'unavailable': '不可用',
  'preset.readOnly': '仅可查看',
  'preset.workspaceWrite': '工作区内修改',
  'preset.fullAccess': '完全权限',
  'confirm.title': '确认启用完全权限？',
  'confirm.description': '启用完全权限后，新会话将减少确认步骤，并且可以直接执行更多操作，包括敏感操作、文件修改或外部命令。仅建议在你信任后续任务时使用。',
  'confirm.acknowledge': '我已了解风险，并愿意继续',
  'confirm.cancel': '取消',
  'confirm.enable': '启用完全权限',
} satisfies Record<string, string>

/** The settings.permission namespace key union. */
export type PermissionSettingsKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'title': 'Permission',
  'description': 'Choose the default permission mode for new sessions',
  'loading': 'Loading',
  'unavailable': 'Unavailable',
  'preset.readOnly': 'Read Only',
  'preset.workspaceWrite': 'Workspace Write',
  'preset.fullAccess': 'Full access',
  'confirm.title': 'Enable Full access?',
  'confirm.description': 'Full access lets new sessions reduce confirmation steps and perform more actions directly, including sensitive operations, file changes, or external commands. Only use it when you trust subsequent tasks.',
  'confirm.acknowledge': 'I understand the risks and want to continue',
  'confirm.cancel': 'Cancel',
  'confirm.enable': 'Enable Full access',
} satisfies Record<PermissionSettingsKey, string>

/** Simplified Chinese dictionary for the current-session popup gate. */
export const accessZh = {
  'native.codex.ask.label': '请求批准',
  'native.codex.ask.description': '保留工作区沙箱，受限操作由你批准。',
  'native.codex.auto.label': '代我批准',
  'native.codex.auto.description': '保留工作区沙箱，由 Codex 官方审查器处理批准请求；与无沙箱的 Auto review 预设不同。',
  'native.codex.full.label': '完全权限',
  'native.codex.full.description': '关闭 Codex 沙箱限制和批准提示。',
  'native.claude.default.label': '默认',
  'native.claude.default.description': '遵循 Claude 的标准权限提示。',
  'native.claude.acceptEdits.label': '接受编辑',
  'native.claude.acceptEdits.description': '自动接受文件编辑，其他操作仍遵循 Claude 的权限检查。',
  'native.claude.plan.label': '计划',
  'native.claude.plan.description': '使用 Claude 官方计划模式，先分析和规划，不执行修改。',
  'native.claude.bypass.label': '绕过权限检查',
  'native.claude.bypass.description': '跳过 Claude 原生工具的权限检查；不会取消操作系统的限制。',
  'native.nextTurn': '更改从下一轮开始生效。',
  'native.engine.codex': 'Codex 权限',
  'native.engine.claude': 'Claude 权限',
  'native.full.confirm.title': '启用 Codex 完全权限？',
  'native.full.confirm.description': '下一轮起，Codex 将不使用沙箱限制，也不请求批准。文件修改、命令和网络操作可能直接执行。仅在信任任务及项目时启用。',
  'native.bypass.confirm.title': '绕过 Claude 权限检查？',
  'native.bypass.confirm.description': '下一轮起，Claude 将跳过原生工具权限检查，可能直接修改文件或执行命令。操作系统限制仍适用。仅在信任任务及项目时启用。',

  'mode': '访问模式，当前：{name}',
  'close': '关闭',
  'preset.readOnly': '仅可查看',
  'preset.workspaceWrite': '工作区内修改',
  'preset.fullAccess': '完全权限',
  'confirm.title': '确认启用完全权限？',
  'confirm.description': '启用完全权限后，智能体将减少确认步骤，并且可以直接执行更多操作，包括敏感操作、文件修改或外部命令。仅建议在你信任当前任务时使用。',
  'confirm.acknowledge': '我已了解风险，并愿意继续',
  'confirm.cancel': '取消',
  'confirm.enable': '启用完全权限',
  'auto.label': '自动审查',
  'auto.badge': 'EXP',
  'auto.description': '无沙箱运行；每次原生工具调用和 PTC 内层调用前由同一模型进行实验性审查。',
  'auto.confirm.title': '确认启用自动审查（实验）？',
  'auto.confirm.description': '自动审查不使用沙箱。每次原生工具调用和 PTC 内层调用前，都会由与当前 agent 相同的模型进行审查；审查拒绝的调用由你批准或拒绝。此功能仍属实验性，可能误放行或误拒绝，并会消耗额外 token。',
  'auto.confirm.acknowledge': '我已了解这些风险，并愿意继续',
  'auto.confirm.enable': '启用自动审查',
} satisfies Record<string, string>

/** Current-session popup-gate key union. */
export type PermissionAccessKey = keyof typeof accessZh

/** English dictionary for the current-session popup gate. */
export const accessEn = {
  'native.codex.ask.label': 'Ask for approval',
  'native.codex.ask.description': 'Keep the workspace sandbox and ask you to approve restricted operations.',
  'native.codex.auto.label': 'Approve for me',
  'native.codex.auto.description': 'Keep the workspace sandbox and let the official Codex reviewer handle approval requests. This differs from the unsandboxed Auto review preset.',
  'native.codex.full.label': 'Full access',
  'native.codex.full.description': 'Remove Codex sandbox restrictions and approval prompts.',
  'native.claude.default.label': 'Default',
  'native.claude.default.description': 'Use Claude’s standard permission prompts.',
  'native.claude.acceptEdits.label': 'Accept edits',
  'native.claude.acceptEdits.description': 'Automatically accept file edits; other operations retain Claude permission checks.',
  'native.claude.plan.label': 'Plan',
  'native.claude.plan.description': 'Use Claude’s official planning mode to analyze and plan without applying changes.',
  'native.claude.bypass.label': 'Bypass permissions',
  'native.claude.bypass.description': 'Skip Claude’s native tool permission checks. Operating-system restrictions still apply.',
  'native.nextTurn': 'Changes apply from the next turn.',
  'native.engine.codex': 'Codex permissions',
  'native.engine.claude': 'Claude permissions',
  'native.full.confirm.title': 'Enable Codex Full access?',
  'native.full.confirm.description': 'From the next turn, Codex runs without sandbox restrictions or approval prompts. File changes, commands and network operations may proceed directly. Enable only for trusted tasks and projects.',
  'native.bypass.confirm.title': 'Bypass Claude permissions?',
  'native.bypass.confirm.description': 'From the next turn, Claude skips native tool permission checks and may directly edit files or run commands. Operating-system restrictions still apply. Enable only for trusted tasks and projects.',

  'mode': 'Access mode, current: {name}',
  'close': 'Close',
  'preset.readOnly': 'Read Only',
  'preset.workspaceWrite': 'Workspace Write',
  'preset.fullAccess': 'Full access',
  'confirm.title': 'Enable Full access?',
  'confirm.description': 'Full access reduces confirmation steps and lets the agent perform more actions directly, including sensitive operations, file changes, or external commands. Only use it when you trust the current task.',
  'confirm.acknowledge': 'I understand the risks and want to continue',
  'confirm.cancel': 'Cancel',
  'confirm.enable': 'Enable Full access',
  'auto.label': 'Auto review',
  'auto.badge': 'EXP',
  'auto.description': 'Run without a sandbox after an experimental same-model review of every native tool call and PTC inner call.',
  'auto.confirm.title': 'Enable Auto review (experimental)?',
  'auto.confirm.description': 'Auto review runs without a sandbox. Before every native tool call and PTC inner call, the same model as the current agent reviews whether to allow it; you approve or reject each call it denies. This feature is experimental, can falsely allow or deny actions, and uses additional tokens.',
  'auto.confirm.acknowledge': 'I understand these risks and want to continue',
  'auto.confirm.enable': 'Enable Auto review',
} satisfies Record<PermissionAccessKey, string>
