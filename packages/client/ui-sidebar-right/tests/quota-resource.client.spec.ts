/** The resource owns refresh polling and drops results after its final holder leaves. */
import { describe, expect, it, vi } from 'vitest'
import { createQuotaResource } from '../src/client/tabs/usage/quota-resource.ts'

describe('quota resource lifetime', () => {
  it('wakes a held resource for manual refresh and settles after the fresh result', async () => {
    const read = vi.fn(async () => ({ ok: true as const, value: { engine: 'claude' as const, status: 'ready' as const, fetchedAt: 1, windows: [] } }))
    const resource = createQuotaResource(read)
    const abort = new AbortController()
    const stream = resource.open('dsh-resource://subscription-quota/claude', { signal: abort.signal })
    expect((await stream.next()).done).toBe(false)
    const next = stream.next()
    await resource.refresh('claude')
    expect((await next).done).toBe(false)
    expect(read).toHaveBeenCalledTimes(2)
    abort.abort()
    expect((await stream.next()).done).toBe(true)
  })
  it('does not publish a response received after cancellation', async () => {
    let finish = (): void => {}
    const resource = createQuotaResource(() => new Promise((resolve) => {
      finish = () => { resolve({ ok: true, value: { engine: 'codex', status: 'ready', fetchedAt: 1, windows: [] } }) }
    }))
    const abort = new AbortController()
    const stream = resource.open('dsh-resource://subscription-quota/codex', { signal: abort.signal })
    const next = stream.next()
    abort.abort()
    finish()
    expect((await next).done).toBe(true)
  })
})
