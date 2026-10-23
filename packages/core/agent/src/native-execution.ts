/** Host-only replay state for native execution routes, permissions, and resumable conversations. */

import { z } from 'zod'
import type { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { EngineUsageSnapshot, SubscriptionEngine } from './engine-types.ts'
import { nativePermissionDefault, nativePermissionOptions } from './engine-permissions.ts'
import type {} from './types.ts'

/** Durable provider conversation binding, checked against the current Harness session by its consumer. */
interface NativeSessionBinding {
  owner: string
  nativeId: string
}

/** Incremental facts needed to execute the next native turn without reading historical events. */
export interface NativeExecutionState {
  /** Immutable inherited prefix excluded from child-owned permissions, bindings, and token counters. */
  inheritedEventCount: number
  route?: { provider: string; model: string } | undefined
  permissions: Record<SubscriptionEngine, string>
  sessions: { codex?: NativeSessionBinding | undefined; claude?: NativeSessionBinding | undefined }
  /** Tool definitions attached to one exact Codex thread; capabilities are always supplied by the current turn. */
  codexToolCatalog?: { nativeId: string; catalog: string } | undefined
  claudeTokens?: EngineUsageSnapshot['tokens']
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Binds a native conversation to the exact Harness session that created it. */
    'engine/session': { engine: SubscriptionEngine; owner: string; nativeId: string }
  }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    /** Host-only execution facts; never exposed as a client projection. */
    nativeExecution: NativeExecutionState
  }
}

const tokenCount = z.number().int().nonnegative()
const bindingSchema = z.object({ owner: z.string(), nativeId: z.string() }).strict()
const nativeExecutionSchema: z.ZodType<NativeExecutionState> = z.object({
  inheritedEventCount: z.number().int().nonnegative(),
  route: z.object({ provider: z.string(), model: z.string() }).strict().optional(),
  permissions: z.object({ codex: z.string(), claude: z.string() }).strict(),
  sessions: z.object({ codex: bindingSchema.optional(), claude: bindingSchema.optional() }).strict(),
  codexToolCatalog: z.object({ nativeId: z.string(), catalog: z.string() }).strict().optional(),
  claudeTokens: z.object({
    inputTokens: tokenCount,
    outputTokens: tokenCount,
    cacheReadTokens: tokenCount.optional(),
    cacheWriteTokens: tokenCount.optional(),
  }).strict().optional(),
}).strict()

/** Native facts are maintained independently of client-facing permission and usage presentations. */
export const nativeExecutionProjection = {
  key: 'nativeExecution',
  stateVersion: 2,
  stateSchema: nativeExecutionSchema,
  init: (_header, inheritedEventCount) => ({
    inheritedEventCount,
    permissions: { codex: nativePermissionDefault('codex'), claude: nativePermissionDefault('claude') },
    sessions: {},
  }),
  apply: (state, event) => {
    switch (event.type) {
      case 'model/selection':
        return { ...state, route: { provider: event.data.provider, model: event.data.model } }
      case 'request/header': {
        const { provider, model } = event.data.header.config
        const sessions = { ...state.sessions }
        if (provider !== 'codex-subscription') delete sessions.codex
        if (provider !== 'claude-subscription') delete sessions.claude
        return { ...state, route: { provider, model }, sessions }
      }
      case 'session/end-seed': {
        if (event.data.inherited !== true) return state
        const { claudeTokens: _inheritedTokens, codexToolCatalog: _inheritedCatalog, ...retained } = state
        return {
          ...retained,
          permissions: { codex: nativePermissionDefault('codex'), claude: nativePermissionDefault('claude') },
          sessions: {},
        }
      }
      case 'engine/permission': {
        if (event.seq < state.inheritedEventCount) return state
        const { engine, preset } = event.data
        if (!nativePermissionOptions(engine).some(option => option.value === preset)) {
          throw new Error(`Unsupported ${engine} permission preset: ${preset}`)
        }
        return { ...state, permissions: { ...state.permissions, [engine]: preset } }
      }
      case 'engine/session':
        if (event.seq < state.inheritedEventCount) return state
        return {
          ...state,
          sessions: { ...state.sessions, [event.data.engine]: { owner: event.data.owner, nativeId: event.data.nativeId } },
        }
      case 'engine/activity': {
        if (event.seq < state.inheritedEventCount || event.data.engine !== 'codex' || event.data.kind !== 'host-tool-catalog') return state
        let detail: unknown
        try { detail = JSON.parse(event.data.detail) }
        catch (_error: unknown) { return state } // Invalid activity never authorizes a native resume.
        const parsed = z.object({ nativeId: z.string(), catalog: z.string() }).strict().safeParse(detail)
        return parsed.success ? { ...state, codexToolCatalog: parsed.data } : state
      }
      case 'engine/usage':
        if (event.seq < state.inheritedEventCount || event.data.engine !== 'claude' || event.data.tokens === undefined) return state
        return { ...state, claudeTokens: event.data.tokens }
      default:
        return state
    }
  },
} satisfies ProjectionDefinition<'nativeExecution', NativeExecutionState>

/**
 * Read current execution facts from the registered host-only projection.
 * @param ctx - Host context with the Session projection registry.
 * @param session - Session owning the native execution state.
 * @returns Current incremental state; a missing projection fails explicitly.
 */
export function readNativeExecution(ctx: Context, session: Session): NativeExecutionState {
  const state = ctx.get('sessionProjections')?.stateOf(session, 'nativeExecution')
  if (state === undefined) throw new Error('Native execution projection is not registered')
  return state
}
