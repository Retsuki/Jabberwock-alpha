/** Browser-safe subscription connection and usage state. @module @deepseek-ai/dsh-agent/engine-types */

import type {} from '@deepseek-ai/dsh-session/types'

/** Official subscription identity used by the native CLI. */
export type SubscriptionEngine = 'codex' | 'claude'

/** Safe connection facts; credentials never cross the Host API. */
export interface SubscriptionConnection {
  engine: SubscriptionEngine
  name: string
  status: 'connected' | 'signed-out' | 'unavailable' | 'error'
  message?: string
}

/** Native login instructions, optionally with an official authorization URL. */
export interface SubscriptionConnectResult {
  url?: string
  message?: string
}

/** Latest native-engine context and token sample; absent fields are unreported. */
export interface EngineUsageSnapshot {
  /** Native provider identity, such as codex or claude. */
  engine: string
  model?: string | undefined
  /** Observation time in Unix milliseconds. */
  updatedAt: number
  context?: {
    usedTokens: number
    maxTokens?: number | undefined
    estimated?: boolean | undefined
    categories?: { name: string; tokens: number; kind?: string | undefined }[] | undefined
  } | undefined
  /** Disjoint buckets: inputTokens excludes cache reads and writes. */
  tokens?: {
    inputTokens: number
    outputTokens: number
    cacheReadTokens?: number | undefined
    cacheWriteTokens?: number | undefined
  } | undefined
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Engine-owned model/tool activity; log-only and never authorizes operations by itself. */
    'engine/activity': { engine: string; turn: number; step: number; kind: string; detail: string }
    /** Native-engine usage observation, retained only for telemetry and UI. */
    'engine/usage': EngineUsageSnapshot
  }
}
