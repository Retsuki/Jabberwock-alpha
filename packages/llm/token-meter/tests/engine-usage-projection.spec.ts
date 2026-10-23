import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import TokenMeter from '../src/index.ts'

const contexts: Context[] = []
afterEach(async () => { await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose())) })
async function fixture() {
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(SessionStore); await ctx.plugin(SessionProjectionRegistry); await ctx.plugin(TokenMeter)
  const session = ctx.sessions.create()
  return { session, read: () => ctx.sessionProjections.snapshot(session).values.engineUsage }
}
describe('native context model attribution', () => {
  it('keeps an empty session unavailable and preserves measured zero', async () => {
    const f = await fixture()
    expect(f.read()).toBeNull()
    f.session.append('engine/usage', { engine: 'claude', updatedAt: 0, context: { usedTokens: 0, maxTokens: 100 } })
    expect(f.read()).toEqual({ engine: 'claude', updatedAt: 0, context: { usedTokens: 0, maxTokens: 100 } })
  })
  it('attributes an observed model ID to the exact requested alias without changing the recorded event', async () => {
    const f = await fixture()
    f.session.append('request/header', { header: { config: { provider: 'claude-subscription', model: 'sonnet' } }, reason: 'initial' })
    f.session.append('engine/usage', { engine: 'claude', model: 'native-model-id', updatedAt: 1, context: { usedTokens: 3 } })
    expect(f.read()).toMatchObject({ requestedModel: 'sonnet', model: 'native-model-id' })
    f.session.append('request/header', { header: { config: { provider: 'claude-subscription', model: 'opus' } }, reason: 'change' })
    expect(f.read()).toMatchObject({ requestedModel: 'sonnet' })
    f.session.append('engine/usage', { engine: 'claude', model: 'new-native-id', updatedAt: 2 })
    expect(f.read()).toMatchObject({ requestedModel: 'opus', model: 'new-native-id' })
  })
  it('does not attribute a different engine sample to the current request', async () => {
    const f = await fixture()
    f.session.append('request/header', { header: { config: { provider: 'codex-subscription', model: 'default' } }, reason: 'initial' })
    f.session.append('engine/usage', { engine: 'claude', updatedAt: 1 })
    expect(f.read()).not.toHaveProperty('requestedModel')
  })
})
