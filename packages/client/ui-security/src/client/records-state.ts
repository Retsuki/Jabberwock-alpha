/** Host-owned security records exposed through a narrow client snapshot. */
import { createSnapshotStore, type ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { SecurityRecords, SecurityTask } from '../security-records.ts'

type WorkspaceId = SecurityRecords['workspaceId']
type Content = Pick<SecurityRecords, 'companies' | 'assets' | 'tasks'>
/** Editable task fields; no execution state is accepted. */
export type TaskEditFields = Pick<SecurityTask, 'name' | 'description' | 'objective' | 'assetIds' | 'goals' | 'constraints' | 'scopeRules'>
/** Unsaved fields survive screen unmounts until the Host confirms them. */
export interface TaskEdit { patch: Partial<TaskEditFields>; sequence: number; state: 'pending' | 'saving' | 'failed' | 'invalid' }
/** Per-workspace request state; failed saves retain the last durable records. */
export interface RecordsEntry { records?: SecurityRecords | undefined; loading: boolean; saving: boolean; error?: 'read' | 'write'; edits?: Record<string, TaskEdit> | undefined }
/** Client actions do not publish edits until the Host confirms durable storage. */
export interface RecordsFace {
  hooks: { securityRecords: ObservableSnapshot<Record<string, RecordsEntry>> }
  editSecurityTask(workspaceId: WorkspaceId, taskId: string, patch: Partial<TaskEditFields>): void
  flushSecurityTasks(workspaceId: WorkspaceId): Promise<boolean>
  loadSecurityRecords(workspaceId: WorkspaceId): Promise<void>
  saveSecurityRecords(workspaceId: WorkspaceId, content: Content): Promise<boolean>
}
/** Bind read/save RPCs to per-workspace snapshots.
 * @param remote - Host-owned security records methods.
 * @returns Observable records and explicitly awaited load/save actions.
 */
export function createRecordsState(remote: {
  read(input: { workspaceId: WorkspaceId }): Promise<RemoteResult<SecurityRecords>>
  save(input: Content & { workspaceId: WorkspaceId; expectedRevision: number }): Promise<RemoteResult<SecurityRecords>>
}): RecordsFace {
  const source = createSnapshotStore<Record<string, RecordsEntry>>({})
  const set = (id: string, entry: RecordsEntry): void => { source.set({ ...source.getSnapshot(), [id]: entry }) }
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const running = new Map<string, Promise<boolean>>()
  const aggregateWrites = new Map<string, Promise<void>>()
  const flushSecurityTasks = (workspaceId: WorkspaceId): Promise<boolean> => {
    clearTimeout(timers.get(workspaceId)); timers.delete(workspaceId)
    const aggregateWrite = aggregateWrites.get(workspaceId)
    if (aggregateWrite) return aggregateWrite.then(() => flushSecurityTasks(workspaceId))
    const current = running.get(workspaceId)
    if (current) return current
    const drain = async (): Promise<boolean> => {
      while (true) {
        const entry = source.getSnapshot()[workspaceId]
        if (!entry?.records || entry.loading || entry.error) return false
        const pending = Object.entries(entry.edits ?? {})[0]
        if (!pending) return true
        const [taskId, edit] = pending
        const task = entry.records.tasks.find(item => item.id === taskId)
        if (!task || !(edit.patch.name ?? task.name).trim()) {
          set(workspaceId, { ...entry, saving: false, edits: { ...entry.edits, [taskId]: { ...edit, state: 'invalid' } } })
          return false
        }
        set(workspaceId, { ...entry, saving: true, edits: { ...entry.edits, [taskId]: { ...edit, state: 'saving' } } })
        const content = entry.records
        try {
          const result = await remote.save({ workspaceId, expectedRevision: content.revision,
            companies: content.companies, assets: content.assets,
            tasks: content.tasks.map(item => item.id === taskId ? { ...item, ...edit.patch, updatedAt: Date.now() } : item),
          })
          const latest = source.getSnapshot()[workspaceId] ?? entry
          if (!result.ok) {
            const dirty = latest.edits?.[taskId] ?? edit
            set(workspaceId, { ...latest, saving: false, error: 'write', edits: { ...latest.edits, [taskId]: { ...dirty, state: 'failed' } } })
            return false
          }
          const edits = Object.fromEntries(Object.entries(latest.edits ?? {})
            .filter(([id, pendingEdit]) => id !== taskId || pendingEdit.sequence !== edit.sequence))
          set(workspaceId, { records: result.value, loading: false, saving: Object.keys(edits).length > 0, edits })
        } catch (_taskSaveFailure) {
          const latest = source.getSnapshot()[workspaceId] ?? entry
          const dirty = latest.edits?.[taskId] ?? edit
          set(workspaceId, { ...latest, saving: false, error: 'write', edits: { ...latest.edits, [taskId]: { ...dirty, state: 'failed' } } })
          return false
        }
      }
    }
    const promise = drain().finally(() => { running.delete(workspaceId) })
    running.set(workspaceId, promise)
    return promise
  }
  const loadSecurityRecords = async (workspaceId: WorkspaceId): Promise<void> => {
    const previous = source.getSnapshot()[workspaceId]
    if (previous?.loading || previous?.saving || running.has(workspaceId) || aggregateWrites.has(workspaceId)) return
    set(workspaceId, { records: previous?.records, loading: true, saving: false, edits: previous?.edits })
    try {
      const result = await remote.read({ workspaceId })
      if (!result.ok) {
        set(workspaceId, { records: previous?.records, loading: false, saving: false, edits: previous?.edits, error: 'read' })
        return
      }
      set(workspaceId, { records: result.value, loading: false, saving: false, edits: previous?.edits })
    } catch (_readFailure) {
      set(workspaceId, { records: previous?.records, loading: false, saving: false, edits: previous?.edits, error: 'read' })
    }
  }
  return {
    hooks: { securityRecords: source }, loadSecurityRecords, flushSecurityTasks,
    editSecurityTask(workspaceId, taskId, patch) {
      const entry = source.getSnapshot()[workspaceId]
      if (!entry?.records || entry.loading || entry.error) return
      const existing = entry.edits?.[taskId]
      const task = entry.records.tasks.find(item => item.id === taskId)
      if (!task) return
      const merged = { ...existing?.patch, ...patch }
      const invalid = !(merged.name ?? task.name).trim()
      set(workspaceId, { ...entry, saving: !invalid, edits: { ...entry.edits,
        [taskId]: { patch: merged, sequence: (existing?.sequence ?? 0) + 1, state: invalid ? 'invalid' : 'pending' },
      } })
      clearTimeout(timers.get(workspaceId))
      if (!invalid) timers.set(workspaceId, setTimeout(() => { void flushSecurityTasks(workspaceId) }, 500))
    },
    async saveSecurityRecords(workspaceId, content) {
      const entry = source.getSnapshot()[workspaceId]
      if (!entry?.records || entry.loading || entry.saving || entry.error
        || running.has(workspaceId) || aggregateWrites.has(workspaceId) || Object.keys(entry.edits ?? {}).length > 0) return false
      let release: () => void = () => undefined
      aggregateWrites.set(workspaceId, new Promise<void>((resolve) => { release = resolve }))
      set(workspaceId, { ...entry, saving: true })
      try {
        const result = await remote.save({
          workspaceId, expectedRevision: entry.records.revision,
          companies: content.companies, assets: content.assets, tasks: content.tasks,
        })
        if (!result.ok) {
          set(workspaceId, { ...(source.getSnapshot()[workspaceId] ?? entry), saving: false, error: 'write' })
          return false
        }
        set(workspaceId, { records: result.value, loading: false, saving: false, edits: source.getSnapshot()[workspaceId]?.edits })
        return true
      } catch (_writeOrRevisionFailure) {
        set(workspaceId, { ...(source.getSnapshot()[workspaceId] ?? entry), saving: false, error: 'write' })
        return false
      } finally {
        aggregateWrites.delete(workspaceId)
        release()
        const latest = source.getSnapshot()[workspaceId]
        if (!latest?.error && Object.keys(latest?.edits ?? {}).length > 0) void flushSecurityTasks(workspaceId)
      }
    },
  }
}
