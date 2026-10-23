// @vitest-environment jsdom
/** History table actions: report opens the existing detail; deletion is confirmed, guarded and never rescans. */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionSeq } from '@deepseek-ai/dsh-session/types'
import type { SupplyChainRun } from '../src/supply-chain-types.ts'
import { SupplyChainList } from '../src/client/SupplyChainList.tsx'
import type {} from '../src/client/index.ts'
import { ja } from '../src/client/locales.ts'
import { supplyChainDefinition } from '../src/client/supply-chain-definition.ts'

afterEach(cleanup)
type Props = Parameters<typeof SupplyChainList>[0]
const t: Props['t'] = key => key in ja ? ja[key as keyof typeof ja] : key
function run(patch: Partial<SupplyChainRun> = {}): SupplyChainRun {
  return { workspaceId: 'w' as SupplyChainRun['workspaceId'], runId: 'scan-1', requestId: 'request-1', sessionId: 'session-1' as SupplyChainRun['sessionId'], status: 'completed', phase: 'done', createdAt: 1, updatedAt: 2, message: 'Saved facts.', checkedPackages: 15, findings: [], warnings: [], ...patch }
}
function repairing(status: NonNullable<SupplyChainRun['repair']>['status']): SupplyChainRun['repair'] {
  return { requestId: 'r', status, phase: 'done', startedAt: 1, updatedAt: 2, message: 'm', packages: [], changes: [], files: [], warnings: [], definitionOnly: true, runtimeTests: 'not-run' }
}
async function renderHistory(rows: SupplyChainRun[], remove: Props['removeSupplyChain'] = async () => {}) {
  const unused = (): never => { throw new Error('Unused framework hook') }
  const listSupplyChain = vi.fn<Props['listSupplyChain']>().mockResolvedValue(rows)
  const startSupplyChain = vi.fn<Props['startSupplyChain']>()
  const removeSupplyChain = vi.fn<Props['removeSupplyChain']>(remove)
  const release = vi.fn()
  const reference: Awaited<ReturnType<Props['retainSupplyChain']>> = {
    sessionId: run().sessionId, get binding(): Awaited<ReturnType<Props['retainSupplyChain']>>['binding'] { throw new Error('Binding is unused by this fixture') },
    ready: new Promise(() => {}), release, [Symbol.dispose]: release,
  }
  const retainSupplyChain = vi.fn<Props['retainSupplyChain']>().mockResolvedValue(reference)
  const props: Props = { workspaceId: 'w' as Props['workspaceId'], t, listSupplyChain, startSupplyChain, retainSupplyChain, removeSupplyChain,
    SessionProvider: ({ children }) => <>{children}</>, renderSlot: () => <div data-testid="retained-chat" />, usePanelInfo: unused,
    useRemoteAccess: unused, useSessions: unused, useSessionStatus: unused, useSessionRetainInfo: unused,
    useSessionAccess: unused, useWorkspaces: unused, useWorkspaceAccess: unused, useResource: unused }
  render(<SupplyChainList {...props} />)
  return { listSupplyChain, startSupplyChain, removeSupplyChain, retainSupplyChain }
}
const rowOf = (prefix: string): HTMLElement => {
  const row = screen.getByRole('button', { name: `${ja.supplyChainTitle} · ${prefix}` }).closest('tr')
  if (!row) throw new Error('Expected a history row')
  return row
}

