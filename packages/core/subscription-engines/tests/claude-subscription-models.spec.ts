import { Context } from '@deepseek-ai/cordis'
import type { SubscriptionConnection } from '@deepseek-ai/dsh-agent'
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SubscriptionEngines from '../src/index.ts'

const mocks = vi.hoisted(() => ({ claudeModels: vi.fn(), claudeStatus: vi.fn() }))
vi.mock('../src/claude.ts', async original => ({
  ...await original<typeof import('../src/claude.ts')>(), claudeModels: mocks.claudeModels, claudeStatus: mocks.claudeStatus,
}))

const FALLBACK = [{ id: 'default', name: 'Claude default' }]
const CATALOG = [{ id: 'default', name: 'Claude default' }, { id: 'sonnet', name: 'Native Sonnet' }]
const CONNECTED: SubscriptionConnection = { engine: 'claude', name: 'Claude', status: 'connected' }
const SIGNED_OUT: SubscriptionConnection = { engine: 'claude', name: 'Claude', status: 'signed-out' }

type ModelList = readonly { id: string; name: string }[]

async function setup(): Promise<{ engines: SubscriptionEngines; warn: ReturnType<typeof vi.fn>; listClaude: () => Promise<ModelList> }> {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(SessionProjectionRegistry)
  let engines!: SubscriptionEngines
  const warn = vi.fn()
  await ctx.plugin({ inject: ['sessionProjections'], apply(inner: Context) {
    vi.spyOn(inner.logger, 'warn').mockImplementation(warn)
    engines = new SubscriptionEngines(inner, {
      codexCommand: 'unused-codex', claudeCommand: 'unused-claude',
      statusTimeoutMs: 1000, loginTimeoutMs: 1000, modelListTimeoutMs: 2000,
    })
  } })
  const claude = engines.list().find(engine => engine.id === 'claude-subscription')!
  return { engines, warn, listClaude: () => claude.listModels() }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.claudeModels.mockResolvedValue(CATALOG)
  mocks.claudeStatus.mockResolvedValue(CONNECTED)
})

describe('Claude subscription model list', () => {
  it('lists the default and the SDK models with the model-list deadline', async () => {
    const { listClaude } = await setup()
    await expect(listClaude()).resolves.toEqual(CATALOG)
    expect(mocks.claudeModels).toHaveBeenCalledWith(expect.anything(), 'unused-claude', 2000, expect.any(AbortSignal))
  })

  it('lists only the default, warns, and retries on the next call after a failure', async () => {
    const { listClaude, warn } = await setup()
    mocks.claudeModels.mockRejectedValueOnce(new Error('login required'))
    await expect(listClaude()).resolves.toEqual(FALLBACK)
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]?.[0]).toContain('login required')
    await expect(listClaude()).resolves.toEqual(CATALOG)
    expect(mocks.claudeModels).toHaveBeenCalledTimes(2)
  })

  it('reports a non-Error failure by its string form', async () => {
    const { listClaude, warn } = await setup()
    mocks.claudeModels.mockRejectedValueOnce('timed out')
    await expect(listClaude()).resolves.toEqual(FALLBACK)
    expect(warn.mock.calls[0]?.[0]).toContain('timed out')
  })

  it('keeps a newer cached attempt when an older failure settles late', async () => {
    const { listClaude, engines } = await setup()
    const failure = Promise.withResolvers<never>()
    mocks.claudeModels.mockReturnValueOnce(failure.promise)
    const first = listClaude()
    mocks.claudeStatus.mockResolvedValueOnce(SIGNED_OUT)
    await engines.connections()
    await expect(listClaude()).resolves.toEqual(CATALOG)
    failure.reject(new Error('late'))
    await expect(first).resolves.toEqual(FALLBACK)
    await expect(listClaude()).resolves.toEqual(CATALOG)
    expect(mocks.claudeModels).toHaveBeenCalledTimes(2)
  })

  it('caches a success and shares one query between concurrent calls', async () => {
    const { listClaude } = await setup()
    const [first, second] = await Promise.all([listClaude(), listClaude()])
    expect(first).toEqual(CATALOG)
    expect(second).toEqual(CATALOG)
    await expect(listClaude()).resolves.toEqual(CATALOG)
    expect(mocks.claudeModels).toHaveBeenCalledOnce()
  })

  it('clears the cache when a Claude login starts', async () => {
    const { listClaude, engines } = await setup()
    await listClaude()
    await expect(engines.connect('claude')).rejects.toThrow()
    await listClaude()
    expect(mocks.claudeModels).toHaveBeenCalledTimes(2)
  })

  it('keeps the cache when a Codex login starts', async () => {
    const { listClaude, engines } = await setup()
    await listClaude()
    await expect(engines.connect('codex')).rejects.toThrow()
    await listClaude()
    expect(mocks.claudeModels).toHaveBeenCalledOnce()
  })

  it('keeps the cache while Claude is connected and clears it otherwise', async () => {
    const { listClaude, engines } = await setup()
    await listClaude()
    await expect(engines.connections()).resolves.toContainEqual(CONNECTED)
    await listClaude()
    expect(mocks.claudeModels).toHaveBeenCalledOnce()
    mocks.claudeStatus.mockResolvedValue(SIGNED_OUT)
    await expect(engines.connections()).resolves.toContainEqual(SIGNED_OUT)
    await listClaude()
    expect(mocks.claudeModels).toHaveBeenCalledTimes(2)
  })
})

describe('model-list timeout configuration', () => {
  it('defaults to eight seconds and rejects values below one second', () => {
    const base = { codexCommand: 'codex' }
    expect(SubscriptionEngines.Config(base)).toHaveProperty('modelListTimeoutMs', 8000)
    expect(() => SubscriptionEngines.Config({ ...base, modelListTimeoutMs: 999 })).toThrow()
    expect(SubscriptionEngines.Config({ ...base, modelListTimeoutMs: 1000 })).toHaveProperty('modelListTimeoutMs', 1000)
  })
})
