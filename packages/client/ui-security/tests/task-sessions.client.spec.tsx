// @vitest-environment jsdom
import type { ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type {} from '../src/client/index.ts'
import { TaskWorkers } from '../src/client/TaskWorkers.tsx'
import { SecurityTaskSessions, SecurityInvestigationStart, SecurityConversationComposer } from '../src/client/SecurityConversation.tsx'
import { ja } from '../src/client/locales.ts'
import type { SecurityWorkerRun, SecurityWorkerState } from '../src/worker-types.ts'

afterEach(() => { cleanup(); vi.useRealTimers() })
type Props = Parameters<typeof SecurityTaskSessions>[0]
const unused = (): never => { throw new Error('Unused framework hook') }
const framework = { usePanelInfo: unused, useRemoteAccess: unused, useSessions: unused, useSessionStatus: unused,
  useSessionRetainInfo: unused, useSessionAccess: unused, useWorkspaces: unused, useWorkspaceAccess: unused, useResource: unused }
const run = (id: string, createdAt: number, status: SecurityWorkerRun['status']): SecurityWorkerRun => ({
  workspaceId: 'workspace' as SecurityWorkerRun['workspaceId'], taskId: 'task', id, requestId: id, planId: 'plan', itemId: id, assetId: 'asset',
  sessionId: 'session' as SecurityWorkerRun['sessionId'], createdAt, updatedAt: createdAt, status,
  snapshot: { recordRevision: 1, task: { id: 'task', name: 'Task', description: '', objective: '', assetIds: ['asset'], status: 'draft', archived: false, pinned: false, createdAt: 1, updatedAt: 1 }, asset: { id: 'asset', companyId: 'company', kind: 'domain', value: 'example.org' },
    item: { id, title: `Investigation ${id}`, purpose: 'Purpose', approach: 'Read response', targetAssetIds: ['asset'], status: 'pending' }, model: { engine: 'claude', model: 'test' }, url: 'https://example.org/', limits: { requestTimeoutMs: 100, responseBytes: 1024, modelTimeoutMs: 100 } },
})
function props(readSecurityWorkers: Props['readSecurityWorkers']): Props {
  return { ...framework, workspaceId: 'workspace' as Props['workspaceId'], taskId: 'task', openOverview: vi.fn(),
    t: key => key in ja ? ja[key as keyof typeof ja] : key,
    ...{ SessionProvider: unused }, renderSlot: (name, owner) => <div data-testid={name}>{JSON.stringify(owner)}</div>,
    openSecurityConversation: () => new Promise(() => {}), sendSecurityConversation: vi.fn(), cancelSecurityConversation: vi.fn(),
    useSecurityRecords: selector => selector({}),
    readSecurityExecution: vi.fn(async () => ({ runs: [], limits: { maxRounds: 3, maxRequests: 10, timeoutMs: 1000 } })),
    startSecurityExecution: vi.fn(),
    readSecurityWorkers, startSecurityWorker: vi.fn(), sendSecurityWorker: vi.fn(), cancelSecurityWorker: vi.fn(),
    approveSecurityWorkerTool: vi.fn(), setSecurityBrowserCredentials: vi.fn(async () => ({ configured: true })),
    useSecurityPlanning: selector => selector({}), watchSecurityPlanning: vi.fn(), refreshSecurityPlanning: vi.fn(),
    startSecurityPlanning: vi.fn(), cancelSecurityPlanning: vi.fn(),
    useSecuritySetup: selector => selector({}), watchSecuritySetup: vi.fn(), refreshSecuritySetup: vi.fn(),
    beginSecuritySetup: vi.fn(), retrySecuritySetupSave: vi.fn(),
  }
}
it('appends real Worker rows in creation order, retains selection, and clears it on task changes', async () => {
  vi.useFakeTimers()
  let state: SecurityWorkerState = { runs: [run('first', 1, 'running')], limits: { requestTimeoutMs: 100, responseBytes: 1024, modelTimeoutMs: 100 } }
  const read = vi.fn<Props['readSecurityWorkers']>(async target => target.taskId === 'task' ? state : { ...state, runs: [] })
  const input = props(read)
  const view = render(<SecurityTaskSessions {...input} />)
  await act(async () => {})
  fireEvent.click(screen.getByRole('button', { name: /#1.*Investigation first/ }))
  expect(screen.getByTestId('security.sessions.workers').textContent).toContain('"runId":"first"')
  state = { ...state, runs: [run('second', 2, 'running'), run('first', 1, 'completed')] }
  await act(async () => { await vi.advanceTimersByTimeAsync(1500) })
  expect(screen.getByRole('button', { name: /#1.*Investigation first/ }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByRole('button', { name: /#2.*Investigation second/ })).toBeTruthy()
  view.rerender(<SecurityTaskSessions {...input} taskId="other" />)
  await act(async () => {})
  expect(screen.queryByRole('button', { name: /Investigation first/ })).toBeNull()
  expect(screen.getByText('ワーカーはまだ起動していません。')).toBeTruthy()
  expect(screen.queryByTestId('security.sessions.workers')).toBeNull()
  expect(screen.getByRole('button', { name: 'システムイベントはありません' }).hasAttribute('disabled')).toBe(true)
})
it('does not overlap pending Worker reads', async () => {
  vi.useFakeTimers()
  const read = vi.fn<Props['readSecurityWorkers']>(() => new Promise(() => {}))
  render(<SecurityTaskSessions {...props(read)} />)
  await act(async () => { await vi.advanceTimersByTimeAsync(6000) })
  expect(read).toHaveBeenCalledTimes(1)
})

it('shows only the selected Worker instructions and stops that exact run', async () => {
  const selected = run('selected', 2, 'running')
  const cancel = vi.fn<Parameters<typeof TaskWorkers>[0]['cancelSecurityWorker']>(async () => {})
  const refresh = vi.fn(async () => {})
  render(<TaskWorkers {...framework} workspaceId={selected.workspaceId} taskId="task" runId="selected"
    state={{ runs: [run('other', 1, 'completed'), selected], limits: selected.snapshot.limits }} readError={false}
    refresh={refresh} readSecurityWorkers={vi.fn()} startSecurityWorker={vi.fn()} sendSecurityWorker={vi.fn()}
    cancelSecurityWorker={cancel} approveSecurityWorkerTool={vi.fn()} setSecurityBrowserCredentials={vi.fn()}
    t={key => key in ja ? ja[key as keyof typeof ja] : key} />)
  expect(screen.getByText('Investigation selected')).toBeTruthy()
  expect(screen.queryByText('Investigation other')).toBeNull()
  expect(screen.getByRole('log')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'ワーカーを停止' }))
  await act(async () => {})
  expect(cancel).toHaveBeenCalledWith({ workspaceId: selected.workspaceId, taskId: 'task', runId: 'selected' })
  expect(refresh).toHaveBeenCalledTimes(1)
})

it('sends investigation through the visible conversation and retains the request id on failed retry', async () => {
  const start = vi.fn<Parameters<typeof SecurityInvestigationStart>[0]['startInvestigation']>()
    .mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('sent')
  render(<SecurityInvestigationStart {...conversationProps(start)} />)
  fireEvent.click(screen.getByRole('button', { name: '調査開始' }))
  await act(async () => {})
  expect(screen.getByRole('alert').textContent).toContain('調査開始の依頼を確認できませんでした')
  fireEvent.click(screen.getByRole('button', { name: '調査開始' }))
  await act(async () => {})
  expect(start).toHaveBeenCalledTimes(2)
  expect(start.mock.calls[0]?.[0]).toBe(start.mock.calls[1]?.[0])
  expect(screen.queryByRole('alert')).toBeNull()
})
it.each(['checklist', 'running', 'unavailable', 'removed'] as const)('disables investigation when %s', async (reason) => {
  const start = vi.fn<Parameters<typeof SecurityInvestigationStart>[0]['startInvestigation']>()
  const input = conversationProps(start)
  input.investigationDisabled = reason === 'checklist'
  input.useSession = selector => selector({ ...sessionState, running: reason === 'running', removed: reason === 'removed', openState: reason === 'unavailable' ? 'error' : 'open' })
  render(<SecurityInvestigationStart {...input} />)
  expect(screen.getByRole('button', { name: '調査開始' }).hasAttribute('disabled')).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '調査開始' }))
  await act(async () => {})
  expect(start).not.toHaveBeenCalled()
})
it('prevents duplicate pending investigation requests and reports a failed task save', async () => {
  let resolve: (value: 'save-failed') => void = () => {}
  const start = vi.fn<Parameters<typeof SecurityInvestigationStart>[0]['startInvestigation']>(() => new Promise((done) => { resolve = done }))
  render(<SecurityInvestigationStart {...conversationProps(start)} />)
  fireEvent.click(screen.getByRole('button', { name: '調査開始' }))
  fireEvent.click(screen.getByRole('button', { name: '送信中…' }))
  expect(start).toHaveBeenCalledTimes(1)
  await act(async () => { resolve('save-failed') })
  expect(screen.getByRole('alert').textContent).toContain('タスクを正常に保存')
})

type ConversationProps = Parameters<typeof SecurityInvestigationStart>[0]
type SessionState = Parameters<Parameters<ConversationProps['useSession']>[0]>[0]
const sessionState: SessionState = {
  sessionId: 'session' as SessionState['sessionId'], pendingSubmissions: [], running: false, subagent: null, removed: false,
  openState: 'open', openError: null, hasMore: false, loadingOlder: false, promptError: null, blank: false,
  lastAgentError: null, promptAttempted: false, awaitingFirstTurn: false,
}
function conversationProps(startInvestigation: ConversationProps['startInvestigation']): ConversationProps {
  return { ...framework, sessionId: sessionState.sessionId, useSession: selector => selector(sessionState),
    useProjection: unused, useAccess: unused, useConversation: unused, useChat: unused, useTrajectory: unused, useInput: unused,
    inputActions: { captureInsertion: unused, insertText: unused, setDraft: unused, persistDraft: unused,
      addAttachments: unused, removeAttachment: unused, pruneAttachments: unused, submit: unused },
    t: key => key in ja ? ja[key as keyof typeof ja] : key, investigationDisabled: false, startInvestigation }
}

it('keeps the main agent draft when investigation is requested', async () => {
  const start = vi.fn<ConversationProps['startInvestigation']>(async () => 'sent')
  const input = conversationProps(start)
  render(<><SecurityInvestigationStart {...input} /><SecurityConversationComposer {...input}
    sessionId={sessionState.sessionId} session={sessionState} pendingInteraction={undefined}
    useSession={input.useSession} t={input.t} matched={{ workspaceId: 'workspace' as Props['workspaceId'], taskId: 'task' }}
    sendSecurityConversation={vi.fn()} cancelSecurityConversation={vi.fn()} /></>)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Keep this draft' } })
  fireEvent.click(screen.getByRole('button', { name: '調査開始' }))
  await act(async () => {})
  expect(start).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('textbox').getAttribute('disabled')).toBeNull()
  expect(screen.getByDisplayValue('Keep this draft')).toBe(screen.getByRole('textbox'))
})

it('places the investigation action in the fixed main conversation header beside the model picker', async () => {
  const input = props(async () => ({ runs: [], limits: { requestTimeoutMs: 100, responseBytes: 1024, modelTimeoutMs: 100 } }))
  const reference: Awaited<ReturnType<Props['openSecurityConversation']>> = {
    sessionId: sessionState.sessionId, get binding() { return unused() },
    ready: new Promise(() => {}),
    release: vi.fn(), [Symbol.dispose]: vi.fn(),
  }
  input.openSecurityConversation = async () => reference
  render(<SecurityTaskSessions {...input} {...{ SessionProvider: ({ children }: { children: ReactNode }) => children }} />)
  await act(async () => {})
  const start = screen.getByTestId('security.task.investigation')
  const header = start.closest('header')
  expect(header).not.toBeNull()
  expect(header?.contains(screen.getByTestId('security.task.engine'))).toBe(true)
  expect(header?.contains(screen.getByTestId('security.task.conversation'))).toBe(false)
  expect(start.textContent).toContain('"investigationDisabled":true')
})

function workerProps(selected: SecurityWorkerRun): Parameters<typeof TaskWorkers>[0] {
  return { ...framework, workspaceId: selected.workspaceId, taskId: selected.taskId, runId: selected.id,
    state: { runs: [selected], limits: selected.snapshot.limits }, readError: false, refresh: vi.fn(async () => {}),
    readSecurityWorkers: vi.fn(), startSecurityWorker: vi.fn(), cancelSecurityWorker: vi.fn(), approveSecurityWorkerTool: vi.fn(),
    setSecurityBrowserCredentials: vi.fn(async () => ({ configured: true })),
    sendSecurityWorker: vi.fn(async () => ({ runs: [selected], limits: selected.snapshot.limits })),
    t: key => key in ja ? ja[key as keyof typeof ja] : key }
}
it('shows Planner instructions, collapsed public logs and safe Worker Markdown in order', () => {
  const selected = { ...run('chat', 1, 'completed'), transcript: [
    { id: '1', kind: 'instruction' as const, text: 'Inspect the public response', createdAt: 1 },
    { id: '2', kind: 'log' as const, text: 'GET https://example.org/ HTTP 200\nCaptured observation', createdAt: 2 },
    { id: '3', kind: 'report' as const, text: '**Report**\n\n<script>unsafe</script>', createdAt: 3 },
    { id: '4', kind: 'error' as const, text: 'Connection failed', createdAt: 4 },
  ] }
  const { container } = render(<TaskWorkers {...workerProps(selected)} />)
  const log = screen.getByRole('log')
  expect(log.textContent?.indexOf('Inspect')).toBeLessThan(log.textContent?.indexOf('GET'))
  expect(screen.getByText('GET https://example.org/ HTTP 200').closest('details')?.open).toBe(false)
  expect(screen.getByText('GET https://example.org/ HTTP 200').closest('summary')).not.toBeNull()
  expect(screen.getByText('エラー詳細').closest('summary')).not.toBeNull()
  expect(screen.getByText('Report').tagName).toBe('STRONG')
  expect(container.querySelector('script')).toBeNull()
})
it('retains draft and request identity after uncertain failure and sends once on Command Enter', async () => {
  const input = workerProps(run('chat', 1, 'completed'))
  const send = vi.fn<typeof input.sendSecurityWorker>().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(input.state!)
  render(<TaskWorkers {...input} sendSecurityWorker={send} />)
  const textbox = screen.getByRole('textbox')
  fireEvent.change(textbox, { target: { value: 'Explain the observed headers' } })
  fireEvent.keyDown(textbox, { key: 'Enter' })
  expect(send).not.toHaveBeenCalled()
  fireEvent.keyDown(textbox, { key: 'Enter', metaKey: true })
  fireEvent.keyDown(textbox, { key: 'Enter', metaKey: true })
  await act(async () => {})
  expect(send).toHaveBeenCalledTimes(1)
  expect((textbox as HTMLTextAreaElement).value).toBe('Explain the observed headers')
  fireEvent.keyDown(textbox, { key: 'Enter', ctrlKey: true })
  await act(async () => {})
  expect(send).toHaveBeenCalledTimes(2)
  expect(send.mock.calls[0]?.[0].requestId).toBe(send.mock.calls[1]?.[0].requestId)
  expect(send.mock.calls[1]?.[0].runId).toBe('chat')
  expect((textbox as HTMLTextAreaElement).value).toBe('')
})
it('queues an owner instruction during initial work but blocks another while a reply is running or state is unreadable', async () => {
  const input = workerProps(run('chat', 1, 'running'))
  const view = render(<TaskWorkers {...input} />)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Explain results when ready' } })
  expect(screen.getByRole('button', { name: '送信' }).hasAttribute('disabled')).toBe(false)
  view.rerender(<TaskWorkers {...input} readError />)
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', metaKey: true })
  expect(input.sendSecurityWorker).not.toHaveBeenCalled()
  view.rerender(<TaskWorkers {...input} state={{ ...input.state!, runs: [{ ...input.state!.runs[0]!, conversationStatus: 'running' }] }} />)
  expect(screen.getByRole('button', { name: '送信' }).hasAttribute('disabled')).toBe(true)
})

it('shows activity during investigation and additional replies, then stops on completion', () => {
  const input = workerProps(run('chat', 1, 'running'))
  const view = render(<TaskWorkers {...input} />)
  expect(view.container.querySelector('[aria-busy="true"]')).not.toBeNull()
  const completed = { ...input.state!, runs: [{ ...input.state!.runs[0]!, status: 'completed' as const }] }
  view.rerender(<TaskWorkers {...input} state={completed} />)
  expect(view.container.querySelector('[aria-busy="true"]')).toBeNull()
  expect(screen.queryByRole('status')).toBeNull()
  view.rerender(<TaskWorkers {...input} state={{ ...completed, runs: [{ ...completed.runs[0]!, conversationStatus: 'running' }] }} />)
  expect(view.container.querySelector('[aria-busy="true"]')).not.toBeNull()
  expect(screen.getByRole('status').textContent).toBe('実行中')
})

it('opens only the requested task Worker without opening the Main Agent', async () => {
  const selected = run('selected', 1, 'completed')
  const input = props(async () => ({ runs: [selected, { ...run('foreign', 2, 'completed'), taskId: 'other' }], limits: selected.snapshot.limits }))
  const open = vi.fn(input.openSecurityConversation)
  render(<SecurityTaskSessions {...input} initialWorkerId="selected" openSecurityConversation={open} />)
  await act(async () => {})
  expect(open).not.toHaveBeenCalled()
  expect(screen.getByTestId('security.sessions.workers').textContent).toContain('"runId":"selected"')
  expect(screen.queryByRole('button', { name: /Investigation foreign/ })).toBeNull()
})

it('resumes directly with one stable request id after an unconfirmed response', async () => {
  const resume = vi.fn<NonNullable<ConversationProps['resumeInvestigation']>>()
    .mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined)
  const start = vi.fn<ConversationProps['startInvestigation']>()
  render(<SecurityInvestigationStart {...conversationProps(start)} resumeAvailable resumeDisabled={false} resumeInvestigation={resume} />)
  fireEvent.click(screen.getByRole('button', { name: '調査を再開' }))
  await act(async () => {})
  expect(screen.getByRole('alert').textContent).toContain('保存済みの調査履歴は保持')
  fireEvent.click(screen.getByRole('button', { name: '再開を再試行' }))
  await act(async () => {})
  expect(resume).toHaveBeenCalledTimes(2)
  expect(resume.mock.calls[0]?.[0]).toBe(resume.mock.calls[1]?.[0])
  expect(start).not.toHaveBeenCalled()
})

