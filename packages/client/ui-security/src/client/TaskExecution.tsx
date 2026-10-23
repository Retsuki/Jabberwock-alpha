import { executionMessageKeys } from './TaskExecution.copy.ts'
/** Read-only durable execution activity; investigation starts belong to the main agent. */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SecurityConversationRequest } from '../conversation-types.ts'
import type { SecurityExecutionEvent, SecurityExecutionRun, SecurityExecutionState, SecurityExecutionStartRequest } from '../execution-types.ts'
import type { SecurityTranslate } from './presentation.tsx'
import css from './TaskPlanning.module.css'

/** Commands provided by the security owner; this view only reads and stops. */
export interface ExecutionFace {
  readSecurityExecution(this: void, target: SecurityConversationRequest): Promise<SecurityExecutionState>
  startSecurityExecution(this: void, request: SecurityExecutionStartRequest): Promise<void>
  cancelSecurityExecution(this: void, target: SecurityConversationRequest): Promise<void>
}
const statusKeys = {
  running: 'executionRunning', completed: 'executionCompleted', 'needs-input': 'executionNeedsInput',
  failed: 'executionFailed', cancelled: 'executionCancelled', interrupted: 'executionInterrupted',
} as const

/** Keep recorded activity visible while non-overlapping reads refresh the task.
 * @param props - immutable task identity and read/stop commands.
 * @returns compact execution status and expandable persisted activity.
 */
export function TaskExecution({ target, t, face }: {
  target: SecurityConversationRequest
  t: SecurityTranslate
  face: Pick<ExecutionFace, 'readSecurityExecution' | 'cancelSecurityExecution'>
}): ReactNode {
  const [state, setState] = useState<SecurityExecutionState>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const mounted = useRef(true)
  const reading = useRef(false)
  const lock = useRef(false)
  const generation = useRef(0)
  const refresh = async (): Promise<void> => {
    if (reading.current) return
    reading.current = true
    const current = generation.current
    try {
      const next = await face.readSecurityExecution(target)
      if (mounted.current && generation.current === current) { setState(next); setError(undefined) }
    } catch (failure) {
      if (mounted.current && generation.current === current) setError(failure instanceof Error ? failure.message : '')
    } finally { if (generation.current === current) reading.current = false }
  }
  useEffect(() => {
    generation.current++; mounted.current = true; reading.current = false
    setState(undefined); setError(undefined); void refresh()
    const timer = setInterval(() => { void refresh() }, 1500)
    return () => { mounted.current = false; generation.current++; clearInterval(timer) }
  }, [target.workspaceId, target.taskId, face.readSecurityExecution])
  const active = state?.runs.some(run => run.status === 'running')
  const newest = state?.runs[0]
  const stop = async (): Promise<void> => {
    if (lock.current) return
    const current = generation.current
    lock.current = true; setBusy(true)
    try { await face.cancelSecurityExecution(target); if (generation.current === current) await refresh() }
    catch (failure) { if (mounted.current && generation.current === current) setError(failure instanceof Error ? failure.message : '') }
    finally { lock.current = false; if (mounted.current && generation.current === current) setBusy(false) }
  }
  const message = (text: string): string => Object.hasOwn(executionMessageKeys, text)
    ? t(executionMessageKeys[text as keyof typeof executionMessageKeys]) : text
  return <section className={css.root} aria-label={t('executionTitle')}>
    <header className={css.executionStatus}>
      <span>{newest ? t(executionGuidance(newest) === 'executionLimitNext' ? 'executionLimitReached' : statusKeys[newest.status]) : t('executionIdle')}</span>
      {newest && <><span>{t('executionRound')} {newest.round}</span><span>{t('executionEvidence')} {newest.workerRunIds.length}</span><span>{t('executionConcurrency')} {newest.snapshot.limits.maxConcurrentWorkers ?? 1}</span></>}
      <div className={css.actions}><Button variant="ghost" size="sm" onClick={() => { void refresh() }}>{t('executionRefresh')}</Button>
        {active && <Button size="sm" variant="outline" disabled={busy} onClick={() => { void stop() }}>{t('executionStop')}</Button>}
      </div>
    </header>
    {error !== undefined && <div role="alert" className={css.error}><span>{t('executionError')}</span>
      <Button variant="outline" size="sm" onClick={() => { void refresh() }}>{t('planningRetry')}</Button>
      {error && <details><summary>{t('executionErrorDetails')}</summary><p className={css.result}>{error}</p></details>}
    </div>}
    {!state && error === undefined && <p role="status" className={css.notice}>{t('executionLoading')}</p>}
    {state?.runs.slice().reverse().map((run) => {
      const guidance = executionGuidance(run)
      return <article className={css.executionRun} key={run.id}>
        <header className={css.planHeader}><span className={css.status}>{t(guidance === 'executionLimitNext' ? 'executionLimitReached' : statusKeys[run.status])}</span>
          <time className={css.notice} dateTime={new Date(run.createdAt).toISOString()}>{new Date(run.createdAt).toLocaleString()}</time>
        </header>
        {guidance && <p className={css.notice}>{t(guidance)}</p>}
        {run.resumedFromRunId && <p className={css.notice}>{t('executionResumedFrom')} <code>{run.resumedFromRunId}</code></p>}
        {rounds(run).map(([round, events]) => <section key={round} className={css.round} aria-label={`${t('executionRound')} ${round}`}>
          <h4 className={css.sectionTitle}>{t('executionRound')} {round}</h4>
          <ol className={css.activity}>{events.map((event, index) => <li key={index}>
            <details><summary className={css.activityRow}>
              <time dateTime={new Date(event.at).toISOString()}>{new Date(event.at).toLocaleTimeString()}</time>
              <span className={css.rowTitle}>{message(event.message)}</span>
              <span className={css.rowKind}>{t(eventKeys[event.kind])}</span>
            </summary><div className={css.activityDetail}><p className={css.result}>{message(event.message)}</p>
              {event.workerRunId && <code>{event.workerRunId}</code>}
            </div></details>
          </li>)}</ol>
        </section>)}
        {run.summary && <details open={run.status !== 'running'} className={css.decision}><summary>{t('executionPlannerReport')}</summary><p className={css.result}>{message(run.summary)}</p></details>}
        {(run.error || run.status === 'failed') && <div role="alert" className={css.error}><span>{t('executionRunFailed')}</span>
          {run.error && <details><summary>{t('executionErrorDetails')}</summary><p className={css.result}>{run.error}</p></details>}
        </div>}
      </article> })}
  </section>
}
const eventKeys = {
  started: 'executionEventStarted', worker: 'executionEventWorker', review: 'executionEventReview',
  decision: 'executionEventDecision', stopped: 'executionEventStopped',
} as const

