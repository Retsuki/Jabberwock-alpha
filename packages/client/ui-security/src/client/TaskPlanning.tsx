import { TaskExecution, type ExecutionFace } from './TaskExecution.tsx'
/** Saved Planner output and pending investigations, without execution controls. */
import { useEffect, type ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SecurityConversationRequest } from '../conversation-types.ts'
import type { SecurityPlan } from '../planning-types.ts'
import type { SecurityTask } from '../security-records.ts'
import type { PlanningFace } from './planning-state.ts'
import type { RecordsFace } from './records-state.ts'
import type { SecurityTranslate } from './presentation.tsx'
import css from './TaskPlanning.module.css'

/** Planner views share one task-addressed projection with the Sessions entry. */
export type PlanningViewFace = Pick<ExecutionFace, 'readSecurityExecution' | 'cancelSecurityExecution'> & PlanningFace & Pick<RecordsFace, 'hooks'>
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** One task's saved planning attempts and still-unexecuted queue. */
    'security.task.planning': { kind: 'single'; scope: 'root'; owner: SecurityConversationRequest }
    /** Planner panel owned by the Sessions navigation. */
    'security.sessions.planning': { kind: 'single'; scope: 'root'; owner: SecurityConversationRequest }
  }
}

type Props = PropsRuntime<'security.task.planning'> & PropsLocale<'security'> & InjectFace<PlanningViewFace>
const statusKeys = {
  planning: 'planningStatusPlanning', ready: 'planningStatusReady', failed: 'planningStatusFailed',
  cancelled: 'planningStatusCancelled', interrupted: 'planningStatusInterrupted',
} as const

function configuration(task: SecurityTask): string {
  return JSON.stringify([task.name, task.description, task.objective, task.assetIds,
    task.goals ?? [], task.constraints ?? [], task.scopeRules ?? [], task.setup])
}

/** Subscribe through the injected hook and retain only the dedicated plan read loop.
 * @param props - task identity, records projection and planning commands.
 * @returns a saved queue, generation feedback and retained plan history.
 */
export function TaskPlanning({
  workspaceId, taskId, t, useSecurityPlanning, useSecurityRecords,
  watchSecurityPlanning, refreshSecurityPlanning, cancelSecurityPlanning,
  readSecurityExecution, cancelSecurityExecution,
}: Props): ReactNode {
  const key = JSON.stringify([workspaceId, taskId])
  const entry = useSecurityPlanning(state => state[key])
  const records = useSecurityRecords(state => state[workspaceId])
  const task = records?.records?.tasks.find(value => value.id === taskId)
  const currentTask = task ? { ...task, ...records?.edits?.[taskId]?.patch } : undefined
  const plans = entry?.state?.plans ?? []
  const newest = plans[0]
  const stale = Boolean(newest && currentTask && (configuration(currentTask) !== configuration(newest.snapshot.task)
    || JSON.stringify(records?.records?.assets.filter(asset => currentTask.assetIds.includes(asset.id)))
      !== JSON.stringify(newest.snapshot.assets)))
  const running = plans.some(plan => plan.status === 'planning')
  const target = { workspaceId, taskId }
  useEffect(() => {
    const controller = new AbortController()
    watchSecurityPlanning({ workspaceId, taskId }, controller.signal)
    return () => { controller.abort() }
  }, [workspaceId, taskId, watchSecurityPlanning])
  const errorKey = entry?.error === 'save' ? 'planningSaveError' : entry?.error === 'start' ? 'planningStartError'
    : entry?.error === 'cancel' ? 'planningCancelError' : 'planningError'
  return <section className={css.root} aria-label={t('planningTitle')}>
    {running && <header className={css.header}><div className={css.actions}>
      <Button variant="outline" size="sm" disabled={Boolean(entry?.busy)}
        onClick={() => { void cancelSecurityPlanning(target) }}>{t(entry?.busy === 'cancel' ? 'planningStopping' : 'planningStop')}</Button>
    </div></header>}
    <TaskExecution key={key} target={target} t={t} face={{ readSecurityExecution, cancelSecurityExecution }} />
    {entry?.error && <div className={css.error} role="alert"><span>{t(errorKey)}</span><Button variant="outline" size="sm" disabled={Boolean(entry.busy)} onClick={() => {
      void refreshSecurityPlanning(target)
    }}>{t('planningRetry')}</Button></div>}
    {!entry?.state && !entry?.error && <p role="status" className={css.empty}>{t('planningLoading')}</p>}
    {entry?.state && !newest && <p className={css.empty}>{t('planningEmpty')}</p>}
    {plans.slice().reverse().map((plan, index) => <PlanCard key={plan.id} plan={plan} t={t}
      round={index + 1} stale={plan.id === newest?.id && stale} />)}
  </section>
}

