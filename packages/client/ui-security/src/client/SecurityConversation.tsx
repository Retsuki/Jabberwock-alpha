/** Task-owned session binding and a security-service-only composer. */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ConversationViewsProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InjectFace, PropsLocale, PropsRenderFactories, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, IconPaperPlaneOutlineRegular, IconUserOutlineRegular, IconPlanOutlineRegular, IconFlatListOutlineRegular, IconShieldOutlineRegular, IconUsersOutlineRegular, IconLoadingOutlineRegular, IconCheckCircleOutlineRegular, IconCloseCircleFillRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { SecurityRecords } from '../security-records.ts'
import type { SetupFace } from './setup-state.ts'
import type { PlanningFace } from './planning-state.ts'
import type { RecordsFace } from './records-state.ts'
import type { ExecutionFace } from './TaskExecution.tsx'
import type { SecurityExecutionState } from '../execution-types.ts'
import type { WorkerFace } from './TaskWorkers.tsx'
import type { SecurityWorkerState } from '../worker-types.ts'
import css from './TaskSessions.module.css'

/** Durable task address carried by the security composer election. */
export interface SecurityConversationTarget {
  workspaceId: SecurityRecords['workspaceId']
  taskId: string
}
/** Actions exposed without transport or mutable session ownership. */
export interface SecurityConversationFace {
  openSecurityConversation(this: void, target: SecurityConversationTarget, signal: AbortSignal): Promise<SessionReference>
  sendSecurityConversation(this: void, target: SecurityConversationTarget, text: string, requestId: string): Promise<'sent' | 'save-failed'>
  cancelSecurityConversation(this: void, target: SecurityConversationTarget): Promise<void>
}

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap {
    /** Task detail owns this reference until its Sessions tab unmounts. */
    securityConversation: unknown
  }
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Task-owned Session binding; shared Conversation owns transcript rendering. */
    'security.task.conversation': { kind: 'single'; scope: 'session' }
    /** Session-bound investigation request placed in the Main Agent header. */
    'security.task.investigation': { kind: 'single'; scope: 'session'; owner: { investigationDisabled: boolean; startInvestigation: (requestId: string) => Promise<'sent' | 'save-failed'>; resumeRunId?: string | undefined; resumeAvailable?: boolean; resumeDisabled?: boolean; resumeInvestigation?: (requestId: string) => Promise<void> } }
    /**
     * Optional Planner or Worker header metrics. The owner supplies saved Session
     * identities with provider engines and the selected role; the registrant owns
     * usage reads, localized labels, and unavailable values. A lower-priority
     * single contribution replaces the metrics; no contribution leaves them absent.
     */
    'security.task.tokens': { kind: 'single'; scope: 'root'; owner: { sessions: import('./TokenUsageHeader.tsx').UsageSession[]; role: 'planner' | 'worker' } }
    /** Root-owned task address and task-specific reference lifetime. */
    'security.task.sessions': { kind: 'single'; scope: 'root'; owner: SecurityConversationTarget & { beginSetup?: boolean | undefined; initialWorkerId?: string | undefined; openOverview: () => void } }
  }
}

type SessionsProps = PropsRuntime<'security.task.sessions'> & PropsRenderSlots<'security.task.tokens' | 'security.task.conversation' | 'security.task.investigation' | 'security.sessions.planning' | 'security.task.engine' | 'security.sessions.workers'>
  & PropsLocale<'security'> & InjectFace<SecurityConversationFace & PlanningFace & SetupFace & WorkerFace & Pick<ExecutionFace, 'readSecurityExecution' | 'startSecurityExecution'> & Pick<RecordsFace, 'hooks'>>

/** Bind the task's durable Session without creating a second history reader.
 * @param props - task address, owned reference opener and framework renderer.
 * @returns fixed session navigation and shared streaming conversation.
 */
export function SecurityTaskSessions(props: SessionsProps): ReactNode {
  return <TaskSessionContent key={JSON.stringify([props.workspaceId, props.taskId])} {...props} />
}

