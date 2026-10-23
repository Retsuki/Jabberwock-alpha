import { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {} from '../src/index.ts'
import { SecurityExecutionService } from '../src/security-execution.ts'
import type { SecurityExecutionRun } from '../src/execution-types.ts'
import type { SecurityAsset, SecurityRecords, SecurityTask } from '../src/security-records.ts'
import type { SecurityPlan } from '../src/planning-types.ts'
import type { SecurityPlanningReviewRequest } from '../src/planning-types.ts'
import type { SecurityWorkerStartRequest } from '../src/worker-types.ts'
import type { SecurityWorkerRun } from '../src/worker-types.ts'
const contexts: Context[] = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })
const identity = { workspaceId: 'workspace' as WorkspaceId, taskId: 'task' }
const task: SecurityTask = { id: 'task', name: 'Review', description: '', objective: 'Observe', assetIds: ['asset'], status: 'draft', archived: false, pinned: false, createdAt: 1, updatedAt: 1, agentModels: { planner: { engine: 'claude', model: 'fake' } } }
const asset: SecurityAsset = { id: 'asset', companyId: 'company', kind: 'domain', value: 'example.org' }
const operation = { kind: 'http-get' as const, assetId: 'asset', url: 'https://example.org/' }
async function fixture(options: { concurrency?: number; decision?: 'complete' | 'continue' | 'needs-input'; pending?: boolean; initialPending?: boolean; auto?: boolean; legacy?: boolean; maxRounds?: number; maxRequests?: number; timeoutMs?: number; rows?: Map<string, SecurityExecutionRun>; failPut?: boolean; incomplete?: boolean; unapproved?: boolean } = {}) {
  const ctx = new Context(); contexts.push(ctx)
  let records: SecurityRecords = { ...identity, revision: 1, companies: [], assets: [asset], tasks: [structuredClone(options.auto ? { ...task, agentModelModes: { planner: 'auto' } } : task)] }
  const rows = options.rows ?? new Map<string, SecurityExecutionRun>()
  let failPut = options.failPut ?? false
  ctx.provide('storageDomain', { open: async () => ({ table: () => ({ entries: () => rows.entries(), get: (key: string) => rows.get(key), put: async (key: string, value: SecurityExecutionRun) => { if (failPut) throw new Error('disk unavailable'); rows.set(key, structuredClone(value)) } }), close: async () => {} }) } as never)
  ctx.provide('workspaceRegistry', { get: () => ({ path: '/tmp' }) } as never)
  ctx.provide('securityRecords', { read: () => structuredClone(records) } as never)
  ctx.provide('securityConversations', { catalog: async () => ({ selection: { engine: 'claude', model: 'fake' }, engines: [{ id: 'claude', name: 'Claude', models: [{ id: 'fake', name: 'Fake' }] }] }) } as never)
  ctx.provide('securitySetup', { read: async () => ({ checklist: { ready: !options.incomplete } }) } as never)
  const plans: SecurityPlan[] = [{ ...identity, id: 'plan', requestId: 'initial', sessionId: SessionId('planner'), status: 'ready', createdAt: 1, updatedAt: 1, snapshot: { recordRevision: 1, task: structuredClone(task), assets: [asset], conversation: '' }, items: [{ id: 'item', title: 'Observe', purpose: 'Observe', approach: 'GET', targetAssetIds: ['asset'], status: 'pending', ...options.legacy ? {} : { operation: options.unapproved ? { ...operation, url: 'https://outside.example.net/' } : operation } }] }]
  const workers: SecurityWorkerRun[] = []
  const workerStart = vi.fn(async (request: SecurityWorkerStartRequest) => {
    const item = plans.find(plan => plan.id === request.planId)!.items.find(item => item.id === request.itemId)!
    const worker: SecurityWorkerRun = { ...identity, ...request, id: `worker-${workers.length}`, sessionId: SessionId('worker'), status: options.pending ? 'running' : 'completed', createdAt: 1, updatedAt: 1, snapshot: { task: structuredClone(records.tasks[0]!), asset, item, recordRevision: records.revision, model: { engine: 'claude', model: 'fake' }, url: request.url, limits: { requestTimeoutMs: 1000, responseBytes: 100, modelTimeoutMs: 1000, maxRequests: request.maxRequests } }, httpRequests: options.pending ? 0 : 1, summary: 'Observed', evidence: { url: request.url, status: 200, body: 'Observed', bytes: 8, headers: {} } }
    workers.push(worker); return { runs: structuredClone(workers) }
  })
  const workerCancel = vi.fn(async (request: { runId?: string }) => { for (const worker of workers) if (worker.status === 'running' && (!request.runId || worker.id === request.runId)) worker.status = 'cancelled'; return { runs: workers } })
  const review = vi.fn(async (request: SecurityPlanningReviewRequest) => {
    const previous = plans.find(plan => plan.id === request.planId)!
    const pendingItems = previous.items.filter(item => item.operation
      && !workers.some(worker => worker.planId === previous.id && worker.itemId === item.id))
    const continuing = options.decision === 'continue' || (options.decision === undefined
      && (pendingItems.length > 0 || workers.some(worker => worker.status === 'running')))
    const next: SecurityPlan = { ...structuredClone(previous), id: `review-${plans.length}`, requestId: request.requestId,
      reviewDecision: continuing ? 'continue' : options.decision ?? 'complete', reviewSummary: 'Bounded observation complete',
      snapshot: { ...structuredClone(previous.snapshot), previousPlanId: previous.id, workerRunIds: [...request.workerRunIds],
        approvedTargets: request.approvedTargets, targetMode: request.targetMode },
      items: options.decision === undefined ? pendingItems.map(item => ({ ...item, carriedFrom: { planId: previous.id, itemId: item.id } })) : options.decision === 'continue' ? [{ ...previous.items[0]!, operation: {
        ...operation, url: `https://example.org/${plans.length}`,
      } }] : [],
    }
    plans.unshift(next); return { plans: structuredClone(plans) }
  })
  const disposalBlocks = new Map<string, Promise<void>>()
  const waitingDisposals = new Set<string>()
  const workerWait = vi.fn(async (request: { runId: string }) => {
    let worker = workers.find(worker => worker.id === request.runId)
    if (!worker) throw new Error('Worker missing')
    while (worker.status === 'running') {
      await new Promise<void>(resolve => setTimeout(resolve, 1))
      worker = workers.find(worker => worker.id === request.runId)
      if (!worker) throw new Error('Worker disappeared')
    }
    const disposal = disposalBlocks.get(worker.id)
    if (disposal) waitingDisposals.add(worker.id)
    await disposal
  })
  ctx.provide('securityWorkers', { read: () => ({ runs: structuredClone(workers) }), start: workerStart,
    startReserved: workerStart, waitForSettled: workerWait, cancel: workerCancel } as never)
  const plannerStart = vi.fn(async (request: { requestId: string }) => { const next = { ...structuredClone(plans[0]!), id: 'fresh-plan', requestId: request.requestId, status: options.initialPending ? 'planning' as const : 'ready' as const }; plans.unshift(next); return { plans: structuredClone(plans) } })
  const plannerCancel = vi.fn(async () => { for (const plan of plans) if (plan.status === 'planning') plan.status = 'cancelled'; return { plans } })
  const repairExploration = vi.fn(async () => {})
  ctx.provide('securityPlanning', { start: plannerStart, read: () => ({ plans: structuredClone(plans) }), review, cancel: plannerCancel, repairExploration } as never)
  await ctx.plugin(SecurityExecutionService, {
    executionMaxRounds: options.maxRounds ?? 3, executionMaxRequests: options.maxRequests ?? 10,
    executionTimeoutMs: options.timeoutMs ?? 10000, executionPollMs: 10, executionMaxConcurrentWorkers: options.concurrency ?? 1,
  })
  let requestedId = 'request'
  const start = (extra = {}) => {
    const request = { ...identity, planId: 'plan', requestId: 'request', expectedRevision: 1, ...extra }
    requestedId = request.requestId
    return ctx.securityExecution.start(request)
  }
  const settled = async () => {
    let terminal: SecurityExecutionRun | undefined
    await vi.waitFor(() => {
      const run = ctx.securityExecution.read(identity).runs.find(run => run.requestId === requestedId)
      expect(run).toBeDefined()
      expect(run?.status).not.toBe('running')
      terminal = run
    })
    if (!terminal) throw new Error('Requested execution did not settle')
    return terminal
  }
  return { ctx, start, settled, rows, workers, workerStart, workerCancel, workerWait, disposalBlocks, waitingDisposals, plannerStart, plannerCancel, review, plans, repairExploration, fail: () => { failPut = true }, edit: (patch: Partial<SecurityTask>) => { records = { ...records, revision: records.revision + 1, tasks: [{ ...records.tasks[0]!, ...patch }] }; ctx.emit('security-records/changed', records) } }
}
describe('Bounded security execution', () => {
  it('repairs saved knowledge before initial dispatch and before applying a review', async () => {
    const f = await fixture()
    f.ctx.provide('securityExploration', {} as never)
    await f.start()
    await f.settled()
    expect(f.repairExploration).toHaveBeenCalledTimes(2)
    expect(f.repairExploration.mock.invocationCallOrder[0]).toBeLessThan(f.workerStart.mock.invocationCallOrder[0]!)
  })
  it('preserves a ready plan and prevents HTTP dispatch when knowledge application fails', async () => {
    const f = await fixture()
    f.ctx.provide('securityExploration', {} as never)
    f.repairExploration.mockRejectedValue(new Error('Knowledge storage unavailable'))
    await f.start()
    expect((await f.settled()).status).toBe('failed')
    expect(f.workerStart).not.toHaveBeenCalled()
    expect(f.plans[0]?.status).toBe('ready')
  })
  function objectives(f: Awaited<ReturnType<typeof fixture>>, count: number) {
    const first = f.plans[0]!.items[0]!
    f.plans[0]!.items = Array.from({ length: count }, (_, index) => ({ ...first, id: `item-${index}`,
      title: `Objective ${index}`, operation: { ...operation, url: `https://example.org/${index}` } }))
  }
  it('refills a free pool slot before a slower Worker finishes and reclaims only disposed quotas', async () => {
    const f = await fixture({ pending: true, concurrency: 2, maxRequests: 8 })
    objectives(f, 3)
    await f.start()
    await vi.waitFor(() => { expect(f.workers).toHaveLength(2) })
    let release!: () => void
    f.disposalBlocks.set('worker-1', new Promise<void>((resolve) => { release = resolve }))
    f.workers[1]!.httpRequests = 1; f.workers[1]!.status = 'completed'
    await vi.waitFor(() => { expect(f.waitingDisposals.has('worker-1')).toBe(true) })
    expect(f.workerStart).toHaveBeenCalledTimes(2)
    expect(f.ctx.securityExecution.read(identity).runs[0]?.dispatches?.every(grant => !grant.settled)).toBe(true)
    release()
    await vi.waitFor(() => { expect(f.workers).toHaveLength(3) })
    expect(f.workers[0]?.status).toBe('running')
    expect(f.workers[2]?.snapshot.limits.maxRequests).toBe(3)
    const saved = f.ctx.securityExecution.read(identity).runs[0]!
    const activeQuota = saved.dispatches!.filter(grant => !grant.settled).reduce((sum, grant) => sum + grant.maxRequests, 0)
    expect(activeQuota + f.workers[1]!.httpRequests).toBe(8)
    f.workers[0]!.httpRequests = 4; f.workers[0]!.status = 'completed'
    f.workers[2]!.httpRequests = 3; f.workers[2]!.status = 'completed'
    const run = await f.settled()
    expect(run.status).toBe('needs-input')
    expect(run.dispatches?.every(grant => grant.settled)).toBe(true)
    expect(new Set(f.workerStart.mock.calls.map(call => call[0].requestId)).size).toBe(3)
    expect(f.review.mock.calls[0]?.[0].workerRunIds).toEqual(['worker-1'])
    expect(f.review.mock.calls.flatMap(call => call[0].workerRunIds).sort()).toEqual(['worker-0', 'worker-1', 'worker-2'])
  })
  it('reviews while siblings run, pauses new dispatch, and preserves arrivals during a single active review', async () => {
    const f = await fixture({ pending: true, concurrency: 3, maxRequests: 12 })
    objectives(f, 4)
    const original = f.review.getMockImplementation()!
    const hold = async (request: SecurityPlanningReviewRequest) => {
      const saved = f.ctx.securityExecution.read(identity).runs[0]!
      expect(saved.reviews?.find(review => review.requestId === request.requestId)?.workerRunIds).toEqual(request.workerRunIds)
      await original(request)
      f.plans[0]!.status = 'planning'
      return { plans: structuredClone(f.plans) }
    }
    f.review.mockImplementationOnce(hold).mockImplementationOnce(hold)
    await f.start()
    await vi.waitFor(() => { expect(f.workers).toHaveLength(3) })
    f.workers[0]!.httpRequests = 1; f.workers[0]!.status = 'completed'
    await vi.waitFor(() => { expect(f.review).toHaveBeenCalledOnce() })
    expect(f.workers[1]?.status).toBe('running')
    expect(f.workers[2]?.status).toBe('running')
    f.workers[1]!.httpRequests = 1; f.workers[1]!.status = 'completed'
    await vi.waitFor(() => { expect(f.ctx.securityExecution.read(identity).runs[0]?.dispatches?.[1]?.settled).toBe(true) })
    expect(f.workerStart).toHaveBeenCalledTimes(3)
    expect(f.review).toHaveBeenCalledOnce()
    f.plans[0]!.status = 'ready'
    await vi.waitFor(() => { expect(f.review).toHaveBeenCalledTimes(2) })
    expect(f.review.mock.calls.map(call => call[0].workerRunIds)).toEqual([['worker-0'], ['worker-1']])
    expect(f.workerStart).toHaveBeenCalledTimes(3)
    expect(f.workers[2]?.status).toBe('running')
    await f.ctx.securityExecution.cancel(identity)
    expect((await f.settled()).status).toBe('cancelled')
  })
  it.each([false, true])('keeps ongoing objectives unless explicitly stopped: %s', async (explicitStop) => {
    const f = await fixture({ pending: true, concurrency: 3 })
    objectives(f, 3)
    const original = f.review.getMockImplementation()!
    f.review.mockImplementationOnce(async (request) => {
      await original(request)
      f.plans[0]!.reviewDecision = 'continue'
      f.plans[0]!.items = []
      if (explicitStop) f.plans[0]!.stopWorkerRunIds = ['worker-1']
      return { plans: structuredClone(f.plans) }
    })
    await f.start()
    await vi.waitFor(() => { expect(f.workers).toHaveLength(3) })
    f.workers[0]!.httpRequests = 1; f.workers[0]!.status = 'completed'
    await vi.waitFor(() => { expect(f.ctx.securityExecution.read(identity).runs[0]?.round).toBe(1) })
    expect(f.workers[1]?.status).toBe(explicitStop ? 'cancelled' : 'running')
    expect(f.workers[2]?.status).toBe('running')
    expect(f.workerStart).toHaveBeenCalledTimes(3)
    if (!explicitStop) { f.workers[1]!.httpRequests = 1; f.workers[1]!.status = 'completed' }
    f.workers[2]!.httpRequests = 1; f.workers[2]!.status = 'completed'
    const run = await f.settled()
    expect(run.status).toBe(explicitStop ? 'needs-input' : 'completed')
    expect(f.review.mock.calls.flatMap(call => call[0].workerRunIds).sort()).toEqual(
      explicitStop ? ['worker-0', 'worker-2'] : ['worker-0', 'worker-1', 'worker-2'],
    )
  })
  it('preserves late important results without declaring an outdated complete decision successful', async () => {
    const f = await fixture({ pending: true, concurrency: 2, decision: 'complete' })
    objectives(f, 2)
    const original = f.review.getMockImplementation()!
    f.review.mockImplementationOnce(async (request) => {
      await original(request); f.plans[0]!.status = 'planning'
      return { plans: structuredClone(f.plans) }
    })
    await f.start()
    await vi.waitFor(() => { expect(f.workers).toHaveLength(2) })
    f.workers[0]!.httpRequests = 1; f.workers[0]!.status = 'completed'
    await vi.waitFor(() => { expect(f.review).toHaveBeenCalledOnce() })
    f.workers[1]!.httpRequests = 1; f.workers[1]!.status = 'completed'
    f.workers[1]!.findings = [{ title: 'Late issue', summary: 'Observed', severity: 'high', proof: 'Observed', remediation: 'Fix' }]
    await vi.waitFor(() => { expect(f.ctx.securityExecution.read(identity).runs[0]?.dispatches?.[1]?.settled).toBe(true) })
    f.plans[0]!.status = 'ready'
    const run = await f.settled()
    expect(run.status).toBe('needs-input')
    expect(run.reviews?.flatMap(review => review.workerRunIds)).toEqual(['worker-0'])
    expect(run.workerRunIds).toEqual(['worker-0', 'worker-1'])
    expect(f.review).toHaveBeenCalledOnce()
  })
  it('settles every child at the review round cap before publishing a terminal result', async () => {
    const f = await fixture({ pending: true, concurrency: 2, maxRounds: 1, decision: 'continue' })
    objectives(f, 3)
    await f.start()
    await vi.waitFor(() => { expect(f.workers).toHaveLength(2) })
    let release!: () => void
    f.disposalBlocks.set('worker-1', new Promise<void>((resolve) => { release = resolve }))
    f.workers[0]!.httpRequests = 1; f.workers[0]!.status = 'completed'
    await vi.waitFor(() => { expect(f.waitingDisposals.has('worker-1')).toBe(true) })
    expect(f.ctx.securityExecution.read(identity).runs[0]?.status).toBe('running')
    expect(f.workers[1]?.status).toBe('cancelled')
    release()
    const run = await f.settled()
    expect(run.status).toBe('needs-input')
    expect(run.summary).toContain('round limit')
    expect(run.dispatches?.every(grant => grant.settled)).toBe(true)
    expect(f.workerStart).toHaveBeenCalledTimes(2)
  })
  it('never allocates more than the shared HTTP ceiling across parallel Workers', async () => {
    const f = await fixture({ pending: true, concurrency: 3, maxRequests: 5 })
    objectives(f, 5)
    await f.start()
    await vi.waitFor(() => { expect(f.workers).toHaveLength(3) })
    expect(f.workers.map(worker => worker.snapshot.limits.maxRequests)).toEqual([2, 2, 1])
    for (const worker of f.workers) { worker.httpRequests = worker.snapshot.limits.maxRequests; worker.status = 'completed' }
    const run = await f.settled()
    expect(run.status).toBe('needs-input')
    expect(f.workerStart).toHaveBeenCalledTimes(3)
    expect(f.workers.reduce((sum, worker) => sum + (worker.httpRequests ?? 0), 0)).toBe(5)
    expect(f.review).toHaveBeenCalledOnce()
  })
  it.each(['finding', 'failure'] as const)('reviews the first disposed result while another %s checkpoint is still disposing', async (checkpoint) => {
    const f = await fixture({ pending: true, concurrency: 2, decision: 'needs-input' })
    objectives(f, 4)
    await f.start()
    await vi.waitFor(() => { expect(f.workers).toHaveLength(2) })
    let release!: () => void
    f.disposalBlocks.set('worker-0', new Promise<void>((resolve) => { release = resolve }))
    f.workers[0]!.httpRequests = 1
    f.workers[0]!.status = checkpoint === 'failure' ? 'failed' : 'completed'
    if (checkpoint === 'finding') f.workers[0]!.findings = [{ title: 'Issue', summary: 'Observed', severity: 'high', proof: 'Observed', remediation: 'Fix' }]
    await vi.waitFor(() => { expect(f.waitingDisposals.has('worker-0')).toBe(true) })
    expect(f.workerStart).toHaveBeenCalledTimes(2)
    expect(f.review).not.toHaveBeenCalled()
    f.workers[1]!.httpRequests = 1; f.workers[1]!.status = 'completed'
    await vi.waitFor(() => { expect(f.ctx.securityExecution.read(identity).runs[0]?.dispatches?.[1]?.settled).toBe(true) })
    expect(f.workerStart).toHaveBeenCalledTimes(2)
    release()
    expect((await f.settled()).status).toBe('needs-input')
    expect(f.workerStart).toHaveBeenCalledTimes(2)
    expect(f.review.mock.calls[0]?.[0].workerRunIds).toEqual(['worker-1'])
    expect(f.ctx.securityExecution.read(identity).runs[0]?.reviews?.[0]?.workerRunIds).toEqual(['worker-1'])
  })
  it('cancels every pool child and waits for disposal before returning', async () => {
    const f = await fixture({ pending: true, concurrency: 2 })
    objectives(f, 4)
    await f.start()
    await vi.waitFor(() => { expect(f.workers).toHaveLength(2) })
    let release!: () => void
    f.disposalBlocks.set('worker-0', new Promise<void>((resolve) => { release = resolve }))
    let returned = false
    const cancellation = f.ctx.securityExecution.cancel(identity).then(() => { returned = true })
    await vi.waitFor(() => { expect(f.waitingDisposals.has('worker-0')).toBe(true) })
    expect(returned).toBe(false)
    expect(f.workers.every(worker => worker.status === 'cancelled')).toBe(true)
    release()
    await cancellation
    expect((await f.settled()).status).toBe('cancelled')
    expect(f.workerStart).toHaveBeenCalledTimes(2)
    expect(f.review).not.toHaveBeenCalled()
  })
  it('stops the remaining pool when quota settlement cannot be persisted', async () => {
    const f = await fixture({ pending: true, concurrency: 2 })
    objectives(f, 3)
    await f.start()
    await vi.waitFor(() => { expect(f.workers).toHaveLength(2) })
    f.fail()
    f.workers[0]!.httpRequests = 1; f.workers[0]!.status = 'completed'
    await vi.waitFor(() => { expect(() => f.ctx.securityExecution.read(identity)).toThrow('Execution storage failed') })
    expect(f.workers[1]?.status).toBe('cancelled')
    expect(f.workerStart).toHaveBeenCalledTimes(2)
    expect(f.review).not.toHaveBeenCalled()
  })
  it('resumes legacy snapshots with one slot even when deployment now allows a larger pool', async () => {
    const first = await fixture({ pending: true })
    objectives(first, 3)
    await first.start()
    await vi.waitFor(() => { expect(first.workerStart).toHaveBeenCalledOnce() })
    await first.ctx.securityExecution.cancel(identity)
    const original = await first.settled()
    const { maxConcurrentWorkers: _oldPool, ...legacyLimits } = original.snapshot.limits
    const source = { ...original, status: 'interrupted' as const, snapshot: { ...original.snapshot, limits: legacyLimits } }
    const restarted = await fixture({ pending: true, concurrency: 3, rows: new Map([[source.id, source]]) })
    restarted.plans.splice(0, restarted.plans.length, ...structuredClone(first.plans))
    restarted.workers.push(...structuredClone(first.workers))
    expect(restarted.workerStart).not.toHaveBeenCalled()
    await restarted.start({ planId: undefined, requestId: 'resume', resumeRunId: source.id })
    await vi.waitFor(() => { expect(restarted.workerStart).toHaveBeenCalledOnce() })
    expect(restarted.workers.filter(worker => worker.status === 'running')).toHaveLength(1)
    expect(restarted.ctx.securityExecution.read(identity).runs.find(run => run.requestId === 'resume')?.snapshot.limits.maxConcurrentWorkers).toBeUndefined()
    await restarted.ctx.securityExecution.cancel(identity)
    expect((await restarted.settled()).status).toBe('cancelled')
    expect(restarted.workerStart).toHaveBeenCalledOnce()
  })
  it('dispatches a Worker, reports durable results and saves the final Planner decision once', async () => {
    const f = await fixture(); await f.start(); const run = await f.settled()
    expect(run.status).toBe('completed'); expect(run.workerRunIds).toEqual(['worker-0']); expect(run.planIds).toHaveLength(2)
    expect(f.review).toHaveBeenCalledWith(expect.objectContaining({ planId: 'plan', workerRunIds: ['worker-0'], targetMode: 'asset-scope', approvedTargets: [] }))
    await f.start(); expect(f.workerStart).toHaveBeenCalledTimes(1)
  })
  it('owns initial planning before dispatch when the main Agent delegates investigation', async () => {
    const f = await fixture(); await f.start({ planId: undefined }); const run = await f.settled()
    expect(run.status).toBe('completed')
    expect(f.plannerStart).toHaveBeenCalledWith(expect.objectContaining({ modelDecision: { engine: 'claude', model: 'fake', reason: 'Task owner fixed this role model.' }, targetMode: 'asset-scope' }))
    expect(f.workerStart.mock.calls[0]?.[0].planId).toBe('fresh-plan')
    await f.start({ planId: undefined }); expect(f.plannerStart).toHaveBeenCalledTimes(1)
  })
  it('creates a fresh plan for a legacy auto plan using the main Agent advertised choice', async () => {
    const f = await fixture({ auto: true })
    await expect(f.start()).rejects.toThrow('selection is missing'); expect(f.rows.size).toBe(0)
    await f.start({ modelDecision: { engine: 'claude', model: 'fake', reason: 'Main Agent chose the task model' } })
    expect((await f.settled()).status).toBe('completed'); expect(f.plannerStart).toHaveBeenCalledTimes(1)
    expect(f.workerStart.mock.calls[0]?.[0].planId).toBe('fresh-plan')
  })
  it('rejects invented automatic models before saving execution or dispatching', async () => {
    const f = await fixture({ auto: true })
    await expect(f.start({ planId: undefined, modelDecision: { engine: 'claude', model: 'invented', reason: 'Choice' } })).rejects.toThrow()
    expect(f.rows.size).toBe(0); expect(f.workerStart).not.toHaveBeenCalled(); expect(f.plannerStart).not.toHaveBeenCalled()
  })
  it('cancels the initial Planner before any Worker dispatch', async () => {
    const f = await fixture({ initialPending: true }); await f.start({ planId: undefined })
    await vi.waitFor(() => { expect(f.plannerStart).toHaveBeenCalledTimes(1) })
    await f.ctx.securityExecution.cancel(identity)
    expect((await f.settled()).status).toBe('cancelled'); expect(f.plannerCancel).toHaveBeenCalledTimes(1); expect(f.workerStart).not.toHaveBeenCalled()
  })
  it('cancels a Planner admitted while the owner cancellation is waiting for admission', async () => {
    const f = await fixture()
    const original = f.review.getMockImplementation()!
    let release!: () => void
    const admission = new Promise<void>((resolve) => { release = resolve })
    f.review.mockImplementationOnce(async (request) => {
      await original(request)
      f.plans[0]!.status = 'planning'
      await admission
      return { plans: structuredClone(f.plans) }
    })
    await f.start()
    await vi.waitFor(() => { expect(f.review).toHaveBeenCalledOnce() })
    let returned = false
    const cancellation = f.ctx.securityExecution.cancel(identity).then(() => { returned = true })
    await Promise.resolve()
    expect(returned).toBe(false)
    release()
    await cancellation
    expect((await f.settled()).status).toBe('cancelled')
    expect(f.plannerCancel).toHaveBeenCalledOnce()
    expect(f.plans[0]?.status).toBe('cancelled')
    expect(f.ctx.securityExecution.read(identity).runs[0]?.reviews?.[0]?.applied).toBe(false)
  })
  it('uses a new reviewed plan for a second request and submits only that plans results', async () => {
    const f = await fixture({ decision: 'continue', maxRounds: 2 }); await f.start(); const run = await f.settled()
    expect(run.status).toBe('needs-input'); expect(f.workerStart).toHaveBeenCalledTimes(2)
    expect(f.review.mock.calls[1]![0]).toMatchObject({ planId: 'review-1', workerRunIds: ['worker-1'] })
  })
  it('asks the Planner to adapt a legacy plan without treating prose as an executable command', async () => {
    const f = await fixture({ legacy: true }); await f.start(); expect((await f.settled()).status).toBe('needs-input')
    expect(f.workerStart).not.toHaveBeenCalled(); expect(f.review).toHaveBeenCalledWith(expect.objectContaining({ workerRunIds: [] }))
  })
  it('stops for an operation outside the registered asset scope', async () => {
    const f = await fixture({ unapproved: true }); await f.start(); expect((await f.settled()).status).toBe('failed'); expect(f.workerStart).not.toHaveBeenCalled()
  })
  it('keeps legacy caller exact-target authorization narrow', async () => {
    const f = await fixture({ decision: 'continue' })
    await f.start({ targets: [{ assetId: 'asset', url: operation.url }] })
    const run = await f.settled()
    expect(run.snapshot.targetMode).toBeUndefined()
    expect(run.snapshot.targets).toEqual([{ assetId: 'asset', url: operation.url }])
    expect(run.status).toBe('needs-input')
    expect(f.workerStart).toHaveBeenCalledTimes(1)
    expect(f.review.mock.calls[0]![0].targetMode).toBeUndefined()
  })
  it('cancels its active Worker and waits before returning', async () => {
    const f = await fixture({ pending: true }); await f.start(); await vi.waitFor(() =>{  expect(f.workerStart).toHaveBeenCalledTimes(1) })
    await f.ctx.securityExecution.cancel(identity); expect((await f.settled()).status).toBe('cancelled'); expect(f.workerCancel).toHaveBeenCalledTimes(1); expect(f.review).not.toHaveBeenCalled()
  })
  it('stops after operational settings change but allows future model choices', async () => {
    const f = await fixture({ pending: true }); await f.start(); await vi.waitFor(() =>{  expect(f.workerStart).toHaveBeenCalledTimes(1) })
    f.edit({ agentModels: { worker: { engine: 'claude', model: 'other' } } }); expect(f.ctx.securityExecution.read(identity).runs[0]!.status).toBe('running')
    f.edit({ objective: 'Changed' }); expect((await f.settled()).status).toBe('needs-input'); expect(f.workerCancel).toHaveBeenCalledTimes(1)
  })
  it('stops its child after archival without requiring the deleted task to remain readable', async () => {
    const f = await fixture({ pending: true })
    await f.start()
    await vi.waitFor(() => { expect(f.workerStart).toHaveBeenCalledTimes(1) })
    f.edit({ archived: true })
    await vi.waitFor(() => { expect([...f.rows.values()][0]?.status).toBe('needs-input') })
    expect(f.workerCancel).toHaveBeenCalledWith(expect.objectContaining(identity))
  })
  it('caps elapsed time and request count', async () => {
    const timed = await fixture({ pending: true, timeoutMs: 20 }); await timed.start(); expect((await timed.settled()).status).toBe('needs-input'); expect(timed.workerCancel).toHaveBeenCalledTimes(1)
    const capped = await fixture({ decision: 'continue', maxRequests: 1 }); await capped.start(); expect((await capped.settled()).summary).toContain('request limit'); expect(capped.workerStart).toHaveBeenCalledTimes(1)
  })
  it('reviews saved results once when a Worker exhausts the HTTP budget before later items', async () => {
    const f = await fixture({ maxRequests: 1 })
    f.plans[0]!.items.push({ ...f.plans[0]!.items[0]!, id: 'later', title: 'Later', operation: { ...operation, url: 'https://example.org/later' } })
    await f.start()
    const run = await f.settled()
    expect(run.status).toBe('needs-input')
    expect(run.summary).toContain('request limit')
    expect(f.workerStart).toHaveBeenCalledOnce()
    expect(f.review).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ executionRunId: run.id, workerRunIds: ['worker-0'] }))
  })
  it.each(['finding', 'failure'] as const)('reviews a %s checkpoint before dispatching remaining batch items', async (checkpoint) => {
    const f = await fixture({ decision: 'needs-input' })
    f.plans[0]!.items.push({ ...f.plans[0]!.items[0]!, id: 'later', title: 'Later', operation: { ...operation, url: 'https://example.org/later' } })
    const original = f.workerStart.getMockImplementation()!
    f.workerStart.mockImplementationOnce(async (request) => {
      await original(request)
      const worker = f.workers[0]!
      if (checkpoint === 'failure') worker.status = 'failed'
      else worker.findings = [{ title: 'Issue', summary: 'Observed', severity: 'high', proof: 'Observed', remediation: 'Fix' }]
      return { runs: structuredClone(f.workers) }
    })
    await f.start()
    const run = await f.settled()
    expect(run.status).toBe('needs-input')
    expect(f.workerStart).toHaveBeenCalledOnce()
    expect(f.review).toHaveBeenCalledWith(expect.objectContaining({ workerRunIds: ['worker-0'] }))
  })
  it('dispatches different investigation objectives sharing the same start URL', async () => {
    const f = await fixture()
    f.plans[0]!.items.push({ ...f.plans[0]!.items[0]!, id: 'second', title: 'Object authorization', purpose: 'Check another objective' })
    await f.start()
    expect((await f.settled()).status).toBe('completed')
    expect(f.workerStart).toHaveBeenCalledTimes(2)
    expect(f.workerStart.mock.calls.map(call => call[0].url)).toEqual([operation.url, operation.url])
  })
  it('blocks repeating a confirmed identical objective without new supported work', async () => {
    const f = await fixture({ decision: 'continue' })
    f.review.mockImplementationOnce(async (request) => {
      const previous = f.plans.find(plan => plan.id === request.planId)!
      const next = { ...structuredClone(previous), id: 'repeat-plan', requestId: request.requestId, reviewDecision: 'continue' as const }
      f.plans.unshift(next)
      return { plans: structuredClone(f.plans) }
    })
    await f.start()
    expect((await f.settled()).summary).toContain('no request was repeated')
    expect(f.workerStart).toHaveBeenCalledOnce()
  })
  it('rejects stale settings, incomplete setup and active unrelated work before dispatch', async () => {
    const f = await fixture(); await expect(f.start({ expectedRevision: 0 })).rejects.toThrow('changed'); expect(f.rows.size).toBe(0)
    f.plans[0]!.status = 'planning'; await expect(f.start()).rejects.toThrow('active Planner'); expect(f.workerStart).not.toHaveBeenCalled()
    const incomplete = await fixture({ incomplete: true }); await expect(incomplete.start()).rejects.toThrow('setup')
  })
  it('marks a durable running attempt interrupted on restart without new requests', async () => {
    const first = await fixture(); await first.start(); const run = await first.settled(); const rows = new Map([[run.id, { ...run, status: 'running' as const }]])
    const restarted = await fixture({ rows }); expect(restarted.ctx.securityExecution.read(identity).runs[0]!.status).toBe('interrupted'); expect(restarted.workerStart).not.toHaveBeenCalled(); expect(restarted.review).not.toHaveBeenCalled()
  })
  it('refuses new work when durable admission cannot be saved', async () => {
    const f = await fixture({ failPut: true }); await expect(f.start()).rejects.toThrow('disk unavailable'); expect(f.workerStart).not.toHaveBeenCalled()
  })
  it('resumes a failed review without repeating saved GETs or mutating the original attempt', async () => {
    const f = await fixture()
    f.review.mockRejectedValueOnce(new Error('Invalid Planner JSON'))
    await f.start()
    const original = await f.settled()
    expect(original.status).toBe('failed')
    expect(original.round).toBe(0)
    const before = structuredClone(f.rows.get(original.id))
    const request = { planId: undefined, requestId: 'resume', resumeRunId: original.id }
    await Promise.all([f.start(request), f.start(request)])
    const resumed = await f.settled()
    expect(resumed.status).toBe('completed')
    expect(resumed.resumedFromRunId).toBe(original.id)
    expect(resumed.workerRunIds).toEqual(original.workerRunIds)
    expect(resumed.round).toBe(1)
    expect(f.workerStart).toHaveBeenCalledTimes(1)
    expect(f.review).toHaveBeenCalledTimes(2)
    expect(f.rows.get(original.id)).toEqual(before)
    await f.start(request)
    expect(f.rows.size).toBe(2)
    await expect(f.start({ ...request, requestId: 'duplicate-resume' })).rejects.toThrow()
  })
  it('resumes only undispatched items after partial dispatch', async () => {
    const f = await fixture()
    f.plans[0]!.items.push({ ...f.plans[0]!.items[0]!, id: 'second', operation: { ...operation, url: 'https://example.org/second' } })
    const originalStart = f.workerStart.getMockImplementation()!
    f.workerStart.mockImplementationOnce(originalStart).mockRejectedValueOnce(new Error('Temporary admission failure'))
    await f.start()
    const original = await f.settled()
    expect(original.status).toBe('failed')
    await f.start({ planId: undefined, requestId: 'resume', resumeRunId: original.id })
    const resumed = await f.settled()
    expect(resumed.status).toBe('completed')
    expect(f.workerStart.mock.calls.map(call => call[0].url)).toEqual([operation.url, 'https://example.org/second', 'https://example.org/second'])
    expect(resumed.workerRunIds).toHaveLength(2)
  })
  it('retries an interrupted Worker while retaining its history and submitting terminal results only', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1800000000000)
    try {
      const f = await fixture({ pending: true })
      await f.start()
      await vi.waitFor(() => { expect(f.workers).toHaveLength(1) })
      await f.ctx.securityExecution.cancel(identity)
      const original = await f.settled()
      f.workers[0]!.status = 'interrupted'
      f.workerStart.mockImplementationOnce(async (request) => {
        const worker = { ...structuredClone(f.workers[0]!), ...request, id: 'worker-1', status: 'completed' as const }
        f.workers.push(worker)
        return { runs: structuredClone(f.workers) }
      })
      await f.start({ planId: undefined, requestId: 'resume', resumeRunId: original.id })
      const resumed = await f.settled()
      expect(resumed.requestId).toBe('resume')
      expect(resumed.workerRunIds).toEqual(['worker-0', 'worker-1'])
      expect(f.review).toHaveBeenCalledWith(expect.objectContaining({ workerRunIds: ['worker-1'] }))
    } finally { clock.mockRestore() }
  })
  it('rejects changed, foreign, completed or overridden resume sources', async () => {
    const f = await fixture()
    f.review.mockRejectedValueOnce(new Error('review failed'))
    await f.start()
    const original = await f.settled()
    await expect(f.start({ requestId: 'override', resumeRunId: original.id })).rejects.toThrow('cannot override')
    await expect(f.start({ planId: undefined, requestId: 'foreign', resumeRunId: 'other-task-run' })).rejects.toThrow('from this task')
    await expect(f.start({ planId: undefined, requestId: 'targets', targets: [{ assetId: operation.assetId, url: operation.url }], resumeRunId: original.id })).rejects.toThrow()
    await expect(f.start({ planId: undefined, requestId: 'model', resumeRunId: original.id, modelDecision: { engine: 'claude', model: 'other', reason: 'Change' } })).rejects.toThrow('original Planner model')
    f.edit({ objective: 'Changed' })
    await expect(f.start({ planId: undefined, requestId: 'changed', expectedRevision: 2, resumeRunId: original.id })).rejects.toThrow('start a new')
    const complete = await fixture()
    await complete.start()
    const done = await complete.settled()
    await expect(complete.start({ planId: undefined, requestId: 'completed', resumeRunId: done.id })).rejects.toThrow('from this task')
  })
  it('carries request and round budgets into an explicit resume', async () => {
    const f = await fixture({ decision: 'continue', maxRequests: 1 })
    await f.start()
    const original = await f.settled()
    await f.start({ planId: undefined, requestId: 'resume', resumeRunId: original.id })
    const resumed = await f.settled()
    expect(resumed.status).toBe('needs-input')
    expect(resumed.summary).toContain('request limit')
    expect(resumed.snapshot.limits).toEqual(original.snapshot.limits)
    expect(resumed.round).toBe(original.round)
    expect(f.workerStart).toHaveBeenCalledTimes(1)
    const capped = await fixture({ decision: 'continue', maxRounds: 1 })
    await capped.start()
    const prior = await capped.settled()
    await capped.start({ planId: undefined, requestId: 'resume', resumeRunId: prior.id })
    expect((await capped.settled()).summary).toContain('round limit')
    expect(capped.workerStart).toHaveBeenCalledTimes(1)
  })
  it('waits for explicit resume after restart and preserves terminal ready decisions', async () => {
    const first = await fixture()
    await first.start()
    const original = await first.settled()
    const rows = new Map([[original.id, { ...original, status: 'running' as const }]])
    const restarted = await fixture({ rows })
    restarted.plans.push(...first.plans.filter(plan => plan.id !== 'plan'))
    restarted.workers.push(...first.workers)
    expect(restarted.workerStart).not.toHaveBeenCalled()
    await restarted.start({ planId: undefined, requestId: 'resume', resumeRunId: original.id })
    expect((await restarted.settled()).status).toBe('completed')
    expect(rows.get(original.id)?.status).toBe('interrupted')
    expect(restarted.plannerStart).not.toHaveBeenCalled()
    expect(restarted.workerStart).not.toHaveBeenCalled()
    expect(restarted.review).not.toHaveBeenCalled()
  })

  it('applies a ready but unapplied saved decision only on explicit resume and only once', async () => {
    const first = await fixture()
    await first.start()
    const original = await first.settled()
    const saved: SecurityExecutionRun = { ...structuredClone(original), status: 'running', round: 0,
      reviews: original.reviews?.map(review => ({ ...review, applied: false })),
    }
    const f = await fixture({ rows: new Map([[saved.id, saved]]) })
    f.plans.push(...structuredClone(first.plans.filter(plan => plan.id !== 'plan')))
    f.workers.push(...structuredClone(first.workers))
    expect(f.review).not.toHaveBeenCalled()
    expect(f.workerStart).not.toHaveBeenCalled()
    await f.start({ planId: undefined, requestId: 'resume-ready', resumeRunId: saved.id })
    const resumed = await f.settled()
    expect(resumed.status).toBe('completed')
    expect(resumed.round).toBe(1)
    expect(resumed.reviews?.[0]?.applied).toBe(true)
    expect(f.review).not.toHaveBeenCalled()
    expect(f.workerStart).not.toHaveBeenCalled()
    await f.start({ planId: undefined, requestId: 'resume-ready', resumeRunId: saved.id })
    expect(f.ctx.securityExecution.read(identity).runs.find(run => run.requestId === 'resume-ready')?.round).toBe(1)
  })
  it('recovers consumed rounds from a ready review saved before coordinator persistence', async () => {
    const f = await fixture({ decision: 'continue', maxRounds: 1 })
    await f.start()
    const original = await f.settled()
    const review = f.plans.find(plan => plan.id !== 'plan')!
    review.snapshot.previousPlanId = 'plan'
    f.rows.set(original.id, { ...original, round: 0 })
    await f.start({ planId: undefined, requestId: 'resume', resumeRunId: original.id })
    const resumed = await f.settled()
    expect(resumed.round).toBe(1)
    expect(resumed.summary).toContain('round limit')
    expect(f.workerStart).toHaveBeenCalledTimes(1)
  })

  it('recovers a durably admitted child missed by coordinator persistence', async () => {
    const f = await fixture()
    f.review.mockRejectedValueOnce(new Error('review failed'))
    await f.start()
    const original = await f.settled()
    f.rows.set(original.id, { ...original, workerRunIds: [] })
    expect(f.workers[0]!.requestId).toBe(`execution:${original.id}:0`)
    await f.start({ planId: undefined, requestId: 'resume', resumeRunId: original.id })
    const resumed = await f.settled()
    expect(resumed.workerRunIds).toEqual(['worker-0'])
    expect(f.workerStart).toHaveBeenCalledTimes(1)
    expect(f.review.mock.calls[1]?.[0].workerRunIds).toEqual(['worker-0'])
  })

})
