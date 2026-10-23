import { Context } from '@deepseek-ai/cordis'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { claudeModels } from '../src/claude.ts'

const mocks = vi.hoisted(() => ({
  query: vi.fn(), capture: vi.fn(), close: vi.fn(), supportedModels: vi.fn(),
}))
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: mocks.query }))
vi.mock('../src/shared.ts', async original => ({
  ...await original<typeof import('../src/shared.ts')>(), capture: mocks.capture,
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.capture.mockResolvedValue(JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty' }))
  mocks.supportedModels.mockResolvedValue([{ value: 'sonnet', displayName: 'Native Sonnet' }])
  mocks.query.mockReturnValue({ supportedModels: mocks.supportedModels, close: mocks.close })
})

describe('conversation-only Claude model discovery', () => {
  it('uses the authenticated native catalog without a string prompt or tools', async () => {
    const result = await claudeModels(new Context(), 'claude', 1000, new AbortController().signal)
    expect(result).toEqual([{ id: 'default', name: 'Claude default' }, { id: 'sonnet', name: 'Native Sonnet' }])
    const request: unknown = mocks.query.mock.calls[0]?.[0]
    expect(request).toHaveProperty('options.tools', [])
    expect(request).toHaveProperty('options.mcpServers', {})
    expect(request).toHaveProperty('options.settingSources', [])
    expect(request).toHaveProperty('options.persistSession', false)
    expect(request).toHaveProperty('prompt', expect.any(Object))
    expect(mocks.close).toHaveBeenCalledOnce()
  })

  it('does not create an SDK query for API-key authentication', async () => {
    mocks.capture.mockResolvedValue(JSON.stringify({ loggedIn: true, authMethod: 'api-key', apiProvider: 'firstParty' }))
    await expect(claudeModels(new Context(), 'claude', 1000, new AbortController().signal)).rejects.toThrow('subscription login')
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('closes the SDK query when native model discovery fails', async () => {
    mocks.supportedModels.mockRejectedValue(new Error('catalog unavailable'))
    await expect(claudeModels(new Context(), 'claude', 1000, new AbortController().signal)).rejects.toThrow('catalog unavailable')
    expect(mocks.close).toHaveBeenCalledOnce()
  })

  it('does not start discovery after service cancellation', async () => {
    const abort = new AbortController()
    abort.abort(new Error('service stopped'))
    await expect(claudeModels(new Context(), 'claude', 1000, abort.signal)).rejects.toThrow('service stopped')
    expect(mocks.query).not.toHaveBeenCalled()
  })
})
