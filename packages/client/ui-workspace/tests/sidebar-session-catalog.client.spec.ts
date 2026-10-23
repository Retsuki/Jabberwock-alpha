import { describe, expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import { SidebarSessionCatalog } from '../src/client/sidebar-session-catalog.ts'
import { deriveGroups } from '../src/client/tree.ts'

const summary = (id: string): SessionSummary => ({
  id: SessionId(id), displayTitle: 'Untitled', running: false, blank: false, updatedAt: 1, retainedBy: {},
})
const state = (...items: SessionSummary[]): SessionListState => ({
  ids: items.map(item => item.id), byId: Object.fromEntries(items.map(item => [item.id, item])),
  phase: 'ready', projectionsBySession: {},
})

describe('sidebar-only Session catalog', () => {
  it('hides internal rows without deleting their source and restores them when the feature unloads', () => {
    const source = createSnapshotStore(state(summary('ordinary'), summary('internal')))
    const catalog = new SidebarSessionCatalog(source)
    const remove = catalog.register(session => session.id !== 'internal')
    expect(catalog.list.getSnapshot().ids).toEqual(['ordinary'])
    expect(catalog.list.getSnapshot().byId[SessionId('internal')]).toBeUndefined()
    expect(source.getSnapshot().ids).toEqual(['ordinary', 'internal'])
    expect(catalog.isVisible({ id: SessionId('internal') })).toBe(false)
    remove()
    expect(catalog.list.getSnapshot()).toBe(source.getSnapshot())
    catalog.dispose()
  })

  it('filters arrivals and removes an empty Ungrouped while preserving ordinary unnamed conversations', () => {
    const source = createSnapshotStore(state(summary('internal')))
    const catalog = new SidebarSessionCatalog(source)
    catalog.register(session => session.id !== 'internal')
    expect(deriveGroups(catalog.list.getSnapshot(), [], {
      archivedSessionIds: [], pinnedSessionIds: [], archivedFilter: 'default',
    }, new Map(), { expandedGroups: [] })).toEqual([])
    source.set(state(summary('internal'), summary('ordinary')))
    expect(catalog.list.getSnapshot().ids).toEqual(['ordinary'])
    expect(source.getSnapshot().ids).toHaveLength(2)
    catalog.dispose()
    source.set(state(summary('later')))
    expect(catalog.list.getSnapshot().ids).toEqual(['ordinary'])
  })
})