it.each(['busy', 'disabled', 'closed'] as const)('blocks resume while %s', async (reason) => {
  const input = conversationProps(vi.fn())
  if (reason === 'busy') input.useSession = selector => selector({ ...sessionState, running: true })
  if (reason === 'closed') input.useSession = selector => selector({ ...sessionState, openState: 'error' })
  const resume = vi.fn()
  render(<SecurityInvestigationStart {...input} resumeAvailable resumeDisabled={reason === 'disabled'} resumeInvestigation={resume} />)
  const button = screen.getByRole('button', { name: '調査を再開' })
  expect(button.hasAttribute('disabled')).toBe(true)
  fireEvent.click(button)
  await act(async () => {})
  expect(resume).not.toHaveBeenCalled()
})

it('serializes execution reads and discards the old task response', async () => {
  vi.useFakeTimers()
  const input = props(async () => ({ runs: [], limits: { requestTimeoutMs: 100, responseBytes: 1024, modelTimeoutMs: 100 } }))
  const read = vi.fn<Props['readSecurityExecution']>(() => new Promise(() => {}))
  input.readSecurityExecution = read
  const view = render(<SecurityTaskSessions {...input} />)
  await act(async () => { await vi.advanceTimersByTimeAsync(6000) })
  expect(read).toHaveBeenCalledTimes(1)
  view.rerender(<SecurityTaskSessions {...input} taskId="new-task" />)
  await act(async () => {})
  expect(read).toHaveBeenCalledTimes(2)
  expect(read.mock.calls[1]?.[0].taskId).toBe('new-task')
})