function TaskSessionContent({
  workspaceId, taskId, t, openSecurityConversation, sendSecurityConversation, SessionProvider, renderSlot,
  watchSecurityPlanning, useSecurityPlanning, readSecurityWorkers,
  beginSetup, initialWorkerId, openOverview, watchSecuritySetup, useSecuritySetup, beginSecuritySetup,
  retrySecuritySetupSave, refreshSecuritySetup, readSecurityExecution, startSecurityExecution, useSecurityRecords,
}: SessionsProps): ReactNode {
  const targetKey = JSON.stringify([workspaceId, taskId])
  const [view, setView] = useState<'main' | 'planner' | 'audit' | 'workers'>(initialWorkerId ? 'workers' : 'main')
  const [workerId, setWorkerId] = useState<string | undefined>(initialWorkerId)
  const [workers, setWorkers] = useState<SecurityWorkerState>()
  const records = useSecurityRecords(state => state[workspaceId])
  const [execution, setExecution] = useState<SecurityExecutionState>()
  const [executionError, setExecutionError] = useState(false)
  const [executionAttempt, setExecutionAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let pending = false
    const isActive = (): boolean => !controller.signal.aborted
    const refresh = async (): Promise<void> => {
      if (pending || !isActive()) return
      pending = true
      try {
        const value = await readSecurityExecution({ workspaceId, taskId })
        if (isActive()) { setExecution(value); setExecutionError(false) }
      } catch (_readFailure) { if (isActive()) setExecutionError(true) }
      finally { pending = false }
    }
    void refresh()
    const timer = setInterval(() => { void refresh() }, 1500)
    return () => { controller.abort(); clearInterval(timer) }
  }, [workspaceId, taskId, readSecurityExecution, executionAttempt])
  const latestExecution = execution?.runs.filter(run => run.workspaceId === workspaceId && run.taskId === taskId)
    .sort((a, b) => b.createdAt - a.createdAt)[0]
  const executionRunning = execution?.runs.some(run => run.workspaceId === workspaceId && run.taskId === taskId && run.status === 'running')
  const recordsReady = records?.records?.workspaceId === workspaceId && records.records.tasks.some(task => task.id === taskId)
    && !records.loading && !records.saving && !records.error && !Object.keys(records.edits ?? {}).length
  const [workerError, setWorkerError] = useState(false)
  const refreshWorkers = useRef<() => Promise<void>>(async () => {})
  useEffect(() => {
    const controller = new AbortController()
    let pending = false
    const isActive = (): boolean => !controller.signal.aborted
    const refresh = async (): Promise<void> => {
      if (pending || !isActive()) return
      pending = true
      try {
        const value = await readSecurityWorkers({ workspaceId, taskId })
        if (isActive()) { setWorkers(value); setWorkerError(false) }
      } catch (_readFailure) { if (isActive()) setWorkerError(true) }
      finally { pending = false }
    }
    refreshWorkers.current = refresh
    void refresh()
    const timer = setInterval(() => { void refresh() }, 1500)
    return () => { controller.abort(); clearInterval(timer) }
  }, [workspaceId, taskId, readSecurityWorkers])
  const workerRuns = [...(workers?.runs ?? []).filter(run => run.taskId === taskId && run.workspaceId === workspaceId)]
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
  const selectedWorker = workerRuns.find(run => run.id === workerId)
  const workerStatus = { running: 'workerRunning', completed: 'workerCompleted', failed: 'workerFailed', cancelled: 'workerCancelled', interrupted: 'workerInterrupted' } as const
  const checklistId = useId()
  const [checklist, setChecklist] = useState({ targetKey, visible: true })
  const checklistState = checklist.targetKey === targetKey ? checklist : { targetKey, visible: true }
  const setup = useSecuritySetup(state => state[targetKey])
  const completed = Object.values(setup?.state?.checklist ?? {}).filter(Boolean).length
  const autoStarted = useRef(new Set<string>())
  useEffect(() => {
    const controller = new AbortController()
    watchSecuritySetup({ workspaceId, taskId }, controller.signal)
    return () => { controller.abort() }
  }, [workspaceId, taskId, watchSecuritySetup])
  const checklistItems = [
    ['goal', 'checklistGoal'], ['scope', 'checklistScope'], ['permission', 'checklistPermission'],
    ['operations', 'checklistOperations'], ['limits', 'checklistLimits'],
  ] as const
  const checklistReady = completed === checklistItems.length
  const planning = useSecurityPlanning(state => state[targetKey])
  const plannerModel = planning?.state?.plans[0]?.snapshot.modelDecision
  const audit = [
    ...(planning?.state?.plans ?? []).filter(plan => plan.error).map(plan => ({ id: plan.id, at: plan.updatedAt, error: plan.error })),
    ...workerRuns.filter(run => run.error).map(run => ({ id: run.id, at: run.updatedAt, error: run.error })),
  ].sort((a, b) => b.at - a.at)
  const planningRunning = Boolean(planning?.state?.plans.some(plan => plan.status === 'planning'))
  useEffect(() => {
    const controller = new AbortController()
    watchSecurityPlanning({ workspaceId, taskId }, controller.signal)
    return () => { controller.abort() }
  }, [workspaceId, taskId, watchSecurityPlanning])
  const [opened, setOpened] = useState<{ targetKey: string; reference: SessionReference }>()
  const reference = opened?.targetKey === targetKey ? opened.reference : undefined
  useEffect(() => {
    if (!beginSetup || !reference || autoStarted.current.has(targetKey) || !setup?.state || setup.busy) return
    autoStarted.current.add(targetKey)
    if (!setup.state.active) void beginSecuritySetup({ workspaceId, taskId })
  }, [beginSetup, targetKey, setup, beginSecuritySetup, workspaceId, taskId, reference])
  const openMain = !initialWorkerId || view === 'main'
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!openMain) return
    const controller = new AbortController()
    let retained: SessionReference | undefined
    setOpened(undefined); setFailed(false)
    void openSecurityConversation({ workspaceId, taskId }, controller.signal).then((value) => {
      if (controller.signal.aborted) { value.release(); return }
      retained = value; setOpened({ targetKey, reference: value })
    }).catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => { controller.abort(); retained?.release() }
  }, [workspaceId, taskId, targetKey, attempt, openSecurityConversation, openMain])
  const investigationBusy = !checklistReady || Boolean(setup?.busy) || planningRunning || Boolean(executionRunning)
    || workerRuns.some(run => run.status === 'running' || run.conversationStatus === 'running')
  const resumeDisabled = latestExecution?.status === 'needs-input' || !recordsReady || executionError || investigationBusy
    || latestExecution?.snapshot.recordRevision !== records.records?.revision
  const investigationOwner = {
    investigationDisabled: !execution || executionError || investigationBusy,
    startInvestigation: (requestId: string) => sendSecurityConversation({ workspaceId, taskId }, t('securityInvestigationMessage'), requestId),
    resumeRunId: latestExecution?.id,
    resumeAvailable: Boolean(latestExecution && latestExecution.status !== 'running' && latestExecution.status !== 'completed'),
    resumeDisabled,
    resumeInvestigation: async (requestId: string) => {
      if (resumeDisabled || !latestExecution || !records.records) throw new Error(t('securityInvestigationResumeUnavailable'))
      await startSecurityExecution({ workspaceId, taskId, requestId, resumeRunId: latestExecution.id,
        expectedRevision: records.records.revision, modelDecision: latestExecution.snapshot.modelDecision })
      setExecutionAttempt(value => value + 1)
    },
  }
  return <section className={css.root} aria-label={t('sessionList')}>
    <aside className={css.sidebar}>
      <header className={css.sidebarHeader}>{t('sessionList')}</header>
      <div className={css.sessionScroll}><div className={css.groupHeading}><IconUserOutlineRegular size={14} />{t('main')}</div>
        <button type="button" className={`${css.session} ${view === 'main' ? css.selected : ''}`} aria-pressed={view === 'main'} onClick={() => { setView('main') }}>{t('mainSession')} #1</button>
        <div className={css.groupHeading}><IconPlanOutlineRegular size={14} />{t('plannerGroup')}</div><button type="button" className={`${css.session} ${view === 'planner' ? css.selected : ''}`} aria-pressed={view === 'planner'} onClick={() => { setView('planner') }}>{t('planningTitle')}</button>
        <div className={css.groupHeading}><IconShieldOutlineRegular size={14} />{t('auditGroup')}</div>
        <button type="button" className={`${css.session} ${view === 'audit' ? css.selected : ''}`} disabled={audit.length === 0} aria-pressed={view === 'audit'} onClick={() => { setView('audit') }}>{t(audit.length ? 'auditSavedEvents' : 'auditEmpty')}</button>
        <div className={css.groupHeading}><IconUsersOutlineRegular size={14} />{t('workerGroup')}{workers && !workerError && <span className={css.workerStatus}>{t('workerActiveCount')} {workerRuns.filter(run => run.status === 'running').length}</span>}</div>
        {workers?.browser?.enabled && <Button size="sm" variant="ghost" onClick={() => { setWorkerId(undefined); setView('workers') }}>{t('workerBrowserLogin')}</Button>}
        {workerError && <p role="alert" className={css.guidance}>{t('workerError')}</p>}
        {!workers && !workerError && <p role="status" className={css.guidance}>{t('workerLoading')}</p>}
        {workers?.runs.length === 0 && <p className={css.guidance}>{t('workerEmpty')}</p>}
        {workerRuns.map((run, index) => <button key={run.id} type="button" className={`${css.session} ${view === 'workers' && workerId === run.id ? css.selected : ''}`} aria-pressed={view === 'workers' && workerId === run.id} onClick={() => { setWorkerId(run.id); setView('workers') }} title={`${run.snapshot.item.title} · ${t(workerStatus[run.status === 'running' || run.conversationStatus === 'running' ? 'running' : run.status])}`}>
          {run.status === 'running' || run.conversationStatus === 'running' ? <IconLoadingOutlineRegular size={14} className={css.runningIcon} /> : run.status === 'completed' ? <IconCheckCircleOutlineRegular size={14} className={css.doneIcon} /> : <IconCloseCircleFillRegular size={14} className={css.failedIcon} />}
          <code>#{index + 1}</code><span className={css.sessionTitle}>{run.snapshot.item.title}</span>
          <span className={css.workerStatus}>{t(workerStatus[run.status === 'running' || run.conversationStatus === 'running' ? 'running' : run.status])}</span>
        </button>)}
      </div>
    </aside>
    <div className={css.conversation}>
      <header className={css.conversationHeader}><strong>{view === 'main' ? `${t('mainSession')} #1` : view === 'workers' ? selectedWorker?.snapshot.item.title ?? t('workerTitle') : t(view === 'audit' ? 'auditGroup' : 'planningTitle')}</strong>{view === 'main' && reference ? <SessionProvider session={reference}>{renderSlot('security.task.engine', { workspaceId, taskId })}{renderSlot('security.task.investigation', investigationOwner)}</SessionProvider> : view === 'planner' && plannerModel ? <span className={css.model}>{plannerModel.engine} · {plannerModel.model}</span> : selectedWorker && view === 'workers' ? <span className={css.model}>{selectedWorker.snapshot.model.engine} · {selectedWorker.snapshot.model.model}</span> : null}
        {/* Plans saved before model decisions were captured used the Claude-only Planner. */}
        {view === 'planner' && renderSlot('security.task.tokens', { role: 'planner', sessions: (planning?.state?.plans ?? []).map(plan => ({ sessionId: plan.sessionId, engine: plan.snapshot.modelDecision?.engine ?? 'claude' })) })}
        {view === 'workers' && selectedWorker && renderSlot('security.task.tokens', { role: 'worker', sessions: [{ sessionId: selectedWorker.sessionId, engine: selectedWorker.snapshot.model.engine }] })}
        {view === 'main' && planningRunning && <span role="status" className={css.model}>{t('planningStatusPlanning')}</span>}
        {view === 'main' && <div className={css.checklistToggle}>
          <span className={checklistReady ? css.checklistReady : css.checklistProgress}>{checklistReady ? t('checklistReady') : `${completed}/5`}</span>
          <Button variant="outline" size="sm" title={t('checklistToggle')} aria-label={t('checklistToggle')} aria-expanded={checklistState.visible}
            aria-controls={checklistId}
            onClick={() => { setChecklist({ ...checklistState, visible: !checklistState.visible }) }}>
            <IconFlatListOutlineRegular size={16} /></Button>
        </div>}</header>
      <div className={css.conversationBody}>
        {view === 'main' && checklistState.visible && <aside id={checklistId} className={css.checklistPanel} aria-label={t('checklistTitle')}>
          <header className={css.checklistHeader}><strong>{t('checklistTitle')}</strong><Button variant="outline" size="sm" onClick={() => { setChecklist({ ...checklistState, visible: false }) }}>{t('checklistHide')}</Button></header>
          <p className={css.checklistNote}>{t('checklistPreview')}</p>
          {checklistItems.map(([field, item]) => <label key={item} className={css.checklistItem}><input type="checkbox" disabled
            checked={Boolean(setup?.state?.checklist[field])} /><span>{t(item)}</span></label>)}
          <p className={css.checklistNote}>{t('checklistDisclaimer')}</p>
          <Button variant="outline" size="sm" onClick={openOverview}>{t('checklistOpenOverview')}</Button>
        </aside>}
        {view === 'audit' ? <div className={css.plannerScroll}>{audit.length === 0 ? <p className={css.guidance}>{t('auditEmpty')}</p> : audit.map(event => <details key={event.id} className={css.auditEvent}><summary><time dateTime={new Date(event.at).toISOString()}>{new Date(event.at).toLocaleString()}</time> · {t('workerFailed')}</summary><p>{event.error}</p></details>)}</div> : view === 'workers' ? <div className={css.mainConversation}>{renderSlot('security.sessions.workers', { workspaceId, taskId, ...(selectedWorker ? { runId: selectedWorker.id } : {}), state: workers, readError: workerError, refresh: () => refreshWorkers.current() })}</div> : view === 'planner' ? <div className={css.plannerScroll}>{renderSlot('security.sessions.planning', { workspaceId, taskId })}</div> : reference ? <div className={css.mainConversation}>
          <div className={css.setupControls}>
            {executionError && <p role="alert">{t('executionError')} <Button size="sm" variant="outline" onClick={() => { setExecutionAttempt(value => value + 1) }}>{t('executionRefresh')}</Button></p>}
            {latestExecution?.status === 'needs-input' && <p role="status">{t('securityInvestigationNeedsInput')}</p>}
            {latestExecution && latestExecution.status !== 'running' && latestExecution.status !== 'completed' && recordsReady && latestExecution.snapshot.recordRevision !== records.records?.revision && <p role="status">{t('securityInvestigationResumeUnavailable')}</p>}
            {setup?.state?.plannerError && <p role="alert">{t('planningConversationError')}</p>}
            {!checklistReady && <Button variant="outline" size="sm" disabled={setup?.busy} onClick={() => { void beginSecuritySetup({ workspaceId, taskId }) }}>{t(setup?.state?.active ? 'setupResume' : 'setupBegin')}</Button>}
            {setup?.error && <p role="alert">{t('setupError')} <Button variant="outline" size="sm" onClick={() => { if (setup.error === 'begin') void beginSecuritySetup({ workspaceId, taskId }); else void refreshSecuritySetup({ workspaceId, taskId }) }}>{t('securityChatRetry')}</Button></p>}
            {setup?.busy && <span role="status">{t('setupBusy')}</span>}
            {setup?.state?.active && !setup.state.saveError && <p role="status">{t(setup.state.proposal?.status === 'pending' ? 'setupAutoSaving' : 'setupAutoSaveNotice')}</p>}
            {setup?.state?.saveError && <p role="alert">{t(setup.state.proposal?.status === 'conflict' ? 'setupConflict' : 'setupAutoSaveError')}
              {setup.state.proposal && setup.state.proposal.status !== 'conflict' && <Button variant="outline" size="sm" disabled={setup.busy}
                onClick={() => { if (setup.state?.proposal) void retrySecuritySetupSave({ workspaceId, taskId }, setup.state.proposal) }}>{t('setupRetrySave')}</Button>}
            </p>}
          </div>
          <SessionProvider session={reference}>{renderSlot('security.task.conversation', {})}</SessionProvider>
        </div>
          : <div className={css.openStatus} role={failed ? 'alert' : 'status'}><p>{t(failed ? 'securityChatOpenError' : 'securityChatLoading')}</p>
            {failed && <Button variant="outline" onClick={() => { setAttempt(value => value + 1) }}>{t('securityChatRetry')}</Button>}</div>}
      </div>
    </div>
  </section>
}

