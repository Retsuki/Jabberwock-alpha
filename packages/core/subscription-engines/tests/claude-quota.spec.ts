import { Context } from '@deepseek-ai/cordis'
import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { claudeQuota } from '../src/claude.ts'

const mocks = vi.hoisted(() => ({ query: vi.fn(), capture: vi.fn(), close: vi.fn(), usage: vi.fn() }))
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: mocks.query }))
vi.mock('../src/shared.ts', async original => ({ ...await original<typeof import('../src/shared.ts')>(), capture: mocks.capture }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.capture.mockResolvedValue(JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty' }))
  mocks.usage.mockResolvedValue({ rate_limits_available: true, rate_limits: { five_hour: { utilization: 0, resets_at: null } } })
  mocks.query.mockReturnValue({ usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET: mocks.usage, close: mocks.close })
})

describe('Claude subscription quota control query', () => {
  it('reads account limits without a user message, tools, persisted Session or transcript behavior scan', async () => {
    expect(await claudeQuota(new Context(), 'claude', 1000, new AbortController().signal)).toMatchObject({ status: 'ready', windows: [{ usedPercent: 0 }] })
    expect(mocks.usage).toHaveBeenCalledExactlyOnceWith({ skipBehaviors: true })
    const request = mocks.query.mock.calls[0]?.[0] as { prompt: AsyncIterable<SDKUserMessage>; options: Record<string, unknown> }
    expect(request.options).toMatchObject({ tools: [], mcpServers: {}, settingSources: [], persistSession: false, strictMcpConfig: true })
    // The input iterator completes without yielding even when consumed after the control query closes.
    expect(await request.prompt[Symbol.asyncIterator]().next()).toMatchObject({ done: true })
    expect(mocks.close).toHaveBeenCalledOnce()
  })

  it('does not create a query for signed-out or API-key authentication', async () => {
    mocks.capture.mockResolvedValue(JSON.stringify({ loggedIn: true, authMethod: 'api-key', apiProvider: 'firstParty' }))
    expect(await claudeQuota(new Context(), 'claude', 1000, new AbortController().signal)).toMatchObject({ status: 'unavailable', reason: 'not-connected' })
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('closes the query on malformed experimental response or transport failure', async () => {
    mocks.usage.mockResolvedValueOnce({ rate_limits_available: true, rate_limits: [] })
    await expect(claudeQuota(new Context(), 'claude', 1000, new AbortController().signal)).rejects.toThrow()
    mocks.usage.mockRejectedValueOnce(new Error('usage unavailable'))
    await expect(claudeQuota(new Context(), 'claude', 1000, new AbortController().signal)).rejects.toThrow('usage unavailable')
    expect(mocks.close).toHaveBeenCalledTimes(2)
  })

  it('bounds a nonresponding control method and closes it without waiting for model output', async () => {
    mocks.usage.mockReturnValue(new Promise(() => {}))
    await expect(claudeQuota(new Context(), 'claude', 15, new AbortController().signal)).rejects.toThrow()
    expect(mocks.close).toHaveBeenCalledOnce()
  })

  it('cancels a pending control read and rejects without publishing quota counters', async () => {
    const abort = new AbortController()
    const started = Promise.withResolvers<undefined>()
    mocks.usage.mockImplementation(() => { started.resolve(undefined); return new Promise<never>(() => {}) })
    const operation = claudeQuota(new Context(), 'claude', 1000, abort.signal)
    await started.promise
    abort.abort(new Error('service unloaded'))
    await expect(operation).rejects.toThrow('service unloaded')
    expect(mocks.close).toHaveBeenCalledOnce()
  })

  it('does not perform auth status or start a control query after cancellation', async () => {
    const abort = new AbortController()
    abort.abort(new Error('already stopped'))
    await expect(claudeQuota(new Context(), 'claude', 1000, abort.signal)).rejects.toThrow('already stopped')
    expect(mocks.capture).not.toHaveBeenCalled()
    expect(mocks.query).not.toHaveBeenCalled()
  })
})
