// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TaskCoverageRecords } from '../src/client/TaskCoverageRecords.tsx'
import { ja } from '../src/client/locales.ts'
afterEach(() => { cleanup(); vi.useRealTimers() })
vi.mock('../src/client/TaskAssetCoverage.tsx', () => ({ TaskAssetCoverage: (props: { model: { nodes: { label: string }[] }; auto: boolean; onAutoChange: (value: boolean) => void; refresh: () => void; error: boolean; openWorker: (id: string) => void }) => <div>
  <div data-testid="nodes">{props.model.nodes.map(node => node.label).join(',')}</div>
  <button onClick={() => { props.onAutoChange(!props.auto) }}>Toggle polling</button>
  <button onClick={props.refresh}>Refresh graph</button>
  <button onClick={() => { props.openWorker('foreign') }}>Foreign worker</button>
  {props.error && <p role="alert">Read error</p>}
</div> }))
type Props = Parameters<typeof TaskCoverageRecords>[0]
const unused = (): never => { throw new Error('Unused framework hook') }
const task = { id: 'task', name: 'Task', description: '', objective: '', assetIds: ['asset'], status: 'draft' as const, archived: false, pinned: false, createdAt: 1, updatedAt: 1 }
const state: Awaited<ReturnType<Props['readTaskCoverage']>> = {
  records: { workspaceId: 'workspace' as Props['workspaceId'], revision: 1, companies: [],
    assets: [{ id: 'asset', companyId: 'company', kind: 'domain', value: 'example.org' }], tasks: [task] },
  planning: { plans: [] }, workers: { runs: [], limits: { requestTimeoutMs: 1, responseBytes: 1, modelTimeoutMs: 1 } },
  findings: { findings: [], retests: [] },
}
function props(readTaskCoverage: Props['readTaskCoverage']): Props {
  return { workspaceId: state.records.workspaceId, taskId: 'task', t: key => ja[key as keyof typeof ja], readTaskCoverage, openWorker: vi.fn(),
    usePanelInfo: unused, useRemoteAccess: unused, useSessions: unused, useSessionStatus: unused,
    useSessionRetainInfo: unused, useSessionAccess: unused, useWorkspaces: unused, useWorkspaceAccess: unused, useResource: unused }
}
it('shows loading before data, serializes polling and retains the graph on read failure', async () => {
  vi.useFakeTimers()
  let resolve: ((value: typeof state) => void) | undefined
  const read = vi.fn<Props['readTaskCoverage']>().mockImplementationOnce(() => new Promise((done) => { resolve = done })).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(state)
  const input = props(read)
  render(<TaskCoverageRecords {...input} />)
  await act(async () => {})
  expect(screen.queryByTestId('nodes')).toBeNull()
  expect(screen.getByRole('status')).toBeTruthy()
  await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
  expect(read).toHaveBeenCalledTimes(1)
  await act(async () => { resolve?.(state) })
  expect(screen.getByTestId('nodes').textContent).toContain('example.org')
  await act(async () => { await vi.advanceTimersByTimeAsync(1500) })
  expect(screen.getByRole('alert').textContent).toBe('Read error')
  expect(screen.getByTestId('nodes').textContent).toContain('example.org')
  fireEvent.click(screen.getByRole('button', { name: 'Toggle polling' }))
  await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
  expect(read).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole('button', { name: 'Refresh graph' }))
  await act(async () => {})
  expect(read).toHaveBeenCalledTimes(3)
  expect(screen.queryByRole('alert')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Foreign worker' }))
  expect(input.openWorker).not.toHaveBeenCalled()
})
it('ignores a late previous task result after switching targets', async () => {
  let resolve: ((value: typeof state) => void) | undefined
  const read = vi.fn<Props['readTaskCoverage']>().mockImplementationOnce(() => new Promise((done) => { resolve = done })).mockResolvedValue({ ...state, records: { ...state.records, tasks: [{ ...task, id: 'other' }], assets: [{ ...state.records.assets[0]!, value: 'other.org' }] } })
  const input = props(read)
  const view = render(<TaskCoverageRecords {...input} />)
  await act(async () => {})
  view.rerender(<TaskCoverageRecords {...input} taskId="other" />)
  await act(async () => {})
  expect(screen.getByTestId('nodes').textContent).toContain('other.org')
  await act(async () => { resolve?.(state) })
  expect(screen.getByTestId('nodes').textContent).not.toContain('example.org')
})
