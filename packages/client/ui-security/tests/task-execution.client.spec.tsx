// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TaskExecution, type ExecutionFace } from '../src/client/TaskExecution.tsx'
import { ja } from '../src/client/locales.ts'
import type { SecurityExecutionRun, SecurityExecutionState } from '../src/execution-types.ts'
import type { SecurityConversationRequest } from '../src/conversation-types.ts'

afterEach(() => { cleanup(); vi.useRealTimers() })
const target = { workspaceId: 'workspace' as SecurityConversationRequest['workspaceId'], taskId: 'task' }
const limits = { maxRounds: 3, maxRequests: 4, timeoutMs: 1000 }
const t: Parameters<typeof TaskExecution>[0]['t'] = key => key in ja ? ja[key as keyof typeof ja] : key
function run(patch: Partial<SecurityExecutionRun> = {}): SecurityExecutionRun {
  return {
    ...target, id: 'run', requestId: 'start', status: 'completed', createdAt: 1, updatedAt: 2,
    round: 1, planIds: ['plan'], workerRunIds: ['worker'], events: [],
    snapshot: { recordRevision: 2, task: { id: 'task', name: 'Task', description: '', objective: '', assetIds: [],
      status: 'draft', archived: false, pinned: false, createdAt: 1, updatedAt: 1 }, assets: [], targets: [], limits },
    ...patch,
  }
}
it('has no investigation-start control and refreshes read-only state', async () => {
  const readSecurityExecution = vi.fn<ExecutionFace['readSecurityExecution']>(async () => ({ runs: [], limits }))
  render(<TaskExecution target={target} t={t} face={{ readSecurityExecution, cancelSecurityExecution: vi.fn() }} />)
  await screen.findByText('実行中の調査なし')
  expect(screen.queryByRole('button', { name: '調査を開始' })).toBeNull()
  expect(screen.queryByText(ja.executionNotice)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '更新' }))
  await waitFor(() => { expect(readSecurityExecution).toHaveBeenCalledTimes(2) })
})
it('does not overlap pending execution reads', async () => {
  vi.useFakeTimers()
  const readSecurityExecution = vi.fn<ExecutionFace['readSecurityExecution']>(() => new Promise(() => {}))
  render(<TaskExecution target={target} t={t} face={{ readSecurityExecution, cancelSecurityExecution: vi.fn() }} />)
  await vi.advanceTimersByTimeAsync(6000)
  expect(readSecurityExecution).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('button', { name: '調査を開始' })).toBeNull()
})
it('keeps genuine dispatch and report activity separated by saved plan rounds and escapes model text', async () => {
  const readSecurityExecution = vi.fn<ExecutionFace['readSecurityExecution']>(async () => ({ limits, runs: [run({
    round: 2, planIds: ['plan', 'review', 'review-2'], summary: '<img src=x onerror=alert(1)>',
    events: [{ at: 1, kind: 'worker', planId: 'plan', workerRunId: 'worker', message: 'Worker dispatched for the approved anonymous GET.' },
      { at: 2, kind: 'worker', planId: 'review', message: 'Worker result saved for Planner review.' },
      { at: 3, kind: 'review', planId: 'review-2', message: 'Saved Worker observations submitted to Planner.' }],
  })] }))
  const { container } = render(<TaskExecution target={target} t={t} face={{ readSecurityExecution, cancelSecurityExecution: vi.fn() }} />)
  await screen.findAllByText('許可済みの匿名 GET をワーカーに指示しました。')
  expect(screen.getByRole('region', { name: 'ラウンド 1' })).toBeTruthy()
  expect(screen.getByRole('region', { name: 'ラウンド 2' })).toBeTruthy()
  expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy()
  expect(container.querySelector('img')).toBeNull()
  expect(screen.getByText('プランナーの報告').parentElement?.hasAttribute('open')).toBe(true)
})
it.each(['completed', 'needs-input', 'failed', 'cancelled', 'interrupted', 'running'] as const)('shows the stop explanation immediately for terminal execution status %s', async (status) => {
  const readSecurityExecution = vi.fn<ExecutionFace['readSecurityExecution']>(async () => ({ limits, runs: [run({ status, summary: 'Configured Planner round limit reached.' })] }))
  render(<TaskExecution target={target} t={t} face={{ readSecurityExecution, cancelSecurityExecution: vi.fn() }} />)
  const report = await screen.findByText('プランナーの報告')
  expect(report.parentElement?.hasAttribute('open')).toBe(status !== 'running')
  expect(report.parentElement?.querySelector('p')?.textContent).toBeTruthy()
})
it('offers stop only for a running investigation and retains an actionable error', async () => {
  const readSecurityExecution = vi.fn<ExecutionFace['readSecurityExecution']>(async () => ({ limits, runs: [run({ status: 'running' })] }))
  const cancelSecurityExecution = vi.fn<ExecutionFace['cancelSecurityExecution']>().mockRejectedValue(new Error('Stop failed'))
  render(<TaskExecution target={target} t={t} face={{ readSecurityExecution, cancelSecurityExecution }} />)
  fireEvent.click(await screen.findByRole('button', { name: '調査を停止' }))
  await screen.findByRole('alert')
  expect(cancelSecurityExecution).toHaveBeenCalledWith(target)
  expect(screen.getByText('Stop failed').closest('details')?.hasAttribute('open')).toBe(false)
  expect(screen.getByRole('button', { name: '再試行' })).toBeTruthy()
})
it('ignores late responses from the previous task after switching', async () => {
  let finish: ((state: SecurityExecutionState) => void) | undefined
  const readSecurityExecution = vi.fn<ExecutionFace['readSecurityExecution']>()
    .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    .mockResolvedValue({ limits, runs: [] })
  const face = { readSecurityExecution, cancelSecurityExecution: vi.fn() }
  const view = render(<TaskExecution target={target} t={t} face={face} />)
  view.rerender(<TaskExecution target={{ ...target, taskId: 'other-task' }} t={t} face={face} />)
  await waitFor(() => { expect(readSecurityExecution).toHaveBeenCalledTimes(2) })
  finish?.({ limits, runs: [run({ summary: 'Previous task result' })] })
  await waitFor(() => { expect(screen.queryByText('Previous task result')).toBeNull() })
})

