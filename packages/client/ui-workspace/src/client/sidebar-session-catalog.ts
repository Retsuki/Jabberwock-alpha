/** Browser-only catalog filters preserve the authoritative Session history. */
import { createSnapshotStore, type ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'

/** Reversible feature-owned visibility rules for workspace navigation. */
export class SidebarSessionCatalog {
  private readonly filters = new Set<(session: Pick<SessionSummary, 'id'>) => boolean>()
  private readonly store
  private readonly unsubscribe: () => void
  readonly list: ObservableSnapshot<SessionListState>

  /** @param source Authoritative catalog; filtering never changes its ownership or records. */
  constructor(private readonly source: ObservableSnapshot<SessionListState>) {
    this.store = createSnapshotStore(source.getSnapshot())
    this.list = this.store
    this.unsubscribe = source.subscribe(() => { this.publish() })
  }

  /** Register a pure visibility predicate for sidebar rows and search.
   * @param filter Return false for feature-owned internal conversations.
   * @returns Removal that restores visibility without modifying history.
   */
  register(filter: (session: Pick<SessionSummary, 'id'>) => boolean): () => void {
    this.filters.add(filter)
    this.publish()
    return () => { this.filters.delete(filter); this.publish() }
  }

  /** Test a catalog or search identity without acquiring its Session.
   * @param session Exact identity; titles never determine internal ownership.
   * @returns Whether every registered rule permits this navigation row.
   */
  isVisible(session: Pick<SessionSummary, 'id'>): boolean {
    return [...this.filters].every(filter => filter(session))
  }

  /** Release the source subscription when the workspace UI unloads. */
  dispose(): void { this.unsubscribe(); this.filters.clear() }

  private publish(): void {
    const source = this.source.getSnapshot()
    if (!this.filters.size) { this.store.set(source); return }
    const byId: SessionListState['byId'] = {}
    for (const session of Object.values(source.byId)) {
      if (this.isVisible(session)) byId[session.id] = session
    }
    this.store.set({ ...source, byId, ids: source.ids.filter(id => byId[id] !== undefined) })
  }
}