function SecurityChatView({ renderSlot }: ConversationViewsProps): ReactNode {
  return renderSlot('conversation.session', { view: 'chat' })
}
/** Render the registered Conversation factory with its fixed Chat view.
 * @param props - session-bound rendering and lifecycle hooks.
 * @returns shared transcript, streaming state and the security composer takeover.
 */
export function SecurityConversationBody({ useSession, renderFactorySlot, t }: PropsRuntime<'security.task.conversation'> & PropsRenderFactories & PropsLocale<'security'>): ReactNode {
  const state = useSession(value => ({ openState: value.openState, blank: value.blank }))
  return <div className={css.sharedConversation}>
    {state.openState === 'error' && <p role="alert" className={css.guidance}>{t('securityChatDisconnected')}</p>}
    {state.blank && <p className={css.guidance}>{t('securityChatEmpty')}</p>}
    {renderFactorySlot('conversation.content', { variant: 'embedded', phase: 'active', hero: false }, { slots: { views: SecurityChatView } })}
  </div>
}

/** Send an investigation request from the session-bound Main Agent header.
 * @param props - session lifecycle, readiness and the normal conversation sender.
 * @returns the start action and any unconfirmed request error.
 */
export function SecurityInvestigationStart({ useSession, t, investigationDisabled, startInvestigation, resumeRunId, resumeAvailable, resumeDisabled, resumeInvestigation }: PropsRuntime<'security.task.investigation'> & PropsLocale<'security'>): ReactNode {
  const state = useSession(value => ({ openState: value.openState, running: value.running, removed: value.removed }))
  const [starting, setStarting] = useState(false)
  const [resuming, setResuming] = useState(false)
  const [resumeError, setResumeError] = useState<string>()
  const resumeRequestId = useRef({ sourceId: resumeRunId, id: randomUUID() })
  useEffect(() => {
    if (resumeRequestId.current.sourceId !== resumeRunId) {
      resumeRequestId.current = { sourceId: resumeRunId, id: randomUUID() }; setResumeError(undefined)
    }
  }, [resumeRunId])
  const [startError, setStartError] = useState<'securityChatSaveError' | 'securityInvestigationSendError'>()
  const requestId = useRef(randomUUID())
  const pending = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const start = async (): Promise<void> => {
    if (pending.current || investigationDisabled || state.running || state.openState !== 'open' || state.removed) return
    pending.current = true; setStarting(true); setStartError(undefined)
    try {
      const outcome = await startInvestigation(requestId.current)
      if (!mounted.current) return
      if (outcome === 'save-failed') setStartError('securityChatSaveError')
      else requestId.current = randomUUID()
    } catch (_unconfirmedRequest) { if (mounted.current) setStartError('securityInvestigationSendError') }
    finally { pending.current = false; if (mounted.current) setStarting(false) }
  }
  const resume = async (): Promise<void> => {
    if (pending.current || resumeDisabled || !resumeInvestigation || state.running || state.openState !== 'open' || state.removed) return
    pending.current = true; setResuming(true); setResumeError(undefined)
    try {
      await resumeInvestigation(resumeRequestId.current.id)
      if (mounted.current) resumeRequestId.current = { sourceId: resumeRunId, id: randomUUID() }
    } catch (failure) { if (mounted.current) setResumeError(failure instanceof Error ? failure.message : '') }
    finally { pending.current = false; if (mounted.current) setResuming(false) }
  }
  return <div className={css.investigationStart}><Button variant="primary" size="sm"
    disabled={investigationDisabled || starting || resuming || state.running || state.openState !== 'open' || state.removed}
    onClick={() => { void start() }}>{t(starting ? 'securityChatSending' : 'securityInvestigationStart')}</Button>
  {resumeAvailable && <Button variant="outline" size="sm" disabled={resumeDisabled || starting || resuming || state.running || state.openState !== 'open' || state.removed} onClick={() => { void resume() }}>
    {resuming && <IconLoadingOutlineRegular size={14} className={css.runningIcon} />}{t(resuming ? 'securityInvestigationResuming' : resumeError !== undefined ? 'securityInvestigationResumeRetry' : 'securityInvestigationResume')}</Button>}
  {resumeError !== undefined && <div role="alert"><span>{t('securityInvestigationResumeError')}</span>{resumeError && <details><summary>{t('executionErrorDetails')}</summary><p>{resumeError}</p></details>}</div>}
  {startError && <p role="alert">{t(startError)}</p>}
  </div>
}

