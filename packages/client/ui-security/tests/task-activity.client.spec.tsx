// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TaskActivity } from '../src/client/TaskActivity.tsx'
import { ja } from '../src/client/locales.ts'
afterEach(() => { cleanup(); vi.useRealTimers() })
type Props = Parameters<typeof TaskActivity>[0]
const unused = (): never => { throw new Error('Unused framework hook') }
const state = {
  planning: { plans: [] },
  workers: { runs: [], limits: { requestTimeoutMs: 1, responseBytes: 1, modelTimeoutMs: 1 } },
  execution: { runs: [], limits: { maxRounds: 1, maxRequests: 1, timeoutMs: 1 } } }
function props(readTaskActivity: Props['readTaskActivity']): Props {
  return { workspaceId: 'workspace' as Props['workspaceId'], taskId: 'task', task: { id: 'task', name: 'Task', description: '', objective: '', assetIds: [], status: 'draft', archived: false, pinned: false, createdAt: 1, updatedAt: 1 }, assets: [], view: 'timeline', t: key => ja[key as keyof typeof ja], readTaskActivity,
    usePanelInfo: unused, useRemoteAccess: unused, useSessions: unused, useSessionStatus: unused,
    useSessionRetainInfo: unused, useSessionAccess: unused, useWorkspaces: unused, useWorkspaceAccess: unused, useResource: unused }
}
it('polls after settling and pauses until manually refreshed', async () => {
  vi.useFakeTimers()
  const read = vi.fn(async () => state)
  render(<TaskActivity {...props(read)} />)
  await act(async () => { await Promise.resolve() })
  expect(read).toHaveBeenCalledTimes(1)
  await act(async () => { await vi.advanceTimersByTimeAsync(1500) })
  expect(read).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole('button', { name: '自動更新' }))
  await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
  expect(read).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole('button', { name: '更新' }))
  await act(async () => { await Promise.resolve() })
  expect(read).toHaveBeenCalledTimes(3)
})
it('does not overlap requests and ignores old task results', async () => {
  let resolve: ((value: typeof state) => void) | undefined
  const read = vi.fn(() => new Promise<typeof state>((done) => { resolve = done }))
  const current = props(read)
  const view = render(<TaskActivity {...current} />)
  await act(async () => { await Promise.resolve() })
  expect(read).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: '自動更新' }))
  fireEvent.click(screen.getByRole('button', { name: '更新停止中' }))
  await act(async () => { await Promise.resolve() })
  expect(read).toHaveBeenCalledTimes(1)
  view.rerender(<TaskActivity {...current} taskId="other" task={{ ...current.task, id: 'other' }} />)
  await act(async () => { await Promise.resolve() })
  expect(read).toHaveBeenCalledTimes(2)
  await act(async () => { resolve?.(state) })
})
it('renders the shared knowledge returned by the activity read without needing lifecycle events', async () => {
  const read = vi.fn(async () => ({ ...state, exploration: { revision: 1, nodes: [{
    id: 'fact:test', kind: 'fact' as const, summary: 'Saved observed header', state: 'observed', assetIds: [],
  }], edges: [] } }))
  render(<TaskActivity {...props(read)} view="exploration" />)
  expect(await screen.findByRole('button', { name: 'Saved observed header' })).toBeTruthy()
  expect(screen.queryByText(ja.explorationSample)).toBeNull()
  expect(read).toHaveBeenCalledTimes(1)
})
