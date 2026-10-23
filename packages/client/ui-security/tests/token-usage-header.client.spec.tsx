// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import type {} from '../src/client/index.ts'
import { ja } from '../src/client/locales.ts'
import type { TokenUsageProjection } from '@deepseek-ai/dsh-token-meter/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionProjectionSnapshot } from '@deepseek-ai/dsh-api-session-controller/client'
import type { UsageSession } from '../src/client/TokenUsageHeader.tsx'
import { securityTokenTotals, TokenUsageHeader } from '../src/client/TokenUsageHeader.tsx'

const id = 'session' as SessionId
const zeroUsage: TokenUsageProjection = { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }
const native = (input = 42): SessionProjectionSnapshot => ({ state: 'ready', error: null, values: {
  engineUsage: { engine: 'claude', updatedAt: 1, tokens: { inputTokens: input, outputTokens: 3, cacheReadTokens: 0, cacheWriteTokens: 10 } },
  tokenUsage: { uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
} })
describe('saved Session token totals', () => {
  it('counts a cumulative native sample once per Session and replaces it when updated', () => {
    const sessions: UsageSession[] = [{ sessionId: id, engine: 'claude' }, { sessionId: id, engine: 'claude' }]
    expect(securityTokenTotals(sessions, { [id]: native() })).toEqual({ input: 42, output: 3, read: 0, write: 10 })
    expect(securityTokenTotals(sessions, { [id]: native(50) }).input).toBe(50)
    const other = 'other' as SessionId
    expect(securityTokenTotals([...sessions, { sessionId: other, engine: 'claude' }], { [id]: native(), [other]: native() }).input).toBe(84)
  })
  it('keeps unavailable native usage separate from generic initial zeros and actual reported zeros', () => {
    const sample = native(0)
    expect(securityTokenTotals([{ sessionId: id, engine: 'claude' }], { [id]: sample }).input).toBe(0)
    const missing = { ...sample, values: { tokenUsage: zeroUsage } }
    expect(securityTokenTotals([{ sessionId: id, engine: 'claude' }], { [id]: missing }).input).toBeUndefined()
    expect(securityTokenTotals([], {}).input).toBeUndefined()
  })
  it('requires a provider usage observation before exposing generic cumulative counters', () => {
    const sample = native()
    const generic: SessionProjectionSnapshot = { ...sample, values: { tokenUsage: zeroUsage } }
    const sessions: UsageSession[] = [{ sessionId: id, engine: 'deepseek-account' }]
    expect(securityTokenTotals(sessions, { [id]: generic }).input).toBeUndefined()
    const observed = { ...generic, values: { ...generic.values, contextPressure: { pressureTokens: 0 } } }
    expect(securityTokenTotals(sessions, { [id]: observed })).toEqual({ input: 0, output: 0, read: 0, write: 0 })
  })
  it('does not claim a partial role aggregate is its complete usage', () => {
    expect(securityTokenTotals([{ sessionId: id, engine: 'claude' }, { sessionId: 'missing' as SessionId, engine: 'claude' }], { [id]: native() }).input).toBeUndefined()
  })
})

afterEach(cleanup)
type Props = Parameters<typeof TokenUsageHeader>[0]
type SessionList = Parameters<Parameters<Props['useSessions']>[0]>[0]
const unused = (): never => { throw new Error('Unused framework hook') }
function headerProps(state: () => SessionList, refresh: Props['refreshTokenProjection']): Props {
  return {
    sessions: [{ sessionId: id, engine: 'claude' }], role: 'planner', refreshTokenProjection: refresh,
    usePanelInfo: unused, useRemoteAccess: unused, useSessionStatus: unused, useSessionRetainInfo: unused,
    useSessionAccess: unused, useWorkspaces: unused, useWorkspaceAccess: unused, useResource: unused,
    useSessions: selector => selector(state()), t: key => key in ja ? ja[key as keyof typeof ja] : key,
  }
}
it('renders compact counts with exact cache-write totals and preserves zero versus unavailable', async () => {
  const state: SessionList = { ids: [], byId: {}, phase: 'ready', projectionsBySession: { [id]: native(43511) } }
  const props = headerProps(() => state, vi.fn(async () => {}))
  const view = render(<TokenUsageHeader {...props} />)
  const header = screen.getByLabelText(/プランナー全体/)
  expect(header.textContent).toBe('入力 43.5Kキャッシュ 0出力 3')
  expect(header.title).toContain('キャッシュ書込: 10')
  expect(header.title).toContain('入力: 43,511')
  view.rerender(<TokenUsageHeader {...props} sessions={[]} />)
  expect(screen.getByLabelText(/プランナー全体/).textContent).toBe('入力 —キャッシュ —出力 —')
  await act(async () => {})
})
it('switches Session ownership while a baseline read is pending and leaves rejected reads unavailable', async () => {
  const other = 'other' as SessionId
  let state: SessionList = { ids: [], byId: {}, phase: 'ready', projectionsBySession: {} }
  let finish: (() => void) | undefined
  const refresh = vi.fn<Props['refreshTokenProjection']>(sessionId => sessionId === id
    ? new Promise<void>((resolve) => { finish = resolve }) : Promise.reject(new Error('read failed')))
  const props = headerProps(() => state, refresh)
  const view = render(<TokenUsageHeader {...props} />)
  view.rerender(<TokenUsageHeader {...props} role="worker" sessions={[{ sessionId: other, engine: 'claude' }]} />)
  await act(async () => { state = { ...state, projectionsBySession: { [id]: native(999) } }; finish?.() })
  view.rerender(<TokenUsageHeader {...props} role="worker" sessions={[{ sessionId: other, engine: 'claude' }]} />)
  expect(screen.getByLabelText(/このワーカー/).textContent).toBe('入力 —キャッシュ —出力 —')
  state = { ...state, projectionsBySession: { ...state.projectionsBySession, [other]: native(0) } }
  view.rerender(<TokenUsageHeader {...props} role="worker" sessions={[{ sessionId: other, engine: 'claude' }]} />)
  expect(screen.getByLabelText(/このワーカー/).textContent).toBe('入力 0キャッシュ 0出力 3')
  expect(refresh.mock.calls.map(([sessionId]) => sessionId)).toEqual([id, other])
})