it('enables resume only for the same saved revision and directly submits the stored run', async () => {
  const input = props(async () => ({ runs: [], limits: { requestTimeoutMs: 100, responseBytes: 1024, modelTimeoutMs: 100 } }))
  const task = run('fixture', 1, 'completed').snapshot.task
  const limits = { maxRounds: 3, maxRequests: 10, timeoutMs: 1000 }
  const prior = { workspaceId: input.workspaceId, taskId: input.taskId, id: 'prior', requestId: 'old', status: 'failed' as const, createdAt: 1, updatedAt: 1, round: 1, planIds: [], workerRunIds: [], events: [], snapshot: { recordRevision: 2, task, assets: [], targets: [], limits, modelDecision: { engine: 'claude' as const, model: 'test', reason: 'Selected' } } }
  input.readSecurityExecution = vi.fn(async () => ({ runs: [prior], limits }))
  input.useSecurityRecords = selector => selector({ workspace: { loading: false, saving: false, records: {
    workspaceId: input.workspaceId, revision: 2, companies: [], assets: [], tasks: [task],
  } } })
  input.useSecuritySetup = selector => selector({
    [JSON.stringify([input.workspaceId, input.taskId])]: { busy: false, state: { recordRevision: 2, active: false,
      checklist: { goal: true, scope: true, permission: true, operations: true, limits: true } } } })
  input.openSecurityConversation = async () => ({
    sessionId: sessionState.sessionId, get binding() { return unused() },
    ready: new Promise(() => {}), release: vi.fn(), [Symbol.dispose]: vi.fn() })
  input.SessionProvider = ({ children }: { children: ReactNode }) => children
  let owner: { resumeAvailable?: boolean; resumeDisabled?: boolean; resumeInvestigation?: (id: string) => Promise<void> } | undefined
  input.renderSlot = (name, value) => { if (name === 'security.task.investigation' && value && 'resumeAvailable' in value) owner = value; return null }
  const view = render(<SecurityTaskSessions {...input} />)
  await act(async () => {})
  expect(owner).toMatchObject({ resumeAvailable: true, resumeDisabled: false })
  if (!owner || !('resumeInvestigation' in owner)) throw new Error('Missing resume action')
  const resumeInvestigation = owner.resumeInvestigation
  await act(async () => { await resumeInvestigation?.('stable-id') })
  expect(input.startSecurityExecution).toHaveBeenCalledWith({ workspaceId: input.workspaceId, taskId: input.taskId, requestId: 'stable-id', expectedRevision: 2, resumeRunId: 'prior', modelDecision: prior.snapshot.modelDecision })
  input.useSecurityRecords = selector => selector({ workspace: { loading: false, saving: false, records: {
    workspaceId: input.workspaceId, revision: 3, companies: [], assets: [], tasks: [task],
  } } })
  view.rerender(<SecurityTaskSessions {...input} />)
  expect(owner).toMatchObject({ resumeDisabled: true })
  expect(screen.getByText('タスク設定が変わっています。概要を確認して、新しい調査を開始してください。')).toBeTruthy()
})

