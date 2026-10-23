import { en, type PermissionAccessKey } from './locales.ts'
import type { PermissionSelection, PresetOption } from '@deepseek-ai/dsh-permission-presets/client'

/** Machine value of the preset that requires an explicit GUI risk gate. */
export const FULL_ACCESS_PRESET = 'danger-full-access'

/** Machine value of the experimental current-session review preset. */
export const AUTO_REVIEW_PRESET = 'auto'

/** Locale dictionary key for a built-in permission preset label. */
export type PermissionPresetLabelKey =
  | 'preset.readOnly'
  | 'preset.workspaceWrite'
  | 'preset.fullAccess'

const PRESET_LABEL_KEYS = new Map<string, PermissionPresetLabelKey>([
  ['read-only', 'preset.readOnly'],
  ['workspace-write', 'preset.workspaceWrite'],
  [FULL_ACCESS_PRESET, 'preset.fullAccess'],
])

const DEFAULT_PRESET_LABELS: Record<PermissionPresetLabelKey, string> = {
  'preset.readOnly': en['preset.readOnly'],
  'preset.workspaceWrite': en['preset.workspaceWrite'],
  'preset.fullAccess': en['preset.fullAccess'],
}

/**
 * Convert conventional kebab-case preset names into user-facing title case.
 * @param name - host-supplied preset label or key.
 * @returns the title-cased conventional key, or a non-kebab label unchanged.
 */
export function displayPresetName(name: string): string {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) return name
  return name.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

/**
 * Render a permission preset under its product label.
 * @param value - preset machine value.
 * @param name - host-supplied preset name.
 * @param t - optional locale dictionary lookup for built-in product labels.
 * @returns the built-in product label or the conventional display name.
 */
export function displayPermissionPreset(
  value: string,
  name: string,
  t?: (key: PermissionPresetLabelKey) => string,
): string {
  const key = PRESET_LABEL_KEYS.get(value)
  if (key !== undefined && (name === value || name === DEFAULT_PRESET_LABELS[key])) {
    return t?.(key) ?? DEFAULT_PRESET_LABELS[key]
  }
  return displayPresetName(name)
}

/** One active execution provider's localized option copy. */
export function activePermissionCopy(option: PresetOption, engine: PermissionSelection['engine'], t: (key: PermissionAccessKey) => string): { label: string; description: string | undefined; badge?: string } {
  const keys: Record<string, readonly [PermissionAccessKey, PermissionAccessKey]> = engine === 'codex' ? {
    ask: ['native.codex.ask.label', 'native.codex.ask.description'],
    'auto-review': ['native.codex.auto.label', 'native.codex.auto.description'],
    'full-access': ['native.codex.full.label', 'native.codex.full.description'],
  } : engine === 'claude' ? {
    default: ['native.claude.default.label', 'native.claude.default.description'],
    acceptEdits: ['native.claude.acceptEdits.label', 'native.claude.acceptEdits.description'],
    plan: ['native.claude.plan.label', 'native.claude.plan.description'],
    bypassPermissions: ['native.claude.bypass.label', 'native.claude.bypass.description'],
  } : {}
  const native = keys[option.value]
  if (native !== undefined) return { label: t(native[0]), description: `${t(engine === 'codex' ? 'native.engine.codex' : 'native.engine.claude')}: ${t(native[1])} ${t('native.nextTurn')}` }
  if (engine === undefined && option.value === AUTO_REVIEW_PRESET) return { label: t('auto.label'), description: t('auto.description'), badge: t('auto.badge') }
  return { label: displayPermissionPreset(option.value, option.name, t), description: option.description }
}

/** Risk copy is shared by the composer and slash-command surfaces. */
export function permissionConfirmation(value: string, engine: PermissionSelection['engine'], t: (key: PermissionAccessKey) => string) {
  if (engine === 'codex' && value !== 'full-access') return undefined
  if (engine === 'claude' && value !== 'bypassPermissions') return undefined
  if (engine === undefined && value !== FULL_ACCESS_PRESET && value !== AUTO_REVIEW_PRESET) return undefined
  const auto = engine === undefined && value === AUTO_REVIEW_PRESET
  return {
    title: t(engine === 'codex' ? 'native.full.confirm.title' : engine === 'claude' ? 'native.bypass.confirm.title' : auto ? 'auto.confirm.title' : 'confirm.title'),
    description: t(engine === 'codex' ? 'native.full.confirm.description' : engine === 'claude' ? 'native.bypass.confirm.description' : auto ? 'auto.confirm.description' : 'confirm.description'),
    acknowledgeLabel: t(auto ? 'auto.confirm.acknowledge' : 'confirm.acknowledge'),
    cancelLabel: t('confirm.cancel'),
    confirmLabel: engine === undefined ? t(auto ? 'auto.confirm.enable' : 'confirm.enable') : activePermissionCopy({ value, name: value }, engine, t).label,
  }
}
