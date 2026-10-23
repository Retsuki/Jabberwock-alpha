/** `skill` namespace dictionaries for the dedicated tool row and the Skills sidebar tab. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'skill'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'row.title': '加载技能',
  'row.running': '正在加载 skill',
  'row.preparing': '准备加载技能',
  'row.failed': 'skill 加载失败',
  'row.stopped': 'skill 加载已中止',
  'row.instructions': '说明',
  'row.inspect': '查看',
  'menu.userOnly': '仅用户',
  'tab.title': '技能',
  'tab.guide.description': '浏览当前会话可用的技能',
  'tab.noSession': '请先选择会话',
  'tab.search': '搜索技能',
  'tab.reload': '重新读取',
  'tab.loading': '正在读取…',
  'tab.empty': '当前会话没有可用的技能。',
  'tab.noMatch': '没有匹配的技能。',
  'tab.subagent': '子代理会话不提供技能列表。',
  'tab.error': '读取失败：{message}',
  'tab.retry': '重试',
  'tab.noFile': '这个技能没有 SKILL.md 文件，无法打开。',
} satisfies Record<string, string>

/** The skill namespace key union. */
export type SkillKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'row.title': 'Skill',
  'row.running': 'Loading skill',
  'row.preparing': 'Preparing to load a skill',
  'row.failed': 'Skill load failed',
  'row.stopped': 'Skill load stopped',
  'row.instructions': 'Instructions',
  'row.inspect': 'Inspect',
  'menu.userOnly': 'user-only',
  'tab.title': 'Skills',
  'tab.guide.description': 'Browse the skills available to this session',
  'tab.noSession': 'Select a session first',
  'tab.search': 'Search skills',
  'tab.reload': 'Reload',
  'tab.loading': 'Loading…',
  'tab.empty': 'No skills are available to this session.',
  'tab.noMatch': 'No skills match.',
  'tab.subagent': 'Subagent sessions do not list skills.',
  'tab.error': 'Load failed: {message}',
  'tab.retry': 'Retry',
  'tab.noFile': 'This skill has no SKILL.md file, so it cannot be opened.',
} satisfies Record<SkillKey, string>
