import { Context } from '@deepseek-ai/cordis'
import type { SubscriptionEngine } from '@deepseek-ai/dsh-agent'
import type { PeerId, Principal, RemoteInvocation } from '@deepseek-ai/dsh-typert-protocol'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { SubscriptionQuota, parseClaudeQuota, parseCodexQuota, type QuotaResult } from '../src/quota.ts'

const result: QuotaResult = { status: 'ready', windows: [{ id: 'five_hour', label: '5h', usedPercent: 0, windowDurationMins: 300, resetsAt: null }] }
type Loader = (engine: SubscriptionEngine, signal: AbortSignal) => Promise<QuotaResult>
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface PrincipalMap { 'test-quota-guest': { kind: 'test-quota-guest' } }
}

async function setup(load = vi.fn<Loader>(async () => result)): Promise<{ ctx: Context; service: SubscriptionQuota; load: typeof load }> {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  let service!: SubscriptionQuota
  await ctx.plugin({ apply(inner: Context) { service = new SubscriptionQuota(inner, load, 1000) } })
  return { ctx, service, load }
}

describe('native account quota parsers', () => {
  it('keeps Claude zero, missing counters and per-model windows distinct', () => {
    expect(parseClaudeQuota({ rate_limits_available: true, rate_limits: {
      five_hour: { utilization: 0, resets_at: '2026-10-20T01:00:00Z' }, seven_day: { utilization: null, resets_at: null },
      seven_day_opus: { utilization: 100, resets_at: null }, seven_day_sonnet: null,
    }, session: { secrets: 'not projected' }, behaviors: { secrets: 'not projected' } })).toEqual({ status: 'ready', windows: [
      { id: 'five_hour', label: '5h', usedPercent: 0, windowDurationMins: 300, resetsAt: Date.parse('2026-10-20T01:00:00Z') },
      { id: 'seven_day', label: '7d', usedPercent: null, windowDurationMins: 10080, resetsAt: null },
      { id: 'seven_day_opus', label: 'Opus · 7d', usedPercent: 100, windowDurationMins: 10080, resetsAt: null },
    ] })
  })

  it('does not invent usage for API credentials or missing subscription scopes', () => {
    expect(parseClaudeQuota({ rate_limits_available: false, rate_limits: null })).toEqual({ status: 'unavailable', windows: [], reason: 'unsupported' })
    expect(parseClaudeQuota({ rate_limits_available: true, rate_limits: {} }).status).toBe('unavailable')
  })

  it('includes additive Claude model buckets without exposing session costs', () => {
    const parsed = parseClaudeQuota({
      rate_limits_available: true, rate_limits: { model_scoped: [{ display_name: 'Native model', utilization: 12, resets_at: null }] },
    })
    expect(parsed.windows).toEqual([{ id: 'model:0', label: 'Native model', usedPercent: 12, windowDurationMins: 10080, resetsAt: null }])
    expect(() => parseClaudeQuota({ rate_limits_available: true, rate_limits: { model_scoped: {} } })).toThrow()
    expect(() => parseClaudeQuota({ rate_limits_available: true, rate_limits: { model_scoped: [{}] } })).toThrow()
  })

  it('rejects malformed native counters and reset dates', () => {
    for (const utilization of [-1, 101, NaN, Infinity, '2']) expect(() => parseClaudeQuota({ rate_limits_available: true, rate_limits: { five_hour: { utilization } } })).toThrow()
    expect(() => parseClaudeQuota({ rate_limits_available: 'true' })).toThrow()
    expect(() => parseClaudeQuota({ rate_limits_available: true, rate_limits: { five_hour: { utilization: 1, resets_at: 'tomorrow' } } })).toThrow()
  })

  it('prefers Codex per-limit buckets and converts seconds to milliseconds', () => {
    expect(parseCodexQuota({ accountId: 'private', rateLimits: { primary: { usedPercent: 99 } }, rateLimitsByLimitId: {
      codex: {
        primary: { usedPercent: 0, windowDurationMins: 300, resetsAt: 123 },
        secondary: { usedPercent: 42, windowDurationMins: 10080, resetsAt: null },
      },
      extra: { primary: null, secondary: { usedPercent: 2, windowDurationMins: null } },
    } })).toEqual({ status: 'ready', windows: [
      { id: 'codex:primary', label: 'codex', usedPercent: 0, windowDurationMins: 300, resetsAt: 123000 },
      { id: 'codex:secondary', label: 'codex', usedPercent: 42, windowDurationMins: 10080, resetsAt: null },
      { id: 'extra:secondary', label: 'extra', usedPercent: 2, windowDurationMins: null, resetsAt: null },
    ] })
  })

  it('supports legacy Codex buckets and reports empty limits unavailable', () => {
    expect(parseCodexQuota({ rateLimits: { primary: { usedPercent: 5 } } }).windows[0]?.usedPercent).toBe(5)
    expect(parseCodexQuota({ rateLimits: {} }).status).toBe('unavailable')
    expect(() => parseCodexQuota({ rateLimits: { primary: { usedPercent: 5, resetsAt: -1 } } })).toThrow()
    expect(() => parseCodexQuota({ rateLimitsByLimitId: [] })).toThrow()
  })
})