function rounds(run: SecurityExecutionRun): [number, SecurityExecutionEvent[]][] {
  const groups = new Map<number, SecurityExecutionEvent[]>()
  let round = 1
  for (const event of run.events) {
    const index = event.planId ? run.planIds.indexOf(event.planId) : -1
    if (index >= 0) round = Math.max(1, index + (event.kind === 'review' || event.kind === 'decision' ? 0 : 1))
    const events = groups.get(round) ?? []
    events.push(event); groups.set(round, events)
  }
  return [...groups.entries()]
}

/** Guidance uses only terminal statuses and exact system messages, never model-authored cause guesses. */
function executionGuidance(run: SecurityExecutionRun): 'executionLimitNext' | 'executionOwnerNext' | 'executionStoppedNext' | 'executionUnknownNext' | undefined {
  if (run.status === 'running' || run.status === 'completed') return undefined
  if (run.status === 'cancelled' || run.status === 'interrupted') return 'executionStoppedNext'
  const reason = run.events.findLast(event => event.kind === 'stopped')?.message ?? run.summary ?? run.error
  if (reason === 'Configured request limit reached.' || reason === 'Configured request limit reached; saved results were already reviewed.'
    || reason === 'Configured request limit reached; remaining results require review.' || reason === 'Configured Planner round limit reached.'
    || reason === 'Execution exceeded its configured elapsed-time limit.') return 'executionLimitNext'
  return reason === 'Planner requires owner input.' ? 'executionOwnerNext' : 'executionUnknownNext'
}
