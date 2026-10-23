/** Session-owned permission presets for native engines. @module @deepseek-ai/dsh-agent/engine-permissions */
import type { Context } from '@deepseek-ai/cordis'
import { readNativeExecution } from './native-execution.ts'
import type { Session } from '@deepseek-ai/dsh-session'
import type { SubscriptionEngine } from './engine-types.ts'
import type {} from './engine-permission-types.ts'

export type { NativePermissionPreset } from './engine-permission-types.ts'

const OPTIONS = {
  codex: [
    { value: 'ask', name: 'Ask', description: 'Workspace sandbox with user approval for restricted operations.' },
    { value: 'auto-review', name: 'Auto review', description: 'Workspace sandbox with the official Codex approval reviewer.' },
    { value: 'full-access', name: 'Full access', description: 'No sandbox restrictions or approval prompts.' },
  ],
  claude: [
    { value: 'default', name: 'Default', description: 'Use standard Claude permission prompts.' },
    {
      value: 'acceptEdits', name: 'Accept edits',
      description: 'Automatically accept file edits; other operations retain their permission checks.',
    },
    { value: 'plan', name: 'Plan', description: 'Use the official Claude planning permission mode.' },
    { value: 'bypassPermissions', name: 'Bypass permissions', description: 'Skip native permission checks.' },
  ],
} as const

/** @param engine Native provider. @returns Supported permission presets in display order. */
export function nativePermissionOptions(engine: SubscriptionEngine): readonly { value: string; name: string; description?: string }[] {
  return OPTIONS[engine]
}

/** @param engine Native provider. @returns Permission preset used before an explicit selection. */
export function nativePermissionDefault(engine: SubscriptionEngine): string {
  return engine === 'codex' ? 'ask' : 'default'
}

function validate(engine: SubscriptionEngine, preset: string): void {
  if (!nativePermissionOptions(engine).some(option => option.value === preset)) {
    throw new Error(`Unsupported ${engine} permission preset: ${preset}`)
  }
}

/**
 * Read native permission without inheriting a fork parent's selection.
 * @param ctx - Host context with the native execution projection.
 * @param session - Owning session.
 * @param engine - Native provider.
 * @returns Its last child-owned preset, or the provider default.
 */
export function nativePermissionFor(ctx: Context, session: Session, engine: SubscriptionEngine): string {
  const preset = readNativeExecution(ctx, session).permissions[engine]
  validate(engine, preset)
  return preset
}

/** @param session Owning session. @param engine Native provider. @param preset Supported provider-specific permission value. */
export function setNativePermission(session: Session, engine: SubscriptionEngine, preset: string): void {
  validate(engine, preset)
  session.append('engine/permission', { engine, preset })
}
