/** Task-scoped shared annotations with live references to the original evidence owners. */
import { Service, type Context } from '@deepseek-ai/cordis'
import { Remote, RemoteError, TypertRemoteService, principalOf } from '@deepseek-ai/dsh-typert-protocol'
import { defineDomain, domainTable, type KvTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import type { SecurityPlan } from './planning-types.ts'
import type { SecurityWorkerRun } from './worker-types.ts'
import type { ExplorationAnnotations, ExplorationReadOptions, ExplorationRequest, ExplorationWorkerCapability,
  ExplorationNode, ExplorationEdge, SecurityExplorationState } from './exploration-types.ts'
import type {} from './security-planning.ts'
import type {} from './security-workers.ts'
import type {} from './security-findings.ts'

const text = z.string().trim().min(1).max(10000)
const assessmentSchema = z.object({ goalId: text, assessment: z.enum(['supported', 'unverified', 'contradicted']),
  supportNodeIds: z.array(text).max(100) }).strict()
const annotationsSchema = z.object({
  goalAssessments: z.array(assessmentSchema).max(100).optional(),
  investigationLinks: z.array(z.object({ itemId: text, goalIds: z.array(text).max(100),
    sourceNodeIds: z.array(text).max(100) }).strict()).max(100).optional(),
  hints: z.array(z.object({ summary: text, sourceNodeIds: z.array(text).max(100) }).strict()).max(100).optional(),
}).strict()
const factSchema = z.object({ requestId: text, summary: text, observationIndexes: z.array(z.number().int().nonnegative()).min(1).max(100),
  quote: text, workerRunId: text, createdAt: z.number().int().nonnegative().optional() }).strict()
const storedSchema = z.object({ revision: z.number().int().nonnegative(), facts: z.array(factSchema),
  plans: z.array(z.object({ planId: text, recordRevision: z.number().int().nonnegative(), annotations: annotationsSchema }).strict()),
}).strict()
type Stored = z.infer<typeof storedSchema>
const spec = defineDomain({ name: 'jabberwock_security_exploration', version: 1,
  tables: { tasks: domainTable<string, Stored>(storedSchema) } })
const keyOf = (request: ExplorationRequest) => JSON.stringify([request.workspaceId, request.taskId])
const resource = (request: ExplorationRequest) => request.workspaceId
const empty = (): Stored => ({ revision: 0, facts: [], plans: [] })
const sameTask = (a: ExplorationRequest, b: ExplorationRequest) => a.workspaceId === b.workspaceId && a.taskId === b.taskId
type AnnotatedPlan = SecurityPlan & { explorationAnnotations?: ExplorationAnnotations | undefined }
declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Shared evidence-linked knowledge, separate from execution and triage. */
    securityExploration: SecurityExplorationService
  }
}

