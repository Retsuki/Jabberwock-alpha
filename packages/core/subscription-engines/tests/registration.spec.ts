import { Context } from '@deepseek-ai/cordis'
import type { AgentExecutionEngine } from '@deepseek-ai/dsh-agent'
import { describe, expect, it, onTestFinished } from 'vitest'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SubscriptionEngines from '../src/index.ts'

async function setup(): Promise<{ ctx: Context; engines: SubscriptionEngines }> {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(SessionProjectionRegistry)
  let engines!: SubscriptionEngines
  await ctx.plugin({ inject: ['sessionProjections'], apply(inner: Context) {
    engines = new SubscriptionEngines(inner, {
      codexCommand: 'unused-codex', claudeCommand: 'unused-claude',
      statusTimeoutMs: 1000, loginTimeoutMs: 1000, modelListTimeoutMs: 2000,
    })
  } })
  return { ctx, engines }
}

function engine(id = 'internal-test'): AgentExecutionEngine {
  return { id, name: 'Internal test', listModels: async () => [], run: async function* () {} }
}

describe('lookup-only engine registration', () => {
  it('resolves internal registrations without adding model-catalog choices', async () => {
    const { engines } = await setup()
    const catalog = engines.list()
    const internal = engine()
    const dispose = engines.register(internal)
    expect(engines.get(internal.id)).toBe(internal)
    expect(engines.list()).toBe(catalog)
    expect(engines.list()).not.toContain(internal)
    expect(() => engines.register(engine())).toThrow('already registered')
    dispose()
    expect(engines.get(internal.id)).toBeUndefined()
  })

  it('rejects every built-in identity, including the hidden conversation engine', async () => {
    const { engines } = await setup()
    for (const id of ['codex-subscription', 'claude-subscription', 'claude-conversation', 'claude-host-tools']) {
      expect(() => engines.register(engine(id))).toThrow('already registered')
    }
  })

  it('keeps a later registration when an old disposer is called again', async () => {
    const { engines } = await setup()
    const internal = engine()
    const oldDispose = engines.register(internal)
    oldDispose()
    const dispose = engines.register(internal)
    oldDispose()
    expect(engines.get(internal.id)).toBe(internal)
    dispose()
    expect(engines.get(internal.id)).toBeUndefined()
  })

  it('disposes the registered key when the engine object identity field changes', async () => {
    const { engines } = await setup()
    const internal = engine()
    const dispose = engines.register(internal)
    internal.id = 'changed-id'
    dispose()
    expect(engines.get('internal-test')).toBeUndefined()
  })

  it('clears internal engines and rejects registrations after service unload', async () => {
    const { ctx, engines } = await setup()
    engines.register(engine())
    await ctx.fiber.dispose()
    expect(engines.get('internal-test')).toBeUndefined()
    expect(() => engines.register(engine())).toThrow('was unloaded')
  })
})
