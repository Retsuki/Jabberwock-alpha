/** Browser-only project drafts. The prototype's storage is never read or modified. */
import { createSnapshotStore, type ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import { z } from 'zod'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { Project, ProjectData, Target } from './model/types.ts'
import { initialAgents, initialProjects, initialTargets, initialTickets } from './model/mock-data.ts'
import { initializeDiagnostics, emptyDiagnostic } from './model/diagnostics/seed.ts'
import { parseTargets } from './model/parse-targets.ts'

const KEY = 'jabberwock.security.v1'
const target = z.object({
  id: z.string(), value: z.string(), kind: z.enum(['url', 'domain', 'ip', 'cidr']), status: z.enum(['untested', 'testing', 'tested']), registeredAt: z.string(),
})
const diagnostic = z.object({
  id: z.string(), name: z.string(), objective: z.string(), createdAt: z.string(), targetIds: z.array(z.string()),
})
const schema = z.object({
  version: z.literal(1),
  projects: z.array(z.object({ id: z.string(), name: z.string() })),
  targets: z.record(z.string(), z.array(target)),
  diagnostics: z.record(z.string(), z.array(diagnostic)),
})
type Saved = z.infer<typeof schema>
/** One workspace render snapshot, with explicit persistence failure state. */
export interface SecurityState {
  projects: Project[]
  data: Record<string, ProjectData>
  storageError: 'read' | 'write' | undefined
}
/** Narrow injected data source and user actions for the workspace. */
export interface SecurityFace {
  hooks: { security: ObservableSnapshot<SecurityState> }
  ensureWorkspace(workspaceId: string, title: string): string
  registerTargets(projectId: string, text: string): { invalid: string[]; duplicates: string[] }
  removeTarget(projectId: string, id: string): void
  createDiagnostic(projectId: string, name: string, objective: string): string | undefined
}

function materialize(saved: Saved, storageError: SecurityState['storageError']): SecurityState {
  const data: Record<string, ProjectData> = {}
  for (const project of saved.projects) {
    const demo = project.id === 'acme'
    const base = initializeDiagnostics(project.id, {
      targets: demo ? initialTargets : [], tickets: demo ? initialTickets : [],
      agents: demo ? initialAgents : [], messages: [],
    }, demo)
    const targets = saved.targets[project.id] ?? base.targets
    const drafts = (saved.diagnostics[project.id] ?? []).map(draft => ({
      ...emptyDiagnostic(project.id, draft.id, draft.name, '', draft.objective, draft.targetIds),
      createdAt: draft.createdAt, sessions: [],
    }))
    data[project.id] = { ...base, targets, diagnostics: [...(base.diagnostics ?? []), ...drafts] }
  }
  return { projects: saved.projects, data, storageError }
}

/**
 * Load validated drafts once per plugin activation and expose reversible subscriptions.
 * Unreadable storage disables mutations so a damaged or future record is not overwritten.
 * @returns injected observable and draft actions; no diagnostic work is executed.
 */
export function createSecurityState(): SecurityFace {
  let saved: Saved = { version: 1, projects: initialProjects, targets: {}, diagnostics: {} }
  let readFailed = false
  try {
    const raw = localStorage.getItem(KEY)
    if (raw !== null) saved = schema.parse(JSON.parse(raw))
  } catch (_unreadableSecurityDrafts) {
    readFailed = true
  }
  const source = createSnapshotStore(materialize(saved, readFailed ? 'read' : undefined))
  const publish = (next: Saved): void => {
    if (readFailed) return
    saved = next
    let storageError: SecurityState['storageError']
    try {
      localStorage.setItem(KEY, JSON.stringify(saved))
    } catch (_unwritableSecurityDrafts) {
      storageError = 'write'
    }
    source.set(materialize(saved, storageError))
  }
  return {
    hooks: { security: source },
    ensureWorkspace(workspaceId, title) {
      const id = `workspace:${workspaceId}`
      if (!saved.projects.some(project => project.id === id) && !readFailed) {
        publish({ ...saved, projects: [...saved.projects, { id, name: title }] })
      }
      return id
    },
    registerTargets(projectId, text) {
      const current = source.getSnapshot().data[projectId]
      if (!current || readFailed) return { invalid: [], duplicates: [] }
      const parsed = parseTargets(text, current.targets)
      const now = new Date().toISOString()
      const added: Target[] = parsed.valid.map(item => ({ ...item, id: randomUUID(), status: 'untested', registeredAt: now }))
      if (added.length) publish({ ...saved, targets: { ...saved.targets, [projectId]: [...current.targets, ...added] } })
      return { invalid: parsed.invalid, duplicates: parsed.duplicates }
    },
    removeTarget(projectId, id) {
      const current = source.getSnapshot().data[projectId]
      if (current) publish({ ...saved, targets: { ...saved.targets, [projectId]: current.targets.filter(item => item.id !== id) } })
    },
    createDiagnostic(projectId, name, objective) {
      const current = source.getSnapshot().data[projectId]
      if (!current || !name.trim() || readFailed) return
      const id = randomUUID()
      const draft = {
        id, name: name.trim(), objective: objective.trim(), createdAt: new Date().toISOString(),
        targetIds: current.targets.map(item => item.id),
      }
      publish({ ...saved, diagnostics: { ...saved.diagnostics, [projectId]: [...(saved.diagnostics[projectId] ?? []), draft] } })
      return id
    },
  }
}