/** Host-bound capabilities cannot choose another task, role or evidence owner. */
export class SecurityExplorationService extends TypertRemoteService {
  static inject = ['securityRecords', 'storageDomain', 'workspaceRegistry']
  private table?: KvTable<string, Stored>
  private writing = new Map<string, Promise<void>>()
  private stopping = false
  /** @param ctx Original source owners and domain storage. */
  constructor(ctx: Context, private readonly config: { explorationModelBytes?: number } = {}) { super(ctx, 'securityExploration') }
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(spec)
    this.table = domain.table('tasks')
    this.ctx.effect(() => async () => {
      this.stopping = true
      await Promise.allSettled(this.writing.values())
      await domain.close()
    }, 'securityExploration.lifecycle')
  }

  /** Read committed knowledge without starting inference or target access.
   * @param request Owner task identity.
   * @returns Live source projections and committed annotations.
   */
  @Remote({ resources: { workspace: resource } })
  async read(request: ExplorationRequest): Promise<SecurityExplorationState> {
    if (principalOf(this.ctx.invocation) !== undefined) {
      throw new RemoteError('security/rejected', 'Shared exploration requires the Workspace owner', { workspaceId: request.workspaceId })
    }
    return this.project(request)
  }

  /** Read bounded shared knowledge for an admitted Planner or Worker.
   * @param request Admitted task identity.
   * @param options Optional original node identities for a narrower read.
   * @returns Immutable current shared input within the model byte budget.
   */
  async forPlanner(request: ExplorationRequest, options?: ExplorationReadOptions): Promise<SecurityExplorationState> {
    return this.bounded(await this.project(request), options)
  }

  /** Bind exploration reads and evidence-linked publication to one admitted Worker.
   * @param run Admitted original Worker.
   * @returns Task/run-bound private capability.
   */
  bindWorker(run: SecurityWorkerRun): ExplorationWorkerCapability {
    const request = { workspaceId: run.workspaceId, taskId: run.taskId }
    this.records(request)
    const workerRunId = run.id
    return {
      read: options => this.forPlanner(request, options),
      publishFact: input => this.mutate(request, (stored) => {
        const parsed = factSchema.parse({ ...input, workerRunId })
        const existing = stored.facts.find(fact => fact.workerRunId === workerRunId && fact.requestId === parsed.requestId)
        if (existing) {
          if (JSON.stringify({ ...existing, createdAt: undefined }) !== JSON.stringify(parsed)) {
            throw new Error('Fact retry identity changed its content')
          }
          return stored
        }
        const worker = this.workers(request).find(value => value.id === workerRunId)
        if (!worker || !sameTask(worker, run)) throw new Error('Fact source Worker is unavailable')
        const evidence = worker.observations ?? (worker.evidence ? [worker.evidence] : [])
        if (new Set(parsed.observationIndexes).size !== parsed.observationIndexes.length
          || parsed.observationIndexes.some(index => !evidence[index])
          || !parsed.observationIndexes.some(index => evidence[index]?.body.includes(parsed.quote))) {
          throw new Error('Fact quote must occur in its retained Worker observations')
        }
        return { ...stored, revision: stored.revision + 1, facts: [...stored.facts, { ...parsed, createdAt: Date.now() }] }
      }).then(state => this.bounded(state)),
    }
  }

  /** Apply only an authoritative ready plan; retries never append duplicate annotations.
   * @param proposed Validated ready output from the original planning owner.
   * @returns Updated shared projection.
   */
  applyPlan(proposed: AnnotatedPlan): Promise<SecurityExplorationState> {
    return this.mutate(proposed, async (stored) => {
      const plan = this.ctx.get('securityPlanning')?.read(proposed).plans.find(value => value.id === proposed.id)
      if (!plan || plan.status !== 'ready' || !sameTask(plan, proposed)) throw new Error('Exploration requires an authoritative ready plan')
      const original = annotationsSchema.parse(plan.explorationAnnotations ?? {})
      if (JSON.stringify(original) !== JSON.stringify(annotationsSchema.parse(proposed.explorationAnnotations ?? {}))) {
        throw new Error('Exploration annotations differ from saved planning output')
      }
      const existing = stored.plans.find(value => value.planId === plan.id)
      if (existing) return stored
      const { records, task } = this.records(plan)
      if (original.goalAssessments?.length && records.revision !== plan.snapshot.recordRevision) {
        throw new Error('Goal assessment uses stale task settings')
      }
      const state = await this.project(plan, stored)
      if (original.goalAssessments?.length && this.records(plan).records.revision !== plan.snapshot.recordRevision) {
        throw new Error('Goal assessment uses stale task settings')
      }
      const nodes = new Map(state.nodes.map(node => [node.id, node]))
      const goalAliases = new Map(state.nodes.filter(node => node.kind === 'goal').map(node => [node.id, node.id]))
      for (const goal of task.goals ?? []) goalAliases.set(goal.id, `goal:${goal.id}`)
      const canonicalGoal = (id: string) => {
        const canonical = goalAliases.get(id)
        if (!canonical || nodes.get(canonical)?.kind !== 'goal') throw new Error('Annotation references an unknown task goal')
        return canonical
      }
      const annotations = { ...original,
        goalAssessments: original.goalAssessments?.map(value => ({ ...value, goalId: canonicalGoal(value.goalId) })),
        investigationLinks: original.investigationLinks?.map(value => ({ ...value, goalIds: value.goalIds.map(canonicalGoal) })),
      }
      const requireSources = (ids: string[], evidenceOnly = false) => {
        if (new Set(ids).size !== ids.length || ids.some((id) => {
          const node = nodes.get(id)
          return !node || node.state === 'unknown' || (evidenceOnly && !['observation', 'fact', 'finding'].includes(node.kind))
        })) throw new Error('Annotation references unavailable or unsupported task knowledge')
      }
      for (const value of annotations.goalAssessments ?? []) {
        if (nodes.get(value.goalId)?.kind !== 'goal') throw new Error('Goal assessment references an unknown task goal')
        requireSources(value.supportNodeIds, true)
        if (value.assessment !== 'unverified' && value.supportNodeIds.length === 0) throw new Error('Goal claim requires supporting evidence')
      }
      for (const value of annotations.investigationLinks ?? []) {
        if (!plan.items.some(item => item.id === value.itemId)) throw new Error('Investigation link references another plan')
        if (value.goalIds.some(id => nodes.get(id)?.kind !== 'goal')) throw new Error('Investigation references an unknown goal')
        requireSources(value.sourceNodeIds)
      }
      for (const value of annotations.hints ?? []) requireSources(value.sourceNodeIds)
      return { ...stored, revision: stored.revision + 1,
        plans: [...stored.plans, { planId: plan.id, recordRevision: plan.snapshot.recordRevision, annotations }] }
    })
  }

  private records(request: ExplorationRequest) {
    const records = this.ctx.securityRecords.read({ workspaceId: request.workspaceId })
    const task = records.tasks.find(value => value.id === request.taskId && !value.archived)
    if (!task) throw new Error('Shared exploration task is missing or archived')
    return { records, task }
  }
  private workers(request: ExplorationRequest): SecurityWorkerRun[] {
    return (this.ctx.get('securityWorkers')?.read(request).runs ?? []).filter(run => sameTask(run, request))
  }
  private async project(request: ExplorationRequest,
    stored = this.table?.get(keyOf(request)) ?? empty()): Promise<SecurityExplorationState> {
    const { records, task } = this.records(request)
    const nodes: ExplorationNode[] = []
    const edges: ExplorationEdge[] = []
    if (task.objective.trim()) nodes.push({ id: 'goal:objective', kind: 'goal', summary: task.objective,
      state: 'open', assessment: 'unverified', assetIds: task.assetIds })
    for (const goal of task.goals ?? []) nodes.push({ id: `goal:${goal.id}`, kind: 'goal', summary: goal.text,
      state: 'open', assessment: 'unverified', assetIds: task.assetIds })
    const plans = this.ctx.get('securityPlanning')?.read(request).plans.filter(plan => sameTask(plan, request)) ?? []
    const workers = this.workers(request)
    for (const plan of plans) for (const item of plan.items) {
      const worker = workers.find(run => run.planId === plan.id && run.itemId === item.id)
      nodes.push({ id: `investigation:${plan.id}:${item.id}`, kind: 'investigation', summary: item.title,
        state: worker?.status ?? 'pending', assetIds: item.targetAssetIds, source: { planId: plan.id, itemId: item.id } })
    }
    for (const worker of workers) {
      const observations = worker.observations ?? (worker.evidence ? [worker.evidence] : [])
      observations.forEach((observation, index) => {
        const id = `observation:${worker.id}:${index}`
        nodes.push({ id, kind: 'observation', summary: `${observation.method ?? 'GET'} ${observation.url} (${observation.status})`,
          state: 'recorded', assetIds: [worker.assetId], source: { workerRunId: worker.id, observationIndex: index } })
        edges.push({ from: `investigation:${worker.planId}:${worker.itemId}`, to: id, relation: 'produces' })
      })
    }
    const findings = await this.ctx.get('securityFindings')?.read(request)
    for (const finding of findings?.findings ?? []) {
      if (!sameTask(finding, request)) continue
      nodes.push({ id: `finding:${finding.id}`, kind: 'finding', summary: finding.title, state: finding.status,
        assetIds: [finding.assetId], source: { workerRunId: finding.workerRunId, findingId: finding.id } })
    }
    for (const fact of stored.facts) {
      const worker = workers.find(run => run.id === fact.workerRunId)
      const observations = worker?.observations ?? (worker?.evidence ? [worker.evidence] : [])
      const available = fact.observationIndexes.every(index => observations[index])
      const id = `fact:${fact.workerRunId}:${fact.requestId}`
      nodes.push({ id, kind: 'fact', summary: fact.summary, state: available ? 'observed' : 'unknown',
        at: fact.createdAt, detail: fact.quote,
        assetIds: worker ? [worker.assetId] : [], source: { workerRunId: fact.workerRunId } })
      for (const index of fact.observationIndexes) {
        edges.push({ from: `observation:${fact.workerRunId}:${index}`, to: id, relation: 'supports' })
      }
    }
    const ordered = [...stored.plans].sort((a, b) => {
      const left = plans.find(plan => plan.id === a.planId)
      const right = plans.find(plan => plan.id === b.planId)
      return (left?.createdAt ?? 0) - (right?.createdAt ?? 0) || a.planId.localeCompare(b.planId)
    })
    for (const saved of ordered) {
      const available = plans.some(plan => plan.id === saved.planId)
      for (const value of saved.annotations.goalAssessments ?? []) {
        const goal = nodes.find(node => node.id === value.goalId && node.kind === 'goal')
        if (goal && saved.recordRevision === records.revision && available
          && value.supportNodeIds.every(id => nodes.some(node => node.id === id && node.state !== 'unknown'))) goal.assessment = value.assessment
        for (const id of value.supportNodeIds) edges.push({ from: id, to: value.goalId,
          relation: value.assessment === 'contradicted' ? 'contradicts' : 'supports' })
      }
      for (const value of saved.annotations.investigationLinks ?? []) {
        const to = `investigation:${saved.planId}:${value.itemId}`
        for (const from of [...value.goalIds, ...value.sourceNodeIds]) edges.push({ from, to, relation: 'derived-from' })
      }
      for (const [index, hint] of (saved.annotations.hints ?? []).entries()) {
        const id = `hint:${saved.planId}:${index}`
        nodes.push({ id, kind: 'hint', summary: hint.summary, state: available ? 'unverified' : 'unknown', assetIds: [], source: { planId: saved.planId } })
        for (const from of hint.sourceNodeIds) edges.push({ from, to: id, relation: 'derived-from' })
      }
    }
    for (const edge of [...edges]) for (const id of [edge.from, edge.to]) {
      if (!nodes.some(node => node.id === id)) nodes.push({ id, kind: 'hint', summary: 'Source unavailable', state: 'unknown', assetIds: [] })
    }
    return structuredClone({ revision: stored.revision, nodes,
      edges: [...new Map(edges.map(edge => [JSON.stringify(edge), edge])).values()] })
  }
  private bounded(state: SecurityExplorationState, options?: ExplorationReadOptions): SecurityExplorationState {
    const limit = this.config.explorationModelBytes ?? 65536
    const ids = options?.nodeIds
    if (ids && (ids.length > 100 || ids.some(id => !state.nodes.some(node => node.id === id)))) {
      throw new Error('Request up to 100 node IDs returned by the exploration overview')
    }
    const rank = { goal: 0, fact: 1, finding: 2, hint: 3, investigation: 4, observation: 5 }
    const candidates = ids ? state.nodes.filter(node => ids.includes(node.id)) : [...state.nodes].sort((a, b) =>
      rank[a.kind] - rank[b.kind] || (b.at ?? 0) - (a.at ?? 0) || b.id.localeCompare(a.id))
    const result: SecurityExplorationState = { revision: state.revision, nodes: [], edges: [], truncated: true,
      omittedNodes: state.nodes.length, omittedEdges: state.edges.length }
    const fits = () => Buffer.byteLength(JSON.stringify(result), 'utf8') <= limit
    for (const candidate of candidates) {
      result.nodes.push(candidate)
      result.omittedNodes = state.nodes.length - result.nodes.length
      if (!fits()) {
        result.nodes.pop()
        if (ids) {
          const shortened = { ...candidate, summary: candidate.summary.slice(0, 100), detail: candidate.detail?.slice(0, 100) }
          result.nodes.push(shortened)
          if (!fits()) throw new Error('Exploration node metadata exceeds the model budget; request fewer node IDs')
        }
      }
    }
    const retained = new Set(result.nodes.map(node => node.id))
    for (const edge of state.edges) {
      if (!retained.has(edge.from) || !retained.has(edge.to)) continue
      result.edges.push(edge)
      if (!fits()) result.edges.pop()
    }
    result.omittedNodes = state.nodes.length - result.nodes.length
    result.omittedEdges = state.edges.length - result.edges.length
    result.truncated = result.omittedNodes > 0 || result.omittedEdges > 0
      || result.nodes.some(node => candidates.find(candidate => candidate.id === node.id)?.summary !== node.summary
        || candidates.find(candidate => candidate.id === node.id)?.detail !== node.detail)
    if (!fits()) throw new Error('Exploration model budget is too small; increase explorationModelBytes')
    return result
  }
  private async mutate(request: ExplorationRequest,
    update: (stored: Stored) => Stored | Promise<Stored>): Promise<SecurityExplorationState> {
    if (this.stopping || !this.table) throw new Error('Shared exploration storage is unavailable')
    const key = keyOf(request)
    const pending = this.writing.get(key) ?? Promise.resolve()
    const operation = pending.catch((_failedPreviousWrite: unknown) => {
      /* A failed write must not block a separately validated retry. */
    }).then(async () => {
      this.records(request)
      const current = this.table?.get(key) ?? empty()
      const next = await update(current)
      if (next !== current) await this.table?.put(key, next)
    })
    this.writing.set(key, operation)
    try { await operation } finally { if (this.writing.get(key) === operation) this.writing.delete(key) }
    return this.project(request)
  }
}
