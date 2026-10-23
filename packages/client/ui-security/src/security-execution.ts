/** Durable coordination of approved anonymous GET investigations and Planner review. */
import { Service, type Context } from '@deepseek-ai/cordis'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { Remote, RemoteError, TypertRemoteService, principalOf } from '@deepseek-ai/dsh-typert-protocol'
import { defineDomain, domainTable, type KvTable } from '@deepseek-ai/dsh-storage-domain'
import { assetSchema, taskSchema } from './security-records.ts'
import { modelDecisionSchema, resolveTaskAgentMode, resolveTaskModelDecision } from './security-conversations.ts'
import { planItemKey } from './planning-coverage.ts'
import { buildSecurityReport, classifySecurityWorker } from './report-model.ts'
import { compileWorkerPolicy } from './worker-policy.ts'
import type { SecurityConversationRequest } from './conversation-types.ts'
import type { SecurityExecutionDispatch, SecurityExecutionReview, SecurityExecutionLimits, SecurityExecutionRun, SecurityExecutionStartRequest, SecurityExecutionState } from './execution-types.ts'
import type { SecurityPlan } from './planning-types.ts'
import type {} from './security-workers.ts'
const text = z.string().min(1)
const limitsSchema = z.object({
  maxRounds: z.number().int().positive(), maxRequests: z.number().int().positive(), timeoutMs: z.number().int().positive(),
  maxConcurrentWorkers: z.number().int().positive().optional(),
}).strict()
const targetSchema = z.object({ assetId: text, url: text }).strict()
const runSchema: z.ZodType<SecurityExecutionRun> = z.object({
  workspaceId: text.transform(value => value as SecurityExecutionRun['workspaceId']), taskId: text, id: text, requestId: text,
  resumedFromRunId: text.optional(),
  dispatches: z.array(z.object({
    requestId: text, planId: text, itemId: text, assetId: text, url: text, maxRequests: z.number().int().positive(),
    workerRunId: text.optional(), settled: z.boolean().optional(),
  }).strict()).optional(),
  reviews: z.array(z.object({ requestId: text, previousPlanId: text, workerRunIds: z.array(text),
    planId: text.optional(), applied: z.boolean().optional(),
  }).strict()).optional(),
  status: z.enum(['running', 'completed', 'needs-input', 'failed', 'cancelled', 'interrupted']), createdAt: z.number(), updatedAt: z.number(), round: z.number().int().nonnegative(), planIds: z.array(text), workerRunIds: z.array(text),
  events: z.array(z.object({ at: z.number(), kind: z.enum(['started', 'worker', 'review', 'decision', 'stopped']), message: z.string(), planId: text.optional(), workerRunId: text.optional() }).strict()), error: z.string().optional(), summary: z.string().optional(),
  snapshot: z.object({
    modelDecision: modelDecisionSchema.optional(), recordRevision: z.number().int().nonnegative(),
    task: taskSchema, assets: z.array(assetSchema),
    targets: z.array(targetSchema),
    targetMode: z.literal('asset-scope').optional(), limits: limitsSchema,
  }).strict(),
}).strict()
const startSchema = z.object({
  workspaceId: text, taskId: text, requestId: text.max(200), expectedRevision: z.number().int().nonnegative(),
  resumeRunId: text.optional(), planId: text.optional(), modelDecision: modelDecisionSchema.optional(),
  targets: z.array(targetSchema).min(1).max(30).optional(),
}).strict()
const spec = defineDomain({ name: 'jabberwock_security_execution', version: 1, tables: { runs: domainTable<string, SecurityExecutionRun>(runSchema) } })
const keyOf = (request: SecurityConversationRequest): string => JSON.stringify([request.workspaceId, request.taskId])
const workspaceResource = (request: SecurityConversationRequest) => request.workspaceId
interface Active {
  run: SecurityExecutionRun
  abort: AbortController
  operation?: Promise<void>
  reason?: string
  childWorkers: Set<string>
  inflight: Map<string, { key: string; grant: SecurityExecutionDispatch; result?: PromiseSettledResult<void> }>
  childPlan?: string
}
/** Compare operational settings independently of future model choices.
 * @param task Saved task.
 * @returns Stable operational settings for change detection.
 */