it('uses a new resume request id when polling discovers a different source execution', async () => {
  const resume = vi.fn<NonNullable<ConversationProps['resumeInvestigation']>>().mockRejectedValue(new Error('offline'))
  const input = conversationProps(vi.fn())
  const view = render(<SecurityInvestigationStart {...input} resumeRunId="first" resumeAvailable resumeInvestigation={resume} />)
  fireEvent.click(screen.getByRole('button', { name: '調査を再開' }))
  await act(async () => {})
  view.rerender(<SecurityInvestigationStart {...input} resumeRunId="second" resumeAvailable resumeInvestigation={resume} />)
  expect(screen.queryByRole('alert')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '調査を再開' }))
  await act(async () => {})
  expect(resume.mock.calls[0]?.[0]).not.toBe(resume.mock.calls[1]?.[0])
})

it('shows the precise operation and sends a single approval decision despite repeated clicks', async () => {
  const selected = { ...run('approval', 1, 'running'), pendingApproval: { id: 'approval-1', description: 'POST https://example.org/api/search' } }
  const input = workerProps(selected)
  let settle: (() => void) | undefined
  const approve = vi.fn<typeof input.approveSecurityWorkerTool>(() => new Promise((resolve) => {
    settle = () => { resolve(input.state!) }
  }))
  render(<TaskWorkers {...input} approveSecurityWorkerTool={approve} />)
  expect(screen.getByRole('region', { name: '操作の承認待ち' }).textContent).toContain('POST https://example.org/api/search')
  fireEvent.click(screen.getByRole('button', { name: '今回許可' }))
  fireEvent.click(screen.getByRole('button', { name: '拒否' }))
  expect(approve).toHaveBeenCalledTimes(1)
  expect(approve).toHaveBeenCalledWith({ workspaceId: selected.workspaceId, taskId: 'task', runId: 'approval', approvalId: 'approval-1', allow: true })
  await act(async () => { settle?.() })
  expect(input.refresh).toHaveBeenCalledOnce()
  expect(screen.getByRole('button', { name: '今回許可' }).hasAttribute('disabled')).toBe(true)
})
it('allows rejecting the pending operation and retains retry after a failed decision', async () => {
  const input = workerProps({ ...run('approval', 1, 'running'), pendingApproval: { id: 'approval-2', description: 'offline analysis' } })
  const approve = vi.fn<typeof input.approveSecurityWorkerTool>().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(input.state!)
  render(<TaskWorkers {...input} approveSecurityWorkerTool={approve} />)
  fireEvent.click(screen.getByRole('button', { name: '拒否' }))
  await act(async () => {})
  expect(screen.getByRole('alert')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '拒否' }))
  await act(async () => {})
  expect(approve).toHaveBeenCalledTimes(2)
  expect(approve.mock.calls[1]?.[0]).toMatchObject({ approvalId: 'approval-2', allow: false })
})

