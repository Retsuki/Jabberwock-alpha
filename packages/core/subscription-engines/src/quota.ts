/** Account quota projection; independent of conversation context and Session persistence. */
import { Context } from '@deepseek-ai/cordis'
import { Remote, RemoteError, TypertRemoteService, principalOf } from '@deepseek-ai/dsh-typert-protocol'
import type { SubscriptionEngine } from '@deepseek-ai/dsh-agent/types'
import type { SubscriptionQuotaWindow, SubscriptionQuotaSnapshot, SubscriptionQuotaRequest, QuotaResult } from './quota-types.ts'
export type { SubscriptionQuotaWindow, SubscriptionQuotaSnapshot, SubscriptionQuotaRequest, QuotaResult } from './quota-types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context { subscriptionQuota: SubscriptionQuota }
}
function owner(ctx: Context): void {
  if (principalOf(ctx.invocation) !== undefined) throw new RemoteError('subscription-quota/owner-required', 'Account usage is available only to the owner', {})
}

/** Owner-only account usage reads. Each completed read is fresh; only concurrent requests are shared. */
export class SubscriptionQuota extends TypertRemoteService {
  private readonly lifetime = new AbortController()
  private readonly active = new Map<SubscriptionEngine, { controller: AbortController; promise: Promise<SubscriptionQuotaSnapshot> }>()

  /** @param ctx Host owner. @param load Official provider control query. @param timeoutMs Per-read deadline. */
  constructor(
    ctx: Context, private readonly load: (engine: SubscriptionEngine, signal: AbortSignal) => Promise<QuotaResult>,
    private readonly timeoutMs: number,
  ) {
    super(ctx, 'subscriptionQuota', { namespace: 'subscriptionQuota' })
    ctx.effect(() => async () => {
      this.lifetime.abort(new Error('Account quota service unloaded'))
      await Promise.allSettled([...this.active.values()].map(operation => operation.promise))
    }, 'subscription-quota.lifecycle')
  }

  /** Read official account usage without generating a model turn.
   * @param request Official subscription provider.
   * @returns Fresh safe account usage.
   */
  @Remote
  read(request: SubscriptionQuotaRequest): Promise<SubscriptionQuotaSnapshot> {
    owner(this.ctx)
    return this.fetch(request.engine)
  }

  /** Refresh official account usage without generating a model turn.
   * @param request Official subscription provider.
   * @returns Explicitly refreshed account usage.
   */
  @Remote
  refresh(request: SubscriptionQuotaRequest): Promise<SubscriptionQuotaSnapshot> {
    owner(this.ctx)
    return this.fetch(request.engine)
  }

  /** Cancel an old authentication generation; it cannot publish a previous account's result.
   * @param engine Provider whose login is changing.
   */
  invalidate(engine: SubscriptionEngine): void {
    this.active.get(engine)?.controller.abort(new Error('Subscription authentication changed'))
    this.active.delete(engine)
  }

  private fetch(engine: SubscriptionEngine): Promise<SubscriptionQuotaSnapshot> {
    this.lifetime.signal.throwIfAborted()
    const previous = this.active.get(engine)
    if (previous) return previous.promise
    const controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, this.lifetime.signal, AbortSignal.timeout(this.timeoutMs)])
    const promise = (async (): Promise<SubscriptionQuotaSnapshot> => {
      try {
        signal.throwIfAborted()
        const result = await this.load(engine, signal)
        signal.throwIfAborted()
        return { engine, fetchedAt: Date.now(), ...result }
      } catch (_error: unknown) {
        // Account status and transport failures never disclose native stderr or credentials.
        return { engine, fetchedAt: Date.now(), status: 'unavailable', windows: [], reason: 'failed' }
      }
    })().finally(() => { if (this.active.get(engine)?.promise === promise) this.active.delete(engine) })
    this.active.set(engine, { controller, promise })
    return promise
  }
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid account quota response')
  return value as Record<string, unknown>
}
function percent(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) throw new Error('Invalid quota percentage')
  return value
}
function integer(value: unknown, factor = 1): number | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || !Number.isSafeInteger(value * factor)) throw new Error('Invalid quota duration or reset')
  return value * factor
}
function reset(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('Invalid quota reset date')
  return Date.parse(value)
}
const unavailable: QuotaResult = { status: 'unavailable', windows: [], reason: 'unsupported' }

/** Isolate the experimental Claude SDK response; session costs and behavior attribution are excluded.
 * @param value Untrusted SDK control response. @returns Safe provider-reported windows.
 */
export function parseClaudeQuota(value: unknown): QuotaResult {
  const response = object(value)
  if (response.rate_limits_available === false || response.rate_limits === null) return unavailable
  if (response.rate_limits_available !== true) throw new Error('Invalid Claude quota availability')
  const limits = object(response.rate_limits)
  const windows: SubscriptionQuotaWindow[] = []
  for (const [id, label, duration] of [
    ['five_hour', '5h', 300], ['seven_day', '7d', 10080], ['seven_day_opus', 'Opus · 7d', 10080],
    ['seven_day_sonnet', 'Sonnet · 7d', 10080], ['seven_day_oauth_apps', 'OAuth apps · 7d', 10080],
  ] as const) {
    if (limits[id] === null || limits[id] === undefined) continue
    const window = object(limits[id])
    windows.push({ id, label, usedPercent: percent(window.utilization), windowDurationMins: duration, resetsAt: reset(window.resets_at) })
  }
  if (limits.model_scoped !== undefined) {
    if (!Array.isArray(limits.model_scoped)) throw new Error('Invalid Claude model quota windows')
    for (const [index, value] of limits.model_scoped.entries()) {
      const window = object(value)
      if (typeof window.display_name !== 'string' || window.display_name.trim() === '') throw new Error('Invalid Claude model quota label')
      windows.push({
        id: `model:${index}`, label: window.display_name, usedPercent: percent(window.utilization),
        windowDurationMins: 10080, resetsAt: reset(window.resets_at),
      })
    }
  }
  return windows.length ? { status: 'ready', windows } : unavailable
}

/** Parse bundled Codex app-server quota windows, preferring its multi-bucket representation.
 * @param value Untrusted account/rateLimits/read response. @returns Safe provider-reported windows.
 */
export function parseCodexQuota(value: unknown): QuotaResult {
  const response = object(value)
  const byId = response.rateLimitsByLimitId === null || response.rateLimitsByLimitId === undefined
    ? undefined : object(response.rateLimitsByLimitId)
  const buckets = byId === undefined ? [['codex', response.rateLimits] as const] : Object.entries(byId)
  const windows: SubscriptionQuotaWindow[] = []
  for (const [id, value] of buckets) {
    const bucket = object(value)
    for (const key of ['primary', 'secondary'] as const) {
      if (bucket[key] === null || bucket[key] === undefined) continue
      const window = object(bucket[key])
      const duration = integer(window.windowDurationMins)
      windows.push({ id: `${id}:${key}`, label: id, usedPercent: percent(window.usedPercent), windowDurationMins: duration, resetsAt: integer(window.resetsAt, 1000) })
    }
  }
  return windows.length ? { status: 'ready', windows } : unavailable
}