export function executionSettings(task: SecurityExecutionRun['snapshot']['task']): string {
  const { agentModels: _models, agentModelModes: _modes, updatedAt: _updated, ...settings } = task
  return JSON.stringify(settings)
}
declare module '@deepseek-ai/cordis' { interface Context { /** Task-owned bounded investigation coordination. */ securityExecution: SecurityExecutionService } }
/** Persist dispatch before execution, bound repetition, and never replay after restart. */
export class SecurityExecutionService extends TypertRemoteService {
  static inject = ['securityRecords', 'securityPlanning', 'securityWorkers', 'securitySetup', 'securityConversations', 'storageDomain', 'workspaceRegistry']
  private table?: KvTable<string, SecurityExecutionRun>
  private readonly active = new Map<string, Active>()
  private readonly admitting = new Map<string, Promise<SecurityExecutionState>>()
  private readonly unavailable = new Map<string, string>()
  private stopping = false
  /** @param ctx Existing task, Planner and Worker services.
   * @param config Finite coordinator limits.
   */
  constructor(ctx: Context, private readonly config: { executionMaxRounds: number; executionMaxRequests: number; executionTimeoutMs: number; executionPollMs: number; executionMaxConcurrentWorkers?: number }) { super(ctx, 'securityExecution') }
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(spec)
    this.table = domain.table('runs')
    this.ctx.effect(() => async () => {
      this.stopping = true
      for (const active of this.active.values()) { active.reason = 'Host stopped; execution was not resumed.'; active.abort.abort() }
      await Promise.allSettled([...this.admitting.values()])
      await Promise.allSettled([...this.active.values()].flatMap(active => active.operation ? [active.operation] : []))
      await domain.close()
    }, 'securityExecution.lifecycle')
    for (const [id, run] of this.table.entries()) {
      if (id !== run.id || run.taskId !== run.snapshot.task.id) throw new Error('Invalid execution storage identity')
      if (run.status === 'running') await this.table.put(id, { ...run, status: 'interrupted', updatedAt: Date.now(), error: 'Host restarted; investigation was not resumed.' })
    }
    this.ctx.on('security-records/changed', (records) => {
      for (const active of this.active.values()) {
        if (records.workspaceId !== active.run.workspaceId) continue
        const task = records.tasks.find(task => task.id === active.run.taskId && !task.archived)
        const assets = records.assets.filter(asset => task?.assetIds.includes(asset.id))
        if (!task || executionSettings(task) !== executionSettings(active.run.snapshot.task) || JSON.stringify(assets) !== JSON.stringify(active.run.snapshot.assets)) { active.reason = 'Task settings changed; review before restarting.'; active.abort.abort() }
      }
    })
  }
  /** Read persisted execution history without dispatching work.
   * @param request Owner task identity.
   * @returns Durable history without dispatching.
   */
  @Remote({ resources: { workspace: workspaceResource } })
  read(request: SecurityConversationRequest): SecurityExecutionState { this.authorize(request); return this.state(request) }
  /** Admit an investigation using the current saved task and plan.
   * @param request Current saved plan and optional legacy exact-target authorization.
   * @returns Durable admission state.
   */
  @Remote({ resources: { workspace: workspaceResource } })
  start(request: SecurityExecutionStartRequest): Promise<SecurityExecutionState> {
    this.authorize(request); startSchema.parse(request)
    if (this.stopping) throw new Error('Execution is stopping')
    const key = keyOf(request)
    const previous = this.admitting.get(key)
    if (previous) return previous.then(() => this.start(request))
    const operation = this.admit(request)
    this.admitting.set(key, operation)
    void operation.finally(() => { if (this.admitting.get(key) === operation) this.admitting.delete(key) }).catch(() => {})
    return operation
  }
  /** Cancel the active investigation and await its child operations.
   * @param request Owner task identity.
   * @returns History after active children settle.
   */
  @Remote({ resources: { workspace: workspaceResource } })
  async cancel(request: SecurityConversationRequest): Promise<SecurityExecutionState> {
    this.authorize(request)
    await this.admitting.get(keyOf(request))
    const active = this.active.get(keyOf(request))
    if (active) { active.abort.abort(); await active.operation }
    return this.state(request)
  }
  private async admit(request: SecurityExecutionStartRequest): Promise<SecurityExecutionState> {
    if (this.state(request).runs.some(run => run.requestId === request.requestId)) return this.state(request)
    if (this.active.has(keyOf(request))) throw new Error('This task already has an active execution')
    if (this.ctx.securityWorkers.read(request).runs.some(run => run.status === 'running') || this.ctx.securityPlanning.read(request).plans.some(plan => plan.status === 'planning')) throw new Error('Wait for the active Planner or Worker before starting execution')
    if (!Object.values((await this.ctx.securitySetup.read(request)).checklist).every(Boolean)) throw new Error('Complete task setup before execution')
    const { records, task } = this.authorize(request)
    if (records.revision !== request.expectedRevision) throw new Error('Task settings changed; reload before execution')
    if (request.resumeRunId !== undefined && (request.planId !== undefined || request.targets !== undefined)) throw new Error('Resume cannot override the original plan or target authorization')
    const source = request.resumeRunId === undefined ? undefined : this.state(request).runs.find(run => run.id === request.resumeRunId)
    if (request.resumeRunId !== undefined && (!source || source.status === 'running' || source.status === 'completed')) throw new Error('Select an interrupted or unsuccessful execution from this task')
    if (source && this.state(request).runs.some(run => run.resumedFromRunId === source.id)) throw new Error('This execution already has a continuation; resume the latest attempt')
    const assets = records.assets.filter(asset => task.assetIds.includes(asset.id))
    if (source && (source.snapshot.recordRevision !== records.revision || executionSettings(source.snapshot.task) !== executionSettings(task) || JSON.stringify(source.snapshot.assets) !== JSON.stringify(assets))) throw new Error('Task settings changed since this execution; start a new investigation')
    const plans = this.ctx.securityPlanning.read(request).plans
    const inheritedPlanIds = source ? [...source.planIds] : []
    const inheritedWorkerIds = source ? [...source.workerRunIds] : []
    if (source) {
      for (const child of [...plans].sort((a, b) => a.createdAt - b.createdAt)) {
        const childRequest = child.requestId === `execution-initial:${source.id}` || (child.requestId.startsWith(`execution-review:${source.id}:`) && /^\d+$/.test(child.requestId.slice(`execution-review:${source.id}:`.length)))
        if (childRequest && child.snapshot.recordRevision === records.revision
          && executionSettings(child.snapshot.task) === executionSettings(task)
          && JSON.stringify(child.snapshot.assets) === JSON.stringify(assets)
          && child.snapshot.targetMode === source.snapshot.targetMode
          && JSON.stringify(child.snapshot.approvedTargets ?? []) === JSON.stringify(source.snapshot.targets)
          && !inheritedPlanIds.includes(child.id)) inheritedPlanIds.push(child.id)
      }
      for (const child of this.ctx.securityWorkers.read(request).runs) {
        const prefix = `execution:${source.id}:`
        const parent = plans.find(candidate => candidate.id === child.planId && inheritedPlanIds.includes(candidate.id))
        if (child.requestId.startsWith(prefix) && /^\d+$/.test(child.requestId.slice(prefix.length))
          && parent?.items.some(item => item.id === child.itemId && item.targetAssetIds.includes(child.assetId))
          && child.snapshot.recordRevision === records.revision
          && executionSettings(child.snapshot.task) === executionSettings(task)
          && assets.some(asset => JSON.stringify(asset) === JSON.stringify(child.snapshot.asset))
          && !inheritedWorkerIds.includes(child.id)) inheritedWorkerIds.push(child.id)
      }
    }
    let plan = source ? [...inheritedPlanIds].reverse().map(id => plans.find(candidate => candidate.id === id && candidate.status === 'ready')).find(candidate => candidate !== undefined) : request.planId === undefined ? undefined : this.ctx.securityPlanning.read(request).plans.find(plan => plan.id === request.planId && plan.status === 'ready')
    if (request.planId !== undefined && !plan) throw new Error('Select a saved ready plan')
    if (source?.status === 'needs-input' && (plan?.reviewDecision === 'complete' || plan?.reviewDecision === 'needs-input')) throw new Error('The saved Planner decision requires no continuation; review the report or start a new investigation')
    const catalog = await this.ctx.securityConversations.catalog({ ...request, role: 'planner' })
    const resumedModel = source?.snapshot.modelDecision ?? plan?.snapshot.modelDecision
    if (source && request.modelDecision && (!resumedModel || request.modelDecision.engine !== resumedModel.engine || request.modelDecision.model !== resumedModel.model)) throw new Error('Resume must retain the original Planner model; start a new investigation to change it')
    const modelDecision = resolveTaskModelDecision(task, 'planner', catalog, source ? resumedModel : request.modelDecision ?? plan?.snapshot.modelDecision)
    if (!source && plan && resolveTaskAgentMode(task, 'planner') === 'auto' && plan.snapshot.modelDecision === undefined) plan = undefined
    if (this.authorize(request).records.revision !== records.revision) throw new Error('Task settings changed; reload before execution')
    if (plan && (executionSettings(plan.snapshot.task) !== executionSettings(task) || JSON.stringify(plan.snapshot.assets) !== JSON.stringify(assets))) throw new Error('Plan settings changed; create a current plan')
    if (!assets.some(asset => ['domain', 'subdomain', 'ip', 'endpoint', 'service'].includes(asset.kind))) throw new Error('Select a registered executable asset before execution')
    const targets = source?.snapshot.targets ?? request.targets?.map((target) => {
      const asset = assets.find(asset => asset.id === target.assetId)
      if (!asset) throw new Error('Execution target is not registered for this task')
      return { assetId: asset.id, url: compileWorkerPolicy(task, asset, target.url, this.ctx.securityRecords.localHttpOrigins, { method: 'GET', authenticated: false }).url.href }
    }) ?? []
    if (new Set(targets.map(target => JSON.stringify(target))).size !== targets.length) throw new Error('Duplicate execution target')
    if (this.stopping) throw new Error('Execution is stopping')
    const savedRounds = source?.reviews ? source.reviews.filter(review => review.applied).length : source ? inheritedPlanIds.filter(id => plans.some(candidate => candidate.id === id && candidate.status === 'ready' && candidate.snapshot.previousPlanId !== undefined)).length : 0
    const now = Date.now()
    const run: SecurityExecutionRun = { workspaceId: request.workspaceId, taskId: request.taskId, requestId: request.requestId, id: randomUUID(), status: 'running', createdAt: now, updatedAt: now, round: Math.max(source?.round ?? 0, savedRounds), ...(source ? { resumedFromRunId: source.id } : {}), planIds: source ? inheritedPlanIds : plan ? [plan.id] : [], workerRunIds: source ? inheritedWorkerIds : [], events: [{ at: now, kind: 'started', message: source ? 'Owner explicitly resumed saved results; request and round budgets carry forward, with a new elapsed-time window.' : request.targets ? 'Owner approved bounded anonymous GET investigation.' : 'Investigation started within registered assets and saved scope.', ...(plan ? { planId: plan.id } : {}) }], snapshot: { modelDecision, recordRevision: records.revision, task: structuredClone(task), assets: structuredClone(assets), targets, ...(source ? source.snapshot.targetMode ? { targetMode: source.snapshot.targetMode } : {} : !request.targets ? { targetMode: 'asset-scope' as const } : {}), limits: source ? structuredClone(source.snapshot.limits) : this.limits() } }
    run.dispatches = structuredClone(source?.dispatches ?? [])
    run.reviews = structuredClone(source?.reviews ?? (source ? plans.filter(candidate => inheritedPlanIds.includes(candidate.id)
      && candidate.status === 'ready' && candidate.snapshot.previousPlanId !== undefined).flatMap(candidate => candidate.snapshot.previousPlanId === undefined ? [] : [{
      requestId: candidate.requestId, previousPlanId: candidate.snapshot.previousPlanId,
      workerRunIds: candidate.snapshot.workerRunIds ?? [], planId: candidate.id, applied: true,
    }]) : []))
    const active: Active = { run, abort: new AbortController(), childWorkers: new Set(), inflight: new Map() }
    this.active.set(keyOf(request), active)
    try { await this.requireTable().put(run.id, structuredClone(run)) } catch (error) { this.active.delete(keyOf(request)); throw error }
    active.operation = this.execute(active, plan).catch((error: unknown) => { this.unavailable.set(keyOf(run), error instanceof Error ? error.message : String(error)); this.ctx.logger.error('Security execution storage failed', error) })
    return this.state(request)
  }
  private async execute(active: Active, initial?: SecurityPlan): Promise<void> {
    const { run } = active
    const timer = setTimeout(() => { active.reason = 'Execution exceeded its configured elapsed-time limit.'; active.abort.abort() }, run.snapshot.limits.timeoutMs)
    const visited = new Set(this.ctx.securityWorkers.read(run).runs.filter(worker => run.workerRunIds.includes(worker.id)
      && worker.snapshot.recordRevision === run.snapshot.recordRevision && classifySecurityWorker(worker).status === 'confirmed')
      .map(worker => planItemKey(worker.snapshot.item)))
    let plan: SecurityPlan | undefined = initial
    try {
      this.check(active)
      if (plan === undefined) {
        const requestId = `execution-initial:${run.id}`
        const state = await this.ctx.securityPlanning.start({ workspaceId: run.workspaceId, taskId: run.taskId,
          requestId, expectedRevision: this.authorize(run).records.revision, modelDecision: run.snapshot.modelDecision,
          targetMode: run.snapshot.targetMode, approvedTargets: run.snapshot.targets })
        plan = state.plans.find(candidate => candidate.requestId === requestId)
        if (!plan) throw new Error('Initial Planner admission did not return a durable plan')
        active.childPlan = plan.id
        run.planIds.push(plan.id)
        await this.record(active, 'review', 'Initial Planner started for the owner-delegated investigation.', plan.id)
        while (plan.status === 'planning') {
          await this.pause(active)
          plan = this.ctx.securityPlanning.read(run).plans.find(candidate => candidate.id === active.childPlan)
          if (!plan) throw new Error('Initial Planner disappeared')
        }
        this.check(active)
        delete active.childPlan
        if (plan.status !== 'ready') throw new Error(plan.error ?? 'Initial Planner did not complete')
      }
      const readyPlan = plan
      await this.applyExploration(readyPlan)
      const unapplied = run.reviews?.find(review => !review.applied
        && (review.planId === readyPlan.id || review.requestId === readyPlan.requestId))
      if (unapplied) {
        unapplied.planId = plan.id
        await this.applyReview(active, plan, unapplied)
      }
      if (plan.reviewDecision === 'complete' || plan.reviewDecision === 'needs-input') { await this.finishDecision(active, plan); return }
      while (run.round < run.snapshot.limits.maxRounds) {
        this.check(active)
        const budgetExhausted = await this.dispatchPool(active, plan, visited)
        this.check(active)
        const acknowledged = new Set(run.reviews?.filter(review => review.applied).flatMap(review => review.workerRunIds))
        const workerRunIds = this.ctx.securityWorkers.read(run).runs.filter(worker => run.workerRunIds.includes(worker.id)
          && !acknowledged.has(worker.id) && !active.childWorkers.has(worker.id)
          && (worker.status === 'completed' || worker.status === 'failed')).map(worker => worker.id)
        if (workerRunIds.length === 0 && !active.inflight.size
          && (run.reviews?.some(review => review.applied) || plan.snapshot.previousPlanId !== undefined)) {
          await this.cancelChildren(active)
          await this.finish(active, 'needs-input', budgetExhausted
            ? 'Configured request limit reached; saved results were already reviewed.'
            : 'Planner did not provide a new supported operation; no request was repeated.')
          return
        }
        run.reviews ??= []
        const review: SecurityExecutionReview = { requestId: `execution-review:${run.id}:${run.reviews.length + 1}`,
          previousPlanId: plan.id, workerRunIds, applied: false }
        run.reviews.push(review)
        await this.record(active, 'review', 'Settled Worker results reserved for Planner review.', plan.id)
        this.check(active)
        const state = await this.ctx.securityPlanning.review({
          workspaceId: run.workspaceId, taskId: run.taskId, planId: plan.id,
          expectedRevision: this.authorize(run).records.revision, requestId: review.requestId,
          workerRunIds, approvedTargets: run.snapshot.targets, executionRunId: run.id,
          ...(run.snapshot.targetMode ? { targetMode: run.snapshot.targetMode } : {}),
        })
        let reviewed: SecurityPlan | undefined = state.plans.find(candidate => candidate.requestId === review.requestId)
        if (!reviewed) throw new Error('Planner review admission did not return a durable plan')
        active.childPlan = reviewed.id
        review.planId = reviewed.id
        run.planIds.push(reviewed.id)
        await this.record(active, 'review', 'Saved Worker observations submitted while other Workers continue.', reviewed.id)
        while (reviewed.status === 'planning') {
          await this.settlePool(active, visited)
          await this.pause(active)
          reviewed = this.ctx.securityPlanning.read(run).plans.find(candidate => candidate.id === active.childPlan)
          if (!reviewed) throw new Error('Planner review disappeared')
        }
        this.check(active)
        delete active.childPlan
        if (reviewed.status !== 'ready') throw new Error(reviewed.error ?? 'Planner review did not complete')
        await this.applyExploration(reviewed)
        await this.applyReview(active, reviewed, review)
        await this.settlePool(active, visited)
        const used = this.ctx.securityWorkers.read(run).runs.filter(worker => run.workerRunIds.includes(worker.id))
          .reduce((sum, worker) => sum + (worker.httpRequests ?? (worker.evidence ? 1 : 0)), 0)
        if (used >= run.snapshot.limits.maxRequests) {
          await this.cancelChildren(active)
          const acknowledged = new Set(run.reviews.filter(review => review.applied).flatMap(review => review.workerRunIds))
          const unreviewed = this.ctx.securityWorkers.read(run).runs.some(worker => run.workerRunIds.includes(worker.id)
            && !acknowledged.has(worker.id) && (worker.status === 'completed' || worker.status === 'failed'))
          await this.finish(active, 'needs-input', unreviewed
            ? 'Configured request limit reached; remaining results require review.'
            : 'Configured request limit reached; saved results were already reviewed.')
          return
        }
        if (reviewed.reviewDecision !== 'continue') { await this.finishDecision(active, reviewed); return }
        plan = reviewed
      }
      await this.cancelChildren(active)
      await this.finish(active, 'needs-input', 'Configured Planner round limit reached.')
    } catch (error) {
      await this.cancelChildren(active)
      await this.finish(active, this.stopping ? 'interrupted' : active.abort.signal.aborted && !active.reason ? 'cancelled' : active.reason ? 'needs-input' : 'failed', active.reason ?? (error instanceof Error ? error.message : String(error)))
    } finally { clearTimeout(timer); this.active.delete(keyOf(run)) }
  }
  private async dispatchPool(active: Active, plan: SecurityPlan, visited: Set<string>): Promise<boolean> {
    const { run } = active
    const limit = run.snapshot.limits.maxConcurrentWorkers ?? 1
    const pending = plan.items.filter(item => item.operation && !visited.has(planItemKey(item)))
    const inflight = active.inflight
    let cursor = 0
    while (cursor < pending.length || inflight.size) {
      this.check(active)
      await this.settlePool(active, visited)
      const acknowledged = new Set(run.reviews?.filter(review => review.applied).flatMap(review => review.workerRunIds))
      if (this.ctx.securityWorkers.read(run).runs.some(worker => run.workerRunIds.includes(worker.id)
        && !acknowledged.has(worker.id) && !active.childWorkers.has(worker.id)
        && (worker.status === 'completed' || worker.status === 'failed'))) return false
      if (inflight.size >= limit || cursor >= pending.length) {
        if (!inflight.size) break
        await this.pause(active)
        continue
      }
      const item = pending[cursor]
      if (!item?.operation) throw new Error('Executable pending investigation missing')
      const operation = item.operation
      const key = planItemKey(item)
      if (visited.has(key)) { cursor++; continue }
      const workers = this.ctx.securityWorkers.read(run).runs.filter(worker => run.workerRunIds.includes(worker.id))
      const reservations = (run.dispatches ?? []).filter(dispatch => !dispatch.settled)
      const reservedIds = new Set(reservations.flatMap(dispatch => dispatch.workerRunId ? [dispatch.workerRunId] : []))
      const consumed = workers.filter(worker => !reservedIds.has(worker.id))
        .reduce((sum, worker) => sum + (worker.httpRequests ?? (worker.evidence ? 1 : 0)), 0)
      const available = run.snapshot.limits.maxRequests - consumed - reservations.reduce((sum, dispatch) => sum + dispatch.maxRequests, 0)
      if (available <= 0) {
        if (!inflight.size) break
        await this.pause(active)
        continue
      }
      const asset = run.snapshot.assets.find(asset => asset.id === operation.assetId)
      if (!asset || !item.targetAssetIds.includes(operation.assetId)) {
        active.reason = 'Planner requested an operation outside the registered asset scope.'
        throw new Error(active.reason)
      }
      const url = compileWorkerPolicy(run.snapshot.task, asset, operation.url,
        this.ctx.securityRecords.localHttpOrigins, { method: 'GET', authenticated: false }).url.href
      if (run.snapshot.targetMode !== 'asset-scope'
        && !run.snapshot.targets.some(target => target.assetId === asset.id && target.url === url)) {
        active.reason = 'Planner requested an operation outside the approved exact targets.'
        throw new Error(active.reason)
      }
      const slots = Math.min(limit - inflight.size, pending.length - cursor)
      const quota = Math.max(1, Math.ceil(available / slots))
      run.dispatches ??= []
      const grant: SecurityExecutionDispatch = { requestId: `execution:${run.id}:${run.dispatches.length}`,
        planId: plan.id, itemId: item.id, assetId: asset.id, url, maxRequests: quota }
      run.dispatches.push(grant)
      await this.record(active, 'worker', 'HTTP quota reserved before Worker admission.', plan.id)
      this.check(active)
      const state = await this.ctx.securityWorkers.startReserved({
        workspaceId: run.workspaceId, taskId: run.taskId, planId: plan.id, itemId: item.id,
        assetId: asset.id, url, expectedRevision: this.authorize(run).records.revision,
        requestId: grant.requestId, maxRequests: grant.maxRequests, executionRunId: run.id,
      })
      const worker = state.runs.find(candidate => candidate.requestId === grant.requestId)
      if (!worker) throw new Error('Worker admission did not return a durable run')
      grant.workerRunId = worker.id
      active.childWorkers.add(worker.id)
      run.workerRunIds.push(worker.id)
      visited.add(key)
      cursor++
      await this.record(active, 'worker', 'Worker dispatched with a reserved share of the common HTTP budget.', plan.id, worker.id)
      const entry: { key: string; grant: SecurityExecutionDispatch; result?: PromiseSettledResult<void> } = { key, grant }
      inflight.set(worker.id, entry)
      void this.ctx.securityWorkers.waitForSettled({ ...run, runId: worker.id }).then(() => { entry.result = { status: 'fulfilled', value: undefined } }, (reason: unknown) => {
        entry.result = { status: 'rejected', reason }
      })
    }
    const used = this.ctx.securityWorkers.read(run).runs.filter(worker => run.workerRunIds.includes(worker.id))
      .reduce((sum, worker) => sum + (worker.httpRequests ?? (worker.evidence ? 1 : 0)), 0)
    return used >= run.snapshot.limits.maxRequests
  }
  private async settlePool(active: Active, visited: Set<string>): Promise<void> {
    for (const [id, entry] of active.inflight) {
      if (!entry.result) continue
      if (entry.result.status === 'rejected') throw entry.result.reason
      const worker = this.ctx.securityWorkers.read(active.run).runs.find(candidate => candidate.id === id)
      if (!worker || worker.status === 'running') throw new Error('Worker settled without a durable terminal result')
      if (classifySecurityWorker(worker).status !== 'confirmed') visited.delete(entry.key)
      entry.grant.settled = true
      await this.record(active, 'worker', 'Worker settled; unused HTTP reservation returned to the shared budget.',
        worker.planId, id)
      active.childWorkers.delete(id)
      active.inflight.delete(id)
    }
  }
  private async applyReview(active: Active, plan: SecurityPlan, review: NonNullable<SecurityExecutionRun['reviews']>[number]): Promise<void> {
    if (review.applied) return
    for (const runId of plan.stopWorkerRunIds ?? []) {
      this.check(active)
      await this.ctx.securityWorkers.cancel({ ...active.run, runId })
      await this.ctx.securityWorkers.waitForSettled({ ...active.run, runId })
    }
    this.check(active)
    review.applied = true
    active.run.round++
    await this.record(active, 'decision', plan.reviewSummary ?? 'Planner decision saved.', plan.id)
  }
  private async applyExploration(plan: SecurityPlan): Promise<void> {
    const exploration = this.ctx.get('securityExploration')
    if (exploration) await this.ctx.securityPlanning.repairExploration({ ...plan, planId: plan.id })
    else if (plan.explorationAnnotations) throw new Error('Shared exploration is unavailable; planning annotations were not applied')
  }
  private async finishDecision(active: Active, plan: SecurityPlan): Promise<void> {
    await this.cancelChildren(active)
    if (plan.reviewDecision !== 'complete') { await this.finish(active, 'needs-input', plan.reviewSummary ?? 'Planner requires owner input.'); return }
    const { run } = active
    const report = buildSecurityReport({ task: run.snapshot.task, assets: run.snapshot.assets, executions: [run],
      plans: this.ctx.securityPlanning.read(run).plans, workers: this.ctx.securityWorkers.read(run).runs, findings: [], retests: [] })
    const acknowledged = new Set(run.reviews?.filter(review => review.applied).flatMap(review => review.workerRunIds))
    const unreviewed = this.ctx.securityWorkers.read(run).runs.some(worker => run.workerRunIds.includes(worker.id)
      && !acknowledged.has(worker.id) && (worker.status === 'completed' || worker.status === 'failed'))
    const gaps = unreviewed || report.operations.length === 0
      || report.counts.partial + report.counts.unverified + report.counts.unsupported > 0
    await this.finish(active, gaps ? 'needs-input' : 'completed', gaps ? '調査は停止しましたが、部分取得・未確認・未対応の項目が残っています。レポートで確認範囲と残課題を確認してください。' : plan.reviewSummary ?? 'Bounded observations saved; no broad vulnerability-free conclusion is established.')
  }
  private async cancelChildren(active: Active): Promise<void> {
    const { run } = active
    const children: Promise<unknown>[] = []
    if (active.childWorkers.size || run.dispatches?.some(dispatch => !dispatch.settled)) {
      children.push(this.ctx.securityWorkers.cancel(run))
    }
    if (active.childPlan) children.push(this.ctx.securityPlanning.cancel({ ...run, planId: active.childPlan }))
    const stopped = await Promise.allSettled(children)
    const failed = stopped.find(result => result.status === 'rejected')
    if (failed?.status === 'rejected') throw failed.reason
    for (const grant of run.dispatches ?? []) {
      if (grant.settled || grant.workerRunId) continue
      const worker = this.ctx.securityWorkers.read(run).runs.find(worker => worker.requestId === grant.requestId)
      if (!worker) { grant.settled = true; continue }
      grant.workerRunId = worker.id
      active.childWorkers.add(worker.id)
      if (!run.workerRunIds.includes(worker.id)) run.workerRunIds.push(worker.id)
    }
    await Promise.all([...active.childWorkers].map(runId => this.ctx.securityWorkers.waitForSettled({ ...run, runId })))
    for (const grant of run.dispatches ?? []) {
      if (grant.workerRunId && active.childWorkers.has(grant.workerRunId)) grant.settled = true
    }
    active.childWorkers.clear()
    active.inflight.clear()
  }
  private async pause(active: Active): Promise<void> {
    this.check(active)
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => { clearTimeout(timer); reject(new Error('Execution stopped')) }
      const timer = setTimeout(() => { active.abort.signal.removeEventListener('abort', onAbort); resolve() }, this.config.executionPollMs)
      active.abort.signal.addEventListener('abort', onAbort, { once: true })
    })
  }
  private check(active: Active): void {
    active.abort.signal.throwIfAborted()
    if (this.stopping) throw new Error('Execution stopping')
    const { records, task } = this.authorize(active.run)
    if (executionSettings(task) !== executionSettings(active.run.snapshot.task) || JSON.stringify(records.assets.filter(asset => task.assetIds.includes(asset.id))) !== JSON.stringify(active.run.snapshot.assets)) throw new Error('Task settings changed during execution')
  }
  private async record(active: Active, kind: SecurityExecutionRun['events'][number]['kind'], message: string, planId?: string, workerRunId?: string): Promise<void> {
    active.run.updatedAt = Date.now()
    active.run.events.push({ at: active.run.updatedAt, kind, message, ...planId ? { planId } : {}, ...workerRunId ? { workerRunId } : {} })
    await this.requireTable().put(active.run.id, structuredClone(active.run))
  }
  private async finish(active: Active, status: SecurityExecutionRun['status'], summary: string): Promise<void> {
    active.run.status = status; active.run.summary = summary
    if (status === 'failed' || status === 'interrupted') active.run.error = summary
    await this.record(active, 'stopped', summary)
  }
  private authorize(request: SecurityConversationRequest) {
    if (principalOf(this.ctx.invocation) !== undefined || !this.ctx.workspaceRegistry.get(request.workspaceId)) throw new RemoteError('security/rejected', 'Execution requires the Workspace owner', { workspaceId: request.workspaceId })
    const records = this.ctx.securityRecords.read({ workspaceId: request.workspaceId })
    const task = records.tasks.find(task => task.id === request.taskId && !task.archived)
    if (!task) throw new Error('Execution task is missing or archived')
    return { records, task }
  }
  private limits(): SecurityExecutionLimits {
    return { maxRounds: this.config.executionMaxRounds, maxRequests: this.config.executionMaxRequests,
      timeoutMs: this.config.executionTimeoutMs, maxConcurrentWorkers: this.config.executionMaxConcurrentWorkers ?? 1 }
  }
  private state(request: SecurityConversationRequest): SecurityExecutionState {
    const failure = this.unavailable.get(keyOf(request))
    if (failure) throw new Error(`Execution storage failed; reload the Host before retrying: ${failure}`)
    const runs = [...this.requireTable().entries()].map(([, run]) => run).filter(run => keyOf(run) === keyOf(request))
      .sort((a, b) => b.createdAt - a.createdAt).map(run => structuredClone(run))
    return { limits: this.limits(), runs }
  }
  private requireTable(): KvTable<string, SecurityExecutionRun> { if (!this.table) throw new Error('Execution storage unavailable'); return this.table }
}
