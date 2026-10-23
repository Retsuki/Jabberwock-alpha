import { Context } from '@deepseek-ai/cordis'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import SubscriptionEngines from '../src/index.ts'

const mocks = vi.hoisted(() => ({ initialize: vi.fn(), account: vi.fn(), request: vi.fn(), close: vi.fn(), claudeQuota: vi.fn() }))
vi.mock('../src/codex.ts', async original => ({ ...await original<typeof import('../src/codex.ts')>(), CodexConnection: class {
  initialize = mocks.initialize
  account = mocks.account
  wire = { request: mocks.request }
  close = mocks.close
} }))
vi.mock('../src/claude.ts', async original => ({ ...await original<typeof import('../src/claude.ts')>(), claudeQuota: mocks.claudeQuota }))

async function setup(): Promise<Context> {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin({ inject: ['sessionProjections'], apply(inner: Context) {
    new SubscriptionEngines(inner, { codexCommand: 'unused', claudeCommand: 'claude', statusTimeoutMs: 1000, loginTimeoutMs: 1000, modelListTimeoutMs: 1000 })
  } })
  return ctx
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.initialize.mockResolvedValue(undefined)
  mocks.account.mockResolvedValue({ engine: 'codex', status: 'connected' })
  mocks.close.mockResolvedValue(undefined)
  mocks.request.mockResolvedValue({ rateLimits: { primary: { usedPercent: 0, windowDurationMins: 300, resetsAt: null } } })
})

describe('official account quota composition', () => {
  it('reads Codex account limits without starting a thread or turn and closes the app-server', async () => {
    const ctx = await setup()
    expect(await ctx.subscriptionQuota.read({ engine: 'codex' })).toMatchObject({ status: 'ready', windows: [{ usedPercent: 0 }] })
    expect(mocks.initialize).toHaveBeenCalledOnce()
    expect(mocks.account).toHaveBeenCalledOnce()
    expect(mocks.request).toHaveBeenCalledExactlyOnceWith('account/rateLimits/read', {}, expect.any(AbortSignal))
    expect(mocks.close).toHaveBeenCalledOnce()
  })

  it('does not read limits for signed-out or API-key Codex accounts', async () => {
    const ctx = await setup()
    mocks.account.mockResolvedValueOnce({ engine: 'codex', status: 'signed-out' })
    expect(await ctx.subscriptionQuota.read({ engine: 'codex' })).toMatchObject({ status: 'unavailable', reason: 'not-connected' })
    expect(mocks.request).not.toHaveBeenCalled()
    expect(mocks.close).toHaveBeenCalledOnce()
  })

  it('closes the app-server on initialization, transport or parse failure', async () => {
    const ctx = await setup()
    mocks.initialize.mockRejectedValueOnce(new Error('startup'))
    expect((await ctx.subscriptionQuota.refresh({ engine: 'codex' })).status).toBe('unavailable')
    mocks.request.mockRejectedValueOnce(new Error('transport'))
    expect((await ctx.subscriptionQuota.refresh({ engine: 'codex' })).status).toBe('unavailable')
    mocks.request.mockResolvedValueOnce({ rateLimits: { primary: { usedPercent: -1 } } })
    expect((await ctx.subscriptionQuota.refresh({ engine: 'codex' })).status).toBe('unavailable')
    expect(mocks.close).toHaveBeenCalledTimes(3)
  })

  it('routes Claude reads to the independent zero-prompt control adapter', async () => {
    const ctx = await setup()
    mocks.claudeQuota.mockResolvedValue({ status: 'unavailable', windows: [], reason: 'unsupported' })
    expect(await ctx.subscriptionQuota.read({ engine: 'claude' })).toMatchObject({ status: 'unavailable', reason: 'unsupported' })
    expect(mocks.claudeQuota).toHaveBeenCalledExactlyOnceWith(expect.anything(), 'claude', 1000, expect.any(AbortSignal))
    expect(mocks.request).not.toHaveBeenCalled()
  })
})