it('counts only task investigation Workers including approval waits and excludes follow-up replies', async () => {
  vi.useFakeTimers()
  const first = { ...run('first', 1, 'running'), pendingApproval: { id: 'approval', description: 'Offline analysis' } }
  const replying = { ...run('replying', 3, 'completed'), conversationStatus: 'running' as const }
  let state: SecurityWorkerState = { runs: [first, run('second', 2, 'running'), replying,
    { ...run('foreign', 4, 'running'), taskId: 'other-task' }], limits: first.snapshot.limits }
  render(<SecurityTaskSessions {...props(async () => state)} />)
  await act(async () => {})
  expect(screen.getByText('調査中 2')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /#1.*Investigation first/ }))
  state = { ...state, runs: state.runs.map(value => value.id === 'second' ? { ...value, status: 'completed' as const } : value) }
  await act(async () => { await vi.advanceTimersByTimeAsync(1500) })
  expect(screen.getByText('調査中 1')).toBeTruthy()
  expect(screen.getByRole('button', { name: /#1.*Investigation first/ }).getAttribute('aria-pressed')).toBe('true')
  expect(screen.queryByRole('button', { name: /Investigation foreign/ })).toBeNull()
})

it('keeps browser credentials out of Worker messages and clears the password after saving', async () => {
  const input = workerProps(run('browser', 1, 'completed'))
  input.state!.browser = { enabled: true, credentialsConfigured: false }
  render(<TaskWorkers {...input} />)
  fireEvent.click(screen.getByText(/ブラウザのログイン設定/u))
  fireEvent.change(screen.getByLabelText('許可されたオリジン'), { target: { value: 'https://example.org' } })
  fireEvent.change(screen.getByLabelText('ユーザー名'), { target: { value: 'synthetic-user' } })
  fireEvent.change(screen.getByLabelText('パスワード'), { target: { value: 'synthetic-password' } })
  const password = screen.getByLabelText('パスワード') as HTMLInputElement
  expect(password.type).toBe('password')
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'このタスクで使用' })) })
  expect(input.setSecurityBrowserCredentials).toHaveBeenCalledWith({ workspaceId: input.workspaceId, taskId: input.taskId, credentials: { origin: 'https://example.org', username: 'synthetic-user', password: 'synthetic-password' } })
  expect(password.value).toBe('')
  expect(input.sendSecurityWorker).not.toHaveBeenCalled()
  expect(screen.getByRole('log').textContent).not.toContain('synthetic-password')
})
it('offers browser login configuration before a Worker exists', () => {
  const input = workerProps(run('browser', 1, 'completed'))
  delete input.runId
  input.state!.runs = []
  input.state!.browser = { enabled: true, credentialsConfigured: true }
  render(<TaskWorkers {...input} />)
  expect(screen.getByText(/今回の起動中のみ設定済み/u)).toBeTruthy()
  expect(screen.getByRole<HTMLButtonElement>('button', { name: '保存した認証情報を消去' }).disabled).toBe(false)
})