describe('owner account quota lifecycle', () => {
  it('shares concurrent reads, but each later read fetches the current account', async () => {
    const pending = Promise.withResolvers<QuotaResult>()
    const load = vi.fn(() => pending.promise)
    const { service } = await setup(load)
    const first = service.read({ engine: 'claude' })
    const second = service.refresh({ engine: 'claude' })
    expect(first).toBe(second)
    pending.resolve(result)
    expect((await first).windows[0]?.usedPercent).toBe(0)
    await service.read({ engine: 'claude' })
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('does not disclose provider errors or retain old counters after failure', async () => {
    const { service, load } = await setup()
    await service.read({ engine: 'claude' })
    load.mockRejectedValueOnce(new Error('secret credential'))
    const next = await service.refresh({ engine: 'claude' })
    expect(next).toMatchObject({ status: 'unavailable', reason: 'failed', windows: [] })
    expect(JSON.stringify(next)).not.toContain('secret')
  })

  it('discards an in-flight prior account result when login changes', async () => {
    const pending = Promise.withResolvers<QuotaResult>()
    const load = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(result)
    const { service } = await setup(load)
    const old = service.read({ engine: 'claude' })
    service.invalidate('claude')
    const current = service.read({ engine: 'claude' })
    pending.resolve({ status: 'ready', windows: [{ ...result.windows[0]!, usedPercent: 90 }] })
    expect(await old).toMatchObject({ status: 'unavailable', windows: [] })
    expect((await current).windows[0]?.usedPercent).toBe(0)
  })

  it('cancels owned reads and awaits provider disposal on unload', async () => {
    const disposed = vi.fn()
    const load = vi.fn(async (_engine: SubscriptionEngine, signal: AbortSignal): Promise<QuotaResult> => {
      await new Promise<void>((resolve) => { signal.addEventListener('abort', () => { resolve() }, { once: true }) })
      await Promise.resolve()
      disposed()
      return result
    })
    const { ctx, service } = await setup(load)
    const operation = service.read({ engine: 'codex' })
    await ctx.fiber.dispose()
    expect(disposed).toHaveBeenCalledOnce()
    expect(await operation).toMatchObject({ status: 'unavailable', windows: [] })
    expect(() => service.read({ engine: 'codex' })).toThrow()
  })

  it('blocks non-owner callers before starting an account read', async () => {
    const { ctx, load } = await setup()
    const principal: Principal = { kind: 'test-quota-guest' }
    const invocation: RemoteInvocation = {
      request: { namespace: 'subscriptionQuota', method: 'read', args: {} }, service: 'subscriptionQuota',
      peer: { id: 'quota-peer' as PeerId, ctx, principal, interactions: 'answer', signal: new AbortController().signal, dispose: async () => {} },
      signal: new AbortController().signal,
      uplink: <In>(): AsyncIterable<In> => ({ [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true, value: undefined }) }) }),
    }
    const caller = ctx.extend({ invocation }).subscriptionQuota
    expect(() => caller.read({ engine: 'claude' })).toThrow('only to the owner')
    expect(() => caller.refresh({ engine: 'codex' })).toThrow('only to the owner')
    expect(load).not.toHaveBeenCalled()
  })
})
