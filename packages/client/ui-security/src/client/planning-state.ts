/** Task-addressed planning projections and polling owned by the plugin lifecycle. */
import { createSnapshotStore, type ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { SecurityConversationRequest } from '../conversation-types.ts'
import type { SecurityPlanningState } from '../planning-types.ts'

/** UI request status preserves the last confirmed durable plans. */
export interface PlanningEntry {
  state?: SecurityPlanningState | undefined
  loading: boolean
  busy?: 'start' | 'cancel' | undefined
  error?: 'read' | 'start' | 'save' | 'cancel' | undefined
}
/** Planner commands and a private observable bound through framework injection. */
export interface PlanningFace {
  hooks: { securityPlanning: ObservableSnapshot<Record<string, PlanningEntry>> }
  watchSecurityPlanning(target: SecurityConversationRequest, signal: AbortSignal): void
  refreshSecurityPlanning(target: SecurityConversationRequest): Promise<void>
  startSecurityPlanning(target: SecurityConversationRequest): Promise<void>
  cancelSecurityPlanning(target: SecurityConversationRequest): Promise<void>
}

/** Bind the Host projection without creating a second Session history reader.
 * @param remote - dedicated planning methods.
 * @param flush - confirm dirty task fields before admitting a snapshot.
 * @returns narrowly scoped view data, commands and lifecycle cleanup.
 */
export function createPlanningState(remote: Pick<ClientRemote['securityPlanning'], 'read' | 'start' | 'cancel'>, flush: (workspaceId: SecurityConversationRequest['workspaceId']) => Promise<boolean>): PlanningFace & { dispose(): void } {
  const source = createSnapshotStore<Record<string, PlanningEntry>>({})
  const keyOf = (target: SecurityConversationRequest): string => JSON.stringify([target.workspaceId, target.taskId])
  const observers = new Map<string, number>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const versions = new Map<string, number>()
  const requests = new Map<string, string>()
  const releases = new Set<() => void>()
  let disposed = false
  const isActive = (): boolean => !disposed
  const readEntry = (key: string): PlanningEntry => source.getSnapshot()[key] ?? { loading: false }
  const set = (key: string, entry: PlanningEntry): void => { if (isActive()) source.set({ ...source.getSnapshot(), [key]: entry }) }
  const nextVersion = (key: string): number => { const version = (versions.get(key) ?? 0) + 1; versions.set(key, version); return version }
  const schedule = (target: SecurityConversationRequest): void => {
    const key = keyOf(target)
    clearTimeout(timers.get(key)); timers.delete(key)
    if (!isActive() || !observers.get(key)) return
    timers.set(key, setTimeout(() => { timers.delete(key); void refreshSecurityPlanning(target) }, 1500))
  }
  const refreshSecurityPlanning = async (target: SecurityConversationRequest): Promise<void> => {
    if (!isActive()) return
    const key = keyOf(target)
    if (readEntry(key).busy || readEntry(key).loading) return
    const version = nextVersion(key)
    set(key, { ...readEntry(key), loading: true, error: undefined })
    try {
      const result = await remote.read(target)
      if (!isActive() || versions.get(key) !== version) return
      if (!result.ok) throw new Error(result.error.message)
      if (result.value.plans.some(plan => plan.requestId === requests.get(key))) requests.delete(key)
      set(key, { ...readEntry(key), state: result.value, loading: false, error: undefined })
      schedule(target)
    } catch (_readFailure) {
      if (isActive() && versions.get(key) === version) {
        set(key, { ...readEntry(key), loading: false, error: 'read' }); schedule(target)
      }
    }
  }
  const startSecurityPlanning = async (target: SecurityConversationRequest): Promise<void> => {
    if (!isActive()) return
    const key = keyOf(target)
    if (readEntry(key).busy || readEntry(key).state?.plans.some(plan => plan.status === 'planning')) return
    const version = nextVersion(key)
    clearTimeout(timers.get(key)); timers.delete(key)
    set(key, { ...readEntry(key), busy: 'start', loading: false, error: undefined })
    try {
      if (!await flush(target.workspaceId)) { set(key, { ...readEntry(key), busy: undefined, error: 'save' }); return }
      if (!isActive()) return
      const requestId = requests.get(key) ?? randomUUID()
      requests.set(key, requestId)
      const result = await remote.start({ ...target, requestId })
      if (!isActive() || versions.get(key) !== version) return
      if (!result.ok) throw new Error(result.error.message)
      requests.delete(key)
      set(key, { state: result.value, loading: false })
      schedule(target)
    } catch (_startFailure) {
      if (isActive() && versions.get(key) === version) set(key, { ...readEntry(key), busy: undefined, error: 'start' })
    }
  }
  return {
    hooks: { securityPlanning: source }, refreshSecurityPlanning, startSecurityPlanning,
    watchSecurityPlanning(target, signal) {
      if (!isActive() || signal.aborted) return
      const key = keyOf(target)
      observers.set(key, (observers.get(key) ?? 0) + 1)
      const release = (): void => {
        if (!releases.delete(release)) return
        signal.removeEventListener('abort', release)
        const count = (observers.get(key) ?? 1) - 1
        if (count) observers.set(key, count)
        else { observers.delete(key); clearTimeout(timers.get(key)); timers.delete(key) }
      }
      releases.add(release); signal.addEventListener('abort', release, { once: true })
      void refreshSecurityPlanning(target)
    },
    async cancelSecurityPlanning(target) {
      if (!isActive()) return
      const key = keyOf(target)
      if (readEntry(key).busy) return
      const version = nextVersion(key)
      clearTimeout(timers.get(key)); timers.delete(key)
      set(key, { ...readEntry(key), busy: 'cancel', loading: false, error: undefined })
      try {
        const result = await remote.cancel(target)
        if (!isActive() || versions.get(key) !== version) return
        if (!result.ok) throw new Error(result.error.message)
        set(key, { state: result.value, loading: false }); schedule(target)
      } catch (_cancelFailure) {
        if (isActive() && versions.get(key) === version) set(key, { ...readEntry(key), busy: undefined, error: 'cancel' })
      }
    },
    dispose() {
      disposed = true
      for (const release of [...releases]) release()
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
    },
  }
}
