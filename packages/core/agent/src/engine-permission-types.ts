/** Host-neutral names for native-engine permission selection. @module @deepseek-ai/dsh-agent/engine-permission-types */
import type { SubscriptionEngine } from './engine-types.ts'

/** Presets supported by the installed official execution protocols. */
export type NativePermissionPreset = 'ask' | 'auto-review' | 'full-access' | 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions'

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Records the selected native permission preset independently for each execution engine. */
    'engine/permission': { engine: SubscriptionEngine; preset: string }
  }
}