it('colors each history status by its real state; repair status wins and incomplete never reads as success', async () => {
  const cases: [Partial<SupplyChainRun>, string, string][] = [
    [{ status: 'running' }, ja.supplyChainRunning, 'info'], [{ status: 'completed' }, ja.supplyChainCompleted, 'success'],
    [{ status: 'incomplete' }, ja.supplyChainIncomplete, 'warning'], [{ status: 'failed' }, ja.supplyChainFailed, 'danger'],
    [{ status: 'cancelled' }, ja.supplyChainCancelled, 'neutral'], [{ status: 'interrupted' }, ja.supplyChainInterrupted, 'warning'],
    [{ status: 'completed', repair: repairing('incomplete') }, ja.supplyChainRepairIncomplete, 'warning'],
    [{ status: 'completed', repair: repairing('failed') }, ja.supplyChainRepairFailedState, 'danger'],
    [{ status: 'failed', repair: repairing('completed') }, ja.supplyChainRepairCompleted, 'success'],
    [{ status: 'completed', repair: repairing('running') }, ja.supplyChainRepairRunning, 'info'],
  ]
  await renderHistory(cases.map(([patch], index) => run({ runId: `run${index}xxx-1`, ...patch })))
  await screen.findByRole('button', { name: `${ja.supplyChainTitle} · run0xxx-` })
  cases.forEach(([, label, tone], index) => {
    const row = rowOf(`run${index}xxx-`)
    expect(row.querySelector('[data-tone]')?.getAttribute('data-tone'), label).toBe(tone)
    expect(row.textContent).toContain(label)
  })
})
it('opens the existing detail from the report action without starting, deleting or rescanning', async () => {
  const f = await renderHistory([run({ runId: 'aaaaaaaa-1' }), run({ runId: 'bbbbbbbb-2', sessionId: 'session-2' as SupplyChainRun['sessionId'] })])
  await screen.findByRole('button', { name: `${ja.supplyChainTitle} · aaaaaaaa` })
  expect(screen.getAllByRole('columnheader').map(node => node.textContent).at(-1)).toBe(ja.supplyChainActions)
  expect(within(rowOf('bbbbbbbb')).getAllByRole('button').map(node => node.textContent)).toEqual([`${ja.supplyChainTitle} · bbbbbbbb`, ja.supplyChainReport, ja.supplyChainDelete])
  fireEvent.click(within(rowOf('bbbbbbbb')).getByRole('button', { name: ja.supplyChainReport }))
  await screen.findByTestId('retained-chat')
  expect(f.retainSupplyChain).toHaveBeenCalledWith('session-2', expect.any(AbortSignal))
  expect(f.startSupplyChain).not.toHaveBeenCalled(); expect(f.removeSupplyChain).not.toHaveBeenCalled()
})
it('does not offer deletion while a check or repair is running', async () => {
  const f = await renderHistory([run({ runId: 'running1-x', status: 'running' }), run({ runId: 'repair01-x', repair: repairing('running') }), run({ runId: 'done0001-x' })])
  await screen.findByRole('button', { name: `${ja.supplyChainTitle} · done0001` })
  for (const prefix of ['running1', 'repair01']) {
    const remove = within(rowOf(prefix)).getByRole('button', { name: ja.supplyChainDelete })
    expect(remove.hasAttribute('disabled')).toBe(true)
    fireEvent.click(remove)
  }
  expect(screen.queryByRole('dialog')).toBeNull(); expect(f.removeSupplyChain).not.toHaveBeenCalled()
  expect(within(rowOf('done0001')).getByRole('button', { name: ja.supplyChainDelete }).hasAttribute('disabled')).toBe(false)
})
it('asks before deleting, sends one exact request, ignores double clicks, and keeps the row hidden after a late poll', async () => {
  let settle: () => void = () => {}
  const f = await renderHistory([run({ runId: 'aaaaaaaa-1' }), run({ runId: 'bbbbbbbb-2' })], () => new Promise<void>((resolve) => { settle = resolve }))
  await screen.findByRole('button', { name: `${ja.supplyChainTitle} · aaaaaaaa` })
  fireEvent.click(within(rowOf('aaaaaaaa')).getByRole('button', { name: ja.supplyChainDelete }))
  const dialog = await screen.findByRole('dialog')
  expect(within(dialog).getByText(ja.supplyChainDeleteNote)).toBeDefined(); expect(f.removeSupplyChain).not.toHaveBeenCalled()
  fireEvent.click(within(dialog).getByRole('button', { name: ja.cancel }))
  expect(screen.queryByRole('dialog')).toBeNull(); expect(f.removeSupplyChain).not.toHaveBeenCalled()
  fireEvent.click(within(rowOf('aaaaaaaa')).getByRole('button', { name: ja.supplyChainDelete }))
  const confirm = within(await screen.findByRole('dialog')).getByRole('button', { name: ja.supplyChainDelete })
  fireEvent.click(confirm); fireEvent.click(confirm)
  expect(f.removeSupplyChain).toHaveBeenCalledTimes(1)
  expect(f.removeSupplyChain).toHaveBeenCalledWith({ workspaceId: 'w', runId: 'aaaaaaaa-1' })
  settle()
  await waitFor(() => { expect(screen.queryByRole('button', { name: `${ja.supplyChainTitle} · aaaaaaaa` })).toBeNull() })
  const polls = f.listSupplyChain.mock.calls.length
  fireEvent.click(screen.getByRole('button', { name: ja.supplyChainRefresh }))
  await waitFor(() => { expect(f.listSupplyChain.mock.calls.length).toBeGreaterThan(polls) })
  expect(screen.queryByRole('button', { name: `${ja.supplyChainTitle} · aaaaaaaa` })).toBeNull()
  expect(screen.getByRole('button', { name: `${ja.supplyChainTitle} · bbbbbbbb` })).toBeDefined()
})
it('reports an unconfirmed deletion and re-reads the history', async () => {
  const f = await renderHistory([run({ runId: 'aaaaaaaa-1' })], async () => { throw new Error('offline') })
  await screen.findByRole('button', { name: `${ja.supplyChainTitle} · aaaaaaaa` })
  fireEvent.click(within(rowOf('aaaaaaaa')).getByRole('button', { name: ja.supplyChainDelete }))
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: ja.supplyChainDelete }))
  expect((await screen.findByRole('alert')).textContent).toBe(ja.supplyChainDeleteFailed)
  expect(f.removeSupplyChain).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: `${ja.supplyChainTitle} · aaaaaaaa` })).toBeDefined()
})
it('hides a deleted run card in the shared conversation while other run cards stay visible', () => {
  const build = (value: SupplyChainRun) => supplyChainDefinition.buildViewNode?.({ key: `k-${value.runId}`, kind: 'security-supply-chain', id: value.runId, matches: [],
    start: { role: 'start', event: { type: 'user/message', surfaceOp: 'append', seq: 0 as SessionSeq, time: 1, data: createUserMessage({ source: { kind: 'user' }, content: [] }) }, location: { kind: 'unresolved' } },
    state: value, current: new Map() })
  const gone = run({ runId: 'gone', deletedAt: 5 })
  expect(build(gone)).toMatchObject({ visibility: 'hidden', data: gone })
  expect(build(run({ runId: 'kept' }))).toMatchObject({ visibility: 'visible' })
})