function PlanCard({ plan, t, stale, round }: { plan: SecurityPlan; t: SecurityTranslate; stale: boolean; round: number }): ReactNode {
  return <article className={css.plan}>
    <header className={css.planHeader}><h4 className={css.sectionTitle}>{t('planningRound')} {round}</h4>
      <time className={css.notice} dateTime={new Date(plan.createdAt).toISOString()}>{new Date(plan.createdAt).toLocaleTimeString()}</time>
      <span className={css.status}>{t(plan.status === 'planning' && plan.snapshot.previousPlanId ? 'planningReviewRunning' : statusKeys[plan.status])}</span>
    </header>
    {plan.snapshot.workerRunIds && <p className={css.notice}>{t('planningReviewResults')} {plan.snapshot.workerRunIds.length}</p>}
    {stale && <p className={css.notice} role="status">{t('planningStale')}</p>}
    {plan.status === 'failed' && <div role="alert" className={css.error}><span>{t('planningFailureNotice')}</span>
      {plan.error && <details><summary>{t('executionErrorDetails')}</summary><p className={css.result}>{plan.error}</p></details>}
    </div>}
    <ol className={css.activity}><li><details><summary className={css.activityRow}>
      <time dateTime={new Date(plan.createdAt).toISOString()}>{new Date(plan.createdAt).toLocaleTimeString()}</time>
      <span className={css.rowTitle}>{t(plan.snapshot.previousPlanId ? 'planningReviewStarted' : 'planningStartedActivity')}</span>
    </summary><p className={css.activityDetail}>{t('planningBasedOn')}: {plan.snapshot.task.name}</p></details></li>
    {plan.status !== 'planning' && <li className={css.activityRow}>
      <time dateTime={new Date(plan.updatedAt).toISOString()}>{new Date(plan.updatedAt).toLocaleTimeString()}</time>
      <span className={css.rowTitle}>{t(statusKeys[plan.status])}</span><span className={css.rowKind}>{plan.items.length}</span>
    </li>}</ol>
    {plan.reviewSummary && <details className={css.decision}><summary className={css.activityRow}>
      <span className={css.rowTitle}>{t('executionPlannerReport')}</span>
      {plan.reviewDecision && <span className={css.status}>{t(plan.reviewDecision === 'complete' ? 'executionCompleted'
        : plan.reviewDecision === 'needs-input' ? 'executionNeedsInput' : 'executionRunning')}</span>}
    </summary><p className={css.result}>{plan.reviewSummary}</p></details>}
    {!!plan.items.length && <ol className={css.items}>{plan.items.map(item => <li key={item.id} className={css.item}>
      <details><summary className={css.activityRow}><span className={css.rowTitle}>{item.title}</span>
        <span className={css.rowKind}>{t('planningPending')}</span></summary>
      <dl className={css.details}><div><dt>{t('planningTargets')}</dt><dd>{item.targetAssetIds.length
        ? item.targetAssetIds.map(id => plan.snapshot.assets.find(asset => asset.id === id)?.value ?? id).join(', ')
        : t('planningNoTargets')}</dd></div>
      <div><dt>{t('planningPurpose')}</dt><dd>{item.purpose}</dd></div>
      <div><dt>{t('planningApproach')}</dt><dd>{item.approach}</dd></div>
      </dl>
      </details>
    </li>)}</ol>}
  </article>
}