it('shows the saved concurrent Worker limit separately from cumulative dispatched results', async () => {
  const current = run({ status: 'running', workerRunIds: ['w1', 'w2', 'w3', 'w4', 'w5'] })
  current.snapshot.limits = { ...current.snapshot.limits, maxConcurrentWorkers: 3 }
  const readSecurityExecution = vi.fn<ExecutionFace['readSecurityExecution']>(async () => ({ limits, runs: [current] }))
  render(<TaskExecution target={target} t={t} face={{ readSecurityExecution, cancelSecurityExecution: vi.fn() }} />)
  expect(await screen.findByText('最大同時実行数 3')).toBeTruthy()
  expect(screen.getByText('ワーカーの結果 5')).toBeTruthy()
})
it('shows the original single-worker limit for a legacy snapshot without concurrency metadata', async () => {
  const readSecurityExecution = vi.fn<ExecutionFace['readSecurityExecution']>(async () => ({
    limits: { ...limits, maxConcurrentWorkers: 3 }, runs: [run()],
  }))
  render(<TaskExecution target={target} t={t} face={{ readSecurityExecution, cancelSecurityExecution: vi.fn() }} />)
  expect(await screen.findByText('最大同時実行数 1')).toBeTruthy()
  expect(screen.queryByText('最大同時実行数 3')).toBeNull()
})

