/** Task setup projection; automatic task updates stay in the Host. */
import { createSnapshotStore, type ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { SecurityConversationRequest } from '../conversation-types.ts'
import type { SecuritySetupState, SecuritySetupProposal } from '../setup-types.ts'
/** Request status retains the last confirmed setup projection. */
export interface SetupEntry {
  state?: SecuritySetupState | undefined
  busy: boolean
  error?: 'read' | 'begin' | 'save' | undefined
}
/** Shared setup commands and task-addressed observable. */
export interface SetupFace {
  hooks: { securitySetup: ObservableSnapshot<Record<string, SetupEntry>> }
  watchSecuritySetup(target: SecurityConversationRequest, signal: AbortSignal): void
  refreshSecuritySetup(target: SecurityConversationRequest): Promise<void>
  beginSecuritySetup(target: SecurityConversationRequest): Promise<void>
  retrySecuritySetupSave(target: SecurityConversationRequest, proposal: SecuritySetupProposal): Promise<void>
}
/** Create the shared setup projection and lifecycle-owned read loop.
 * @param remote - setup service methods.
 * @param flush - save manual edits before a model request or save retry.
 * @param reload - reload records after automatic saves or explicit save retries.
 * @param locale - current selected language.
 * @returns injected setup actions and cleanup.
 */
export function createSetupState(
  remote: Pick<ClientRemote['securitySetup'], 'read' | 'begin' | 'confirm'>,
  flush: (workspaceId: SecurityConversationRequest['workspaceId']) => Promise<boolean>,
  reload: (workspaceId: SecurityConversationRequest['workspaceId'], revision: number) => Promise<boolean>,
  locale: () => 'ja' | 'en' | 'zh',
): SetupFace & { dispose(): void } {
  const source = createSnapshotStore<Record<string, SetupEntry>>({})
  const watches = new Map<string, { count: number; timer?: ReturnType<typeof setTimeout> | undefined }>()
  const releases = new Set<() => void>()
  const requests = new Map<string, string>()
  const reads = new Set<string>()
  const versions = new Map<string, number>()
  const loadedRevisions = new Map<string, number>()
  let disposed = false
  const isActive = (): boolean => !disposed
  const keyOf = (target: SecurityConversationRequest): string => JSON.stringify([target.workspaceId, target.taskId])
  const entry = (key: string): SetupEntry => source.getSnapshot()[key] ?? { busy: false }
  const set = (key: string, value: SetupEntry): void => { if (isActive()) source.set({ ...source.getSnapshot(), [key]: value }) }
  const refreshSecuritySetup = async (target: SecurityConversationRequest, quiet = false): Promise<void> => {
    const key = keyOf(target)
    if (!isActive() || entry(key).busy || reads.has(key)) return
    const version = versions.get(key) ?? 0
    reads.add(key)
    try {
      const result = await remote.read(target)
      if (versions.get(key) !== undefined && versions.get(key) !== version) return
      if (!result.ok) throw new Error(result.error.message)
      set(key, { state: result.value, busy: false, error: quiet ? entry(key).error : undefined })
      if (loadedRevisions.get(key) !== result.value.recordRevision) {
        if (await reload(target.workspaceId, result.value.recordRevision)) loadedRevisions.set(key, result.value.recordRevision)
      }
    } catch (_readFailure) {
      if ((versions.get(key) ?? 0) === version) set(key, { ...entry(key), error: 'read' })
    } finally { reads.delete(key) }
  }
  const mutate = async (target: SecurityConversationRequest, proposal?: SecuritySetupProposal): Promise<void> => {
    const key = keyOf(target)
    if (!isActive() || entry(key).busy) return
    versions.set(key, (versions.get(key) ?? 0) + 1)
    set(key, { ...entry(key), busy: true, error: undefined })
    const requestKey = `${key}:${proposal?.id ?? 'begin'}`
    const requestId = requests.get(requestKey) ?? randomUUID()
    requests.set(requestKey, requestId)
    try {
      if (!await flush(target.workspaceId)) throw new Error('Task edits are not saved')
      if (!isActive()) return
      const result = proposal
        ? await remote.confirm({ ...target, proposalId: proposal.id, expectedRevision: proposal.baseRevision, requestId })
        : await remote.begin({ ...target, requestId, locale: locale() })
      if (!result.ok) throw new Error(result.error.message)
      set(key, { state: result.value, busy: false })
      requests.delete(requestKey)
      if (proposal) await reload(target.workspaceId, result.value.recordRevision)
    } catch (_mutationFailure) { set(key, { ...entry(key), busy: false, error: proposal ? 'save' : 'begin' }) }
  }
  return {
    hooks: { securitySetup: source }, refreshSecuritySetup,
    beginSecuritySetup: target => mutate(target),
    retrySecuritySetupSave: (target, proposal) => mutate(target, proposal),
    watchSecuritySetup(target, signal) {
      if (!isActive() || signal.aborted) return
      const key = keyOf(target)
      const existing = watches.get(key)
      const watch = existing ?? { count: 0, timer: undefined }
      watch.count++
      watches.set(key, watch)
      const poll = async (): Promise<void> => {
        if (!isActive() || watches.get(key) !== watch) return
        await refreshSecuritySetup(target, true)
        if (isActive() && watches.get(key) === watch) watch.timer = setTimeout(() => { void poll() }, 1500)
      }
      const release = (): void => {
        if (!releases.delete(release)) return
        signal.removeEventListener('abort', release)
        if (--watch.count === 0) { clearTimeout(watch.timer); watches.delete(key) }
      }
      releases.add(release)
      signal.addEventListener('abort', release, { once: true })
      if (!existing) void poll()
    },
    dispose() { disposed = true; for (const release of [...releases]) release() },
  }
}