type ComposerProps = PropsRuntime<'conversation.composer'> & PropsLocale<'security'>
  & { matched: SecurityConversationTarget } & InjectFace<Pick<SecurityConversationFace, 'sendSecurityConversation' | 'cancelSecurityConversation'>>

/** Route every task message through saved task context and the security service.
 * @param props - session lifecycle, task election and narrowly scoped commands.
 * @returns a retained draft, confirmed-send action and cancellation control.
 */
export function SecurityConversationComposer(props: ComposerProps): ReactNode {
  return <TaskConversationComposer key={JSON.stringify([props.matched.workspaceId, props.matched.taskId])} {...props} />
}

function TaskConversationComposer({
  matched, useSession, t, sendSecurityConversation, cancelSecurityConversation,
}: ComposerProps): ReactNode {
  const scope = JSON.stringify([matched.workspaceId, matched.taskId])
  const currentScope = useRef(scope)
  currentScope.current = scope
  const running = useSession(value => value.running)
  const unavailable = useSession(value => value.openState !== 'open' || value.removed)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState<'securityChatSaveError' | 'securityChatSendError' | 'securityChatStopError'>()
  const request = useRef({ text: '', id: randomUUID() })
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const send = async (): Promise<void> => {
    const text = draft.trim()
    if (!text || busy || running || unavailable) return
    if (request.current.text !== text) request.current = { text, id: randomUUID() }
    const sentScope = scope
    setBusy(true); setError(undefined)
    try {
      const outcome = await sendSecurityConversation(matched, text, request.current.id)
      if (!mounted.current || currentScope.current !== sentScope) return
      if (outcome === 'save-failed') setError('securityChatSaveError')
      else { setDraft(''); request.current = { text: '', id: randomUUID() } }
    } catch (_unconfirmedSend) { if (mounted.current && currentScope.current === sentScope) setError('securityChatSendError') }
    finally { if (mounted.current && currentScope.current === sentScope) setBusy(false) }
  }
  const stop = async (): Promise<void> => {
    const stoppedScope = scope
    setStopping(true); setError(undefined)
    try { await cancelSecurityConversation(matched) }
    catch (_unconfirmedStop) { if (mounted.current && currentScope.current === stoppedScope) setError('securityChatStopError') }
    finally { if (mounted.current && currentScope.current === stoppedScope) setStopping(false) }
  }
  return <form className={css.liveComposerArea} onSubmit={(event) => { event.preventDefault(); void send() }}>
    <div className={css.composer}><textarea value={draft} rows={2} aria-label={t('sessionMessage')} placeholder={t('sessionMessage')}
      disabled={busy || unavailable} onChange={(event) => { setDraft(event.target.value) }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || !event.metaKey || event.nativeEvent.isComposing) return
        event.preventDefault(); void send()
      }} />
    <div className={css.composerTools}><span className={css.composerNote}>{t(busy ? 'securityChatSending' : 'securityChatNotice')}</span>
      {running ? <Button type="button" variant="outline" size="sm" disabled={stopping} onClick={() => { void stop() }}>{t('securityChatStop')}</Button>
        : <Button type="submit" variant="primary" size="sm" disabled={busy || unavailable || !draft.trim()} aria-label={t('securityChatSend')}><IconPaperPlaneOutlineRegular size={16} /></Button>}
    </div>
    </div>{error && <p role="alert" className={css.composerNote}>{t(error)}</p>}
  </form>
}