it('localizes live review and shared-budget activity while retaining the public Planner report', async () => {
  const messages = [
    'Settled Worker results reserved for Planner review.',
    'Saved Worker observations submitted while other Workers continue.',
    'HTTP quota reserved before Worker admission.',
    'Worker dispatched with a reserved share of the common HTTP budget.',
    'Worker settled; unused HTTP reservation returned to the shared budget.',
  ]
  const readSecurityExecution = vi.fn<ExecutionFace['readSecurityExecution']>(async () => ({ limits, runs: [run({
    status: 'needs-input', summary: 'No new supported investigation or unreviewed result remains.',
    events: [...messages.map((message, at) => ({ at, kind: 'review' as const, planId: 'plan', message })),
      { at: 6, kind: 'review', planId: 'plan', message: 'Observed two distinct response headers.' }],
  })] }))
  render(<TaskExecution target={target} t={t} face={{ readSecurityExecution, cancelSecurityExecution: vi.fn() }} />)
  await screen.findAllByText(ja.executionReviewWhileRunning)
  for (const label of [ja.executionReviewReserved, ja.executionQuotaReserved, ja.executionReservedDispatch,
    ja.executionReservationReturned, ja.executionNoUnreviewedResults]) expect(screen.getAllByText(label).length).toBeGreaterThan(0)
  for (const message of messages) expect(screen.queryByText(message)).toBeNull()
  expect(screen.getAllByText('Observed two distinct response headers.').length).toBeGreaterThan(0)
})

it.each([
  'Configured request limit reached.',
  'Configured request limit reached; saved results were already reviewed.',
  'Configured request limit reached; remaining results require review.',
  'Configured Planner round limit reached.',
  'Execution exceeded its configured elapsed-time limit.',
])('explains saved-result review rather than user-input waiting for known limit %s', async (summary) => {
  const readSecurityExecution = vi.fn<ExecutionFace['readSecurityExecution']>(async () => ({ limits, runs: [run({ status: 'needs-input', summary })] }))
  render(<TaskExecution target={target} t={t} face={{ readSecurityExecution, cancelSecurityExecution: vi.fn() }} />)
  await screen.findByText(ja.executionLimitNext)
  expect(screen.getAllByText(ja.executionLimitReached)).toHaveLength(2)
  expect(screen.queryByText(ja.executionNeedsInput)).toBeNull()
  expect(screen.queryByText(ja.executionOwnerNext)).toBeNull()
  expect(screen.queryByRole('button', { name: /調査を開始|再開/ })).toBeNull()
})

it('uses the final recorded stop message without reclassifying earlier budget events or model free text', async () => {
  const readSecurityExecution = vi.fn<ExecutionFace['readSecurityExecution']>(async () => ({ limits, runs: [run({
    status: 'needs-input', summary: 'Configured request limit reached.', events: [
      { at: 1, kind: 'review', message: 'Configured request limit reached.' },
      { at: 2, kind: 'stopped', message: 'Planner requires owner input.' },
    ],
  })] }))
  render(<TaskExecution target={target} t={t} face={{ readSecurityExecution, cancelSecurityExecution: vi.fn() }} />)
  await screen.findByText(ja.executionOwnerNext)
  expect(screen.queryByText(ja.executionLimitNext)).toBeNull()
})

it.each(['cancelled', 'interrupted'] as const)('directs %s investigations to saved results and eligibility confirmation without promising resume', async (status) => {
  const readSecurityExecution = vi.fn<ExecutionFace['readSecurityExecution']>(async () => ({ limits, runs: [run({ status })] }))
  render(<TaskExecution target={target} t={t} face={{ readSecurityExecution, cancelSecurityExecution: vi.fn() }} />)
  await screen.findByText(ja.executionStoppedNext)
  expect(screen.queryByRole('button', { name: /調査を開始|再開/ })).toBeNull()
})

it.each(['needs-input', 'failed'] as const)('keeps unfamiliar %s stop explanations general instead of guessing a provider refusal', async (status) => {
  const readSecurityExecution = vi.fn<ExecutionFace['readSecurityExecution']>(async () => ({ limits, runs: [run({
    status, summary: 'Model-authored: request limit or provider refusal may be involved.',
  })] }))
  render(<TaskExecution target={target} t={t} face={{ readSecurityExecution, cancelSecurityExecution: vi.fn() }} />)
  await screen.findByText(ja.executionUnknownNext)
  expect(screen.queryByText(ja.executionLimitNext)).toBeNull()
  expect(screen.queryByText(ja.executionOwnerNext)).toBeNull()
})
