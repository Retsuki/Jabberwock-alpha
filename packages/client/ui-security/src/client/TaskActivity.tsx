/** Shared read lifecycle for the task timeline and exploration graph. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SecurityConversationRequest } from '../conversation-types.ts'
import type { SecurityAsset, SecurityTask } from '../security-records.ts'
import type { SecurityPlanningState } from '../planning-types.ts'
import type { SecurityWorkerState } from '../worker-types.ts'
import type { SecurityExecutionState } from '../execution-types.ts'
import type { SecurityExplorationState } from '../exploration-types.ts'
import { buildTaskActivity } from './activity-model.ts'
import { TaskTimeline } from './TaskTimeline.tsx'
import { TaskExploration } from './TaskExploration.tsx'
/** Read-only task records; fetching activity never starts an investigation. */
export interface ActivityFace {
  readTaskActivity(this: void, target: SecurityConversationRequest): Promise<{
    planning: SecurityPlanningState
    workers: SecurityWorkerState
    execution: SecurityExecutionState
    exploration?: SecurityExplorationState
  }>
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Saved task activity with one polling owner across both views. */
    'security.task.activity': { kind: 'single'; scope: 'root'; owner: SecurityConversationRequest & { task: SecurityTask; assets: SecurityAsset[]; view: 'timeline' | 'exploration' } }
  }
}
type Props = PropsRuntime<'security.task.activity'> & PropsLocale<'security'> & InjectFace<ActivityFace>
/** Keep identity changes from retaining records belonging to another task. */
export function TaskActivity(props: Props): ReactNode {
  return <ActivityContent key={JSON.stringify([props.workspaceId, props.taskId])} {...props} />
}
function ActivityContent({ workspaceId, taskId, task, assets, view, t, readTaskActivity }: Props): ReactNode {
  const [records, setRecords] = useState<Awaited<ReturnType<ActivityFace['readTaskActivity']>>>()
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

    const lifecycle = new AbortController()
    const active = (): boolean => !lifecycle.signal.aborted
    let timer: ReturnType<typeof setTimeout> | undefined
    const read = async (): Promise<void> => {
      if (!active()) return
      setLoading(true)
      try {
        const result = await readTaskActivity({ workspaceId, taskId })
        if (active()) { setRecords(result); setError(false) }
      } catch (error) { /* The current view owns the retry message. */ void error; if (active()) setError(true) }
      finally {
        if (active()) {
          setLoading(false)
          if (auto) timer = setTimeout(() => { pending.current = pending.current.then(read) }, 1500)
        }
      }
    }
    pending.current = pending.current.then(read)
    return () => { lifecycle.abort(); clearTimeout(timer) }
  }, [workspaceId, taskId, readTaskActivity, auto, refresh])
  const model = useMemo(() => buildTaskActivity(task, assets,
    records?.planning ?? { plans: [] },
    records?.workers ?? { runs: [], limits: { requestTimeoutMs: 0, responseBytes: 0, modelTimeoutMs: 0 } },
    records?.execution ?? { runs: [], limits: { maxRounds: 0, maxRequests: 0, timeoutMs: 0 } },
    records?.exploration), [task, assets, records])
  const props = { t, model, auto, onAutoChange: setAuto, refresh: () => { setRefresh(value => value + 1) }, loading, error }
  return view === 'timeline' ? <TaskTimeline {...props} /> : <TaskExploration {...props} />
}
