/** Browser-safe account quota data, independent of Host services and Session persistence. */
import type { SubscriptionEngine } from '@deepseek-ai/dsh-agent/types'
import type {} from '@deepseek-ai/dsh-typert-protocol'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap { 'subscription-quota/owner-required': Record<string, never> }
}

/** One provider-reported usage window; null counters and reset times are unavailable, never zero. */
export interface SubscriptionQuotaWindow {
  id: string
  label: string
  usedPercent: number | null
  windowDurationMins: number | null
  /** Unix milliseconds, or null when the provider did not supply a reset. */
  resetsAt: number | null
}

/** Credential-free account quota observed by the current official CLI. */
export interface SubscriptionQuotaSnapshot {
  engine: SubscriptionEngine
  status: 'ready' | 'unavailable'
  /** Completion time in Unix milliseconds, including unavailable attempts. */
  fetchedAt: number
  windows: readonly SubscriptionQuotaWindow[]
  reason?: 'not-connected' | 'unsupported' | 'failed'
}

/** Account provider selected by the owner UI. */
export interface SubscriptionQuotaRequest { engine: SubscriptionEngine }

/** Provider result without credentials, account identity or local transcript data. */
export type QuotaResult = Pick<SubscriptionQuotaSnapshot, 'status' | 'windows' | 'reason'>
