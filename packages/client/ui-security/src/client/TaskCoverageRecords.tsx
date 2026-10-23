/** Task-owned, read-only asset coverage polling. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SecurityConversationRequest } from '../conversation-types.ts'
import type { SecurityRecords } from '../security-records.ts'
import type { SecurityPlanningState } from '../planning-types.ts'
import type { SecurityWorkerState } from '../worker-types.ts'
import type { SecurityFindingState } from '../finding-types.ts'
import { buildTaskCoverage } from './coverage-model.ts'
import { TaskAssetCoverage } from './TaskAssetCoverage.tsx'
/** Reading coverage never starts models or target requests. */
export interface CoverageFace {
  readTaskCoverage(this: void, target: SecurityConversationRequest): Promise<{
    records: SecurityRecords
    planning: SecurityPlanningState
    workers: SecurityWorkerState
    findings: SecurityFindingState
  }>
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * Task coverage panel receiving workspace/task identity and an openWorker
     * callback that selects a Worker in Sessions. The registrant owns record
     * reads, graph controls, and loading/error presentation. A lower-priority
     * single contribution replaces the panel; no contribution leaves it empty.
     */
    'security.task.coverage': { kind: 'single'; scope: 'root'; owner: SecurityConversationRequest & { openWorker: (runId: string) => void } }
  }
}
type Props = PropsRuntime<'security.task.coverage'> & PropsLocale<'security'> & InjectFace<CoverageFace>
/** Identity changes reset the graph and ignore late results. */
export function TaskCoverageRecords(props: Props): ReactNode {
  return <CoverageContent key={JSON.stringify([props.workspaceId, props.taskId])} {...props} />
}
function CoverageContent({ workspaceId, taskId, t, readTaskCoverage, openWorker }: Props): ReactNode {
  const [records, setRecords] = useState<Awaited<ReturnType<CoverageFace['readTaskCoverage']>>>()
  const [auto, setAuto] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const pending = useRef<Promise<void>>(Promise.resolve())
  const previousRefresh = useRef(-1)
  useEffect(() => {
    const manual = refresh !== previousRefresh.current
    previousRefresh.current = refresh
    if (!auto && !manual) { setLoading(false); return }
    const controller = new AbortController()
    const active = (): boolean => !controller.signal.aborted
    let timer: ReturnType<typeof setTimeout> | undefined
    const read = async (): Promise<void> => {
      if (!active()) return
      setLoading(true)
      try {
        const value = await readTaskCoverage({ workspaceId, taskId })
        if (active()) { setRecords(value); setError(false) }
      } catch (_failure) { if (active()) setError(true) }
      finally {
        if (active()) {
          setLoading(false)
          if (auto) timer = setTimeout(() => { pending.current = pending.current.then(read) }, 1500)
        }
      }
    }
    pending.current = pending.current.then(read)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [workspaceId, taskId, readTaskCoverage, auto, refresh])
  const task = records?.records.tasks.find(value => value.id === taskId)
  const model = useMemo(() => task && records ? buildTaskCoverage(task, records.records.assets,
    records.records.companies, records.planning, records.workers, records.findings) : undefined, [task, records])
  const reload = (): void => { setRefresh(value => value + 1) }
  if (!model) return <section aria-label={t('coverage')}>
    <p role={error || (records && !task) ? 'alert' : 'status'}>{t(error || (records && !task) ? 'assetCoverageError' : 'assetCoverageLoading')}</p>
    <Button variant="outline" size="sm" disabled={loading} onClick={reload}>{t('timelineRefresh')}</Button>
  </section>
  return <TaskAssetCoverage t={t} model={model} loading={loading} error={error} auto={auto}
    onAutoChange={setAuto} refresh={reload} openWorker={(runId) => {
      if (records?.workers.runs.some(run => run.id === runId && run.taskId === taskId && run.workspaceId === workspaceId)) openWorker(runId)
    }} />
}
