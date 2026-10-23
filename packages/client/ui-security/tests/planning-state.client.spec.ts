import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SecurityConversationRequest } from '../src/conversation-types.ts'
import { createPlanningState } from '../src/client/planning-state.ts'

const target: SecurityConversationRequest = { workspaceId: 'workspace' as SecurityConversationRequest['workspaceId'], taskId: 'task' }

afterEach(() => { vi.useRealTimers() })

describe('Conversation-started Planner visibility', () => {
  it('keeps observing idle plans until the last view releases its observer', async () => {
    vi.useFakeTimers()
    const read = vi.fn(() => Promise.resolve({ ok: true as const, value: { plans: [] } }))
    const state = createPlanningState({ read, start: vi.fn(), cancel: vi.fn() }, () => Promise.resolve(true))
    const first = new AbortController()
    const second = new AbortController()
    state.watchSecurityPlanning(target, first.signal)
    state.watchSecurityPlanning(target, second.signal)
    await vi.advanceTimersByTimeAsync(1500)
    expect(read).toHaveBeenCalledTimes(2)
    first.abort()
    await vi.advanceTimersByTimeAsync(1500)
    expect(read).toHaveBeenCalledTimes(3)
    second.abort()
    await vi.advanceTimersByTimeAsync(3000)
    expect(read).toHaveBeenCalledTimes(3)
    state.dispose()
  })

  it('retries failed reads and disposal cancels the observation loop', async () => {
    vi.useFakeTimers()
    const read = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ok: true, value: { plans: [] } })
    const state = createPlanningState({ read, start: vi.fn(), cancel: vi.fn() }, () => Promise.resolve(true))
    state.watchSecurityPlanning(target, new AbortController().signal)
    await vi.advanceTimersByTimeAsync(1500)
    expect(read).toHaveBeenCalledTimes(2)
    state.dispose()
    await vi.advanceTimersByTimeAsync(3000)
    expect(read).toHaveBeenCalledTimes(2)
  })
})
