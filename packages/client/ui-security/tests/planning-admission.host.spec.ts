import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { Context } from '@deepseek-ai/cordis'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SecuritySetupService } from '../src/security-setup.ts'
import { SecurityPlanningService } from '../src/security-planning.ts'
import type { SecurityPlan } from '../src/planning-types.ts'
import type { SecurityRecords, SecurityTask } from '../src/security-records.ts'

const contexts: Context[] = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })
const workspaceId = 'workspace' as WorkspaceId
const sessionId = SessionId('main-security')
const identity = { workspaceId, taskId: 'task' }
const task: SecurityTask = {
  id: 'task', name: 'Review', objective: 'Review access', description: '', status: 'draft', assetIds: ['asset'],
  agentModelModes: { planner: 'fixed', worker: 'fixed' }, archived: false, pinned: false, createdAt: 1, updatedAt: 1,
  setup: { completionCondition: 'Summarize access settings', permission: { confirmed: true, assetIds: ['asset'] },
    scope: { confirmed: true, assetIds: ['asset'], rules: '[]' }, operations: { confirmed: true, constraints: '[]' }, limits: 'Stop after ten minutes' },
}

interface Options {
  savedPlans?: SecurityPlan[]
  plannerAnswers?: string[]
  noEventsOnTurn?: number
  plannerTimeoutMs?: number
  onPlannerTurn?: (turn: number) => Promise<void>
  plannerAnswer?: string
  action?: boolean
  investigation?: boolean
  ownerAction?: boolean
  ownerInput?: boolean
  patch?: boolean
  incomplete?: boolean
  conflict?: boolean
}
async function fixture(options: Options = {}) {
  const ctx = new Context()
  contexts.push(ctx)
  let records: SecurityRecords = { workspaceId, revision: options.conflict ? 2 : 1, companies: [], assets: [{ id: 'asset', companyId: 'company', kind: 'domain', value: 'example.org' }],
    tasks: [structuredClone(options.incomplete ? { ...task, objective: '' } : task)] }
  const output = { raw: '', turn: 1, step: 1, completed: false, baseRevision: 1, input: '', ownerInput: options.ownerInput ?? true, ...options.ownerAction === false ? {} : { ownerAction: options.investigation ? 'start-investigation' : 'start-planner' },
    ...options.action === false ? {} : { action: { kind: options.investigation ? 'start-investigation' : 'start-planner' } },
    ...options.patch ? { proposal: { id: 'proposal', reply: 'Planning requested', patch: { description: 'Saved before planning' }, baseRevision: 1, createdAt: 1, status: 'pending' } } : {},
  }
  const setupRows = new Map<string, object>([[JSON.stringify([workspaceId, 'task']), {
    ...identity, sessionId, beginId: 'begin', locale: 'ja', outputs: [output], confirmations: [],
  }]])
  const plans = new Map<string, object>(options.savedPlans?.map(plan => [plan.id, structuredClone(plan)]))
  const executionStart = vi.fn(async (request: { expectedRevision: number }) => {
    expect(request.expectedRevision).toBe(records.revision); return { runs: [] }
  })
  const executionRead = vi.fn(() => ({ runs: [] as object[] }))
  ctx.provide('securityExecution', { start: executionStart, read: executionRead } as never)
  ctx.provide('securityControl', { execute: async (request: { action: string; expectedRevision: number }) => {
    expect(request.action).toBe('start')
    return executionStart(request)
  } } as never)
  ctx.provide('storageDomain', { open: async (spec: { name: string }) => {
    const map = spec.name === 'jabberwock_security_setup' ? setupRows : plans
    return { table: () => ({ entries: () => map.entries(), get: (key: string) => map.get(key),
      put: async (key: string, value: object) => { map.set(key, value) },
    }), close: async () => {} }
  } } as never)
  const saved = vi.fn(async (request: { expectedRevision: number; tasks: SecurityTask[] }) => {
    if (request.expectedRevision !== records.revision) throw new Error('Conflict')
    records = { ...records, tasks: request.tasks, revision: records.revision + 1 }
    return records
  })
  ctx.provide('securityRecords', { read: () => structuredClone(records), save: saved } as never)
  const idle = vi.fn(async () => {})
  const mainAgent = { status: 'idle', whenIdle: idle, cancel: () => {}, session: { deriveMessages: () => [] } }
  const plannerFollowup = vi.fn<(message: UserMessage) => void>()
  const plannerCancel = vi.fn()
  const create = vi.fn(async (request: { sessionId: SessionId }) => {
    if (options.plannerAnswer === undefined && options.plannerAnswers === undefined) throw new Error('Fixture stops before any model request')
    let turn = 0
    return { agent: {
      followup: plannerFollowup, cancel: plannerCancel,
      whenIdle: async () => {
        turn++
        await options.onPlannerTurn?.(turn)
        if (options.noEventsOnTurn === turn) return
        ctx.emit('session/event', { id: request.sessionId } as never, { type: 'step/start' } as SessionEvent)
        ctx.emit('session/event', { id: request.sessionId } as never, { type: 'turn/end', data: { reason: { kind: 'completed' } } } as SessionEvent)
      },
      session: { deriveMessages: () => [{ role: 'assistant', content: [{ type: 'text', text: options.plannerAnswers?.[turn - 1] ?? options.plannerAnswer }] }] },
    }, dispose: async () => {} } as never
  })
  ctx.provide('agents', { get: (id: string) => id === sessionId ? mainAgent : undefined, create } as never)
  const workerRead = vi.fn(() => ({ runs: [] as object[] }))
  ctx.provide('securityWorkers', { read: workerRead } as never)
  ctx.provide('sessions', {} as never)
  ctx.provide('workspaceRegistry', { get: () => ({ path: '/tmp' }) } as never)
  ctx.provide('securityConversations', { catalog: async () => ({ selection: { engine: 'claude', model: 'default' }, engines: [{ id: 'claude', name: 'Claude', models: [{ id: 'default', name: 'Default' }] }] }), open: async () => ({ sessionId }), assertSelectionSettled: () => {} } as never)
  ctx.provide('sessionPersistence', { flush: async () => {} } as never)
  ctx.provide('agentEngines', { register: () => () => {}, get: () => ({}) } as never)
  await ctx.plugin(SecuritySetupService)
  await ctx.plugin(SecurityPlanningService, { plannerTimeoutMs: options.plannerTimeoutMs ?? 1000, plannerResponseAttempts: 2 })
  const finish = async (completed = true) => {
    const event = { type: 'turn/end', data: { turn: 1, reason: { kind: completed ? 'completed' : 'cancelled' } } } as SessionEvent
    ctx.emit('session/event', { id: sessionId } as never, event)
    await vi.waitFor(async () => {
      const state = await ctx.securitySetup.read(identity)
      if (completed && options.action !== false) {
        expect(plans.size > 0 || executionStart.mock.calls.length > 0
          || state.plannerError !== undefined || state.saveError !== undefined).toBe(true)
      } else expect(idle).toHaveBeenCalledTimes(completed ? 1 : 0)
    })
  }
  return { ctx, finish, plans, saved, create, plannerFollowup, plannerCancel, idle, workerRead,
    executionStart, executionRead, records: () => records }
}

describe('Conversation-driven Planner admission', () => {
  it('admits a completed structured action once, including duplicate completion delivery', async () => {
    const f = await fixture()
    await f.finish()
    await f.finish()
    expect(f.plans.size).toBe(1)
    expect(f.create).toHaveBeenCalledTimes(1)
    expect([...f.plans.values()][0]).toMatchObject({ requestId: `setup-planner:${sessionId}:1:1`, snapshot: { recordRevision: 1 } })
  })
  it('saves a same-turn patch before capturing the Planner snapshot without asking another setup question', async () => {
    const f = await fixture({ patch: true })
    await f.finish()
    expect(f.saved).toHaveBeenCalledTimes(1)
    expect([...f.plans.values()][0]).toMatchObject({ snapshot: { recordRevision: 2, task: { description: 'Saved before planning' } } })
  })
  it('delegates investigation after the same-turn task patch is saved, without invoking planning-only', async () => {
    const f = await fixture({ investigation: true, patch: true })
    await f.finish(); await f.finish()
    expect(f.saved).toHaveBeenCalledTimes(1)
    expect(f.executionStart).toHaveBeenCalledWith(expect.objectContaining({ requestId: `setup-investigation:${sessionId}:1:1`, expectedRevision: 2 }))
    expect(f.plans.size).toBe(0); expect(f.create).not.toHaveBeenCalled()
  })
  it('rejects a model action without a captured current owner delegation', async () => {
    const f = await fixture({ investigation: true, ownerAction: false }); await f.finish()
    expect(f.executionStart).not.toHaveBeenCalled(); expect(f.create).not.toHaveBeenCalled()
  })
  it('does not start for a question without a structured action', async () => {
    const f = await fixture({ action: false })
    await f.finish()
    expect(f.plans.size).toBe(0)
    expect(f.create).not.toHaveBeenCalled()
  })
  it('does not start for cancelled or partial output', async () => {
    const f = await fixture({ patch: true })
    await f.finish(false)
    expect(f.plans.size).toBe(0)
    expect(f.saved).not.toHaveBeenCalled()
  })
  it.each([{ incomplete: true }, { ownerInput: false }, { conflict: true }])('rejects unsafe admission and exposes a localized failure: %j', async (options) => {
    const f = await fixture(options)
    await f.finish()
    expect(f.plans.size).toBe(0)
    expect((await f.ctx.securitySetup.read(identity)).plannerError).toContain('プランナーを起動できませんでした')
  })
  it('does not start after an autosave conflict', async () => {
    const f = await fixture({ patch: true, conflict: true })
    await f.finish()
    expect(f.plans.size).toBe(0)
    expect((await f.ctx.securitySetup.read(identity)).saveError).toContain('設定の保存')
    expect(f.records().revision).toBe(2)
  })
})

describe('Planner result review admission', () => {
  const review = { ...identity, requestId: 'review', expectedRevision: 1, planId: 'previous', workerRunIds: ['worker'], approvedTargets: [{ assetId: 'asset', url: 'https://example.org/' }] }
  async function ready(plannerAnswer?: string) {
    const f = await fixture({ action: false, ...(plannerAnswer === undefined ? {} : { plannerAnswer }) })
    f.plans.set('previous', { ...identity, id: 'previous', requestId: 'initial', status: 'ready', sessionId: SessionId('previous-session'), createdAt: 1, updatedAt: 1,
      snapshot: { task, assets: [], conversation: '', recordRevision: 1 }, items: [] })
    f.workerRead.mockReturnValue({ runs: [{ id: 'worker', planId: 'previous', itemId: 'item', assetId: 'asset', status: 'completed', snapshot: { url: 'https://example.org/', limits: { responseBytes: 65536 } }, evidence: { url: 'https://example.org/', status: 200, headers: {}, body: 'authoritative', bytes: 13 }, summary: 'Observed' }] })
    return f
  }
  async function pendingFixture() {
    const f = await ready('unused')
    const previous = f.ctx.securityPlanning.read(identity).plans.find(plan => plan.id === 'previous')!
    const first = { id: 'item', title: 'Initial objective', purpose: 'Observe', approach: 'GET', targetAssetIds: ['asset'], status: 'pending' as const,
      operation: { kind: 'http-get' as const, assetId: 'asset', url: 'https://example.org/' } }
    const pending = { ...first, id: 'pending', title: 'Different objective', purpose: 'Check authorization' }
    f.plans.set('previous', { ...previous, snapshot: { ...previous.snapshot, assets: f.records().assets }, items: [first, pending] })
    const evidence = { url: 'https://example.org/', method: 'GET', status: 200, headers: {}, body: 'authoritative', bytes: 13 }
    const rows = [{ ...identity, id: 'worker', planId: 'previous', itemId: first.id, assetId: 'asset', status: 'completed', createdAt: 1, updatedAt: 1,
      snapshot: { url: 'https://example.org/', recordRevision: 1, item: first, limits: { responseBytes: 65536 } },
      evidence, observations: [evidence, { ...evidence, url: 'https://example.org/observed', method: 'HEAD' }], httpRequests: 2,
      findings: [{ title: 'Exposure', summary: 'Observed', severity: 'high', proof: 'authoritative', remediation: 'Fix' }], findingObservationIndexes: [0],
    }]
    f.workerRead.mockImplementation(() => ({ runs: structuredClone(rows) }))
    const respond = (answer: object, ...corrections: object[]) => {
      const answers = [answer, ...corrections]
      let index = 0
      return f.create.mockImplementationOnce(async (request: { sessionId: SessionId }) => ({ agent: {
        followup: f.plannerFollowup, cancel: f.plannerCancel,
        whenIdle: async () => {
          f.ctx.emit('session/event', { id: request.sessionId } as never, { type: 'step/start' } as SessionEvent)
          f.ctx.emit('session/event', { id: request.sessionId } as never, { type: 'turn/end', data: { reason: { kind: 'completed' } } } as SessionEvent)
        },
        session: { deriveMessages: () => [{ role: 'assistant', content: [{ type: 'text', text: JSON.stringify(answers[Math.min(index++, answers.length - 1)]) }] }] },
      }, dispose: async () => {} }) as never)
    }
    const wait = async (requestId: string) => {
      await vi.waitFor(() => { expect(f.ctx.securityPlanning.read(identity).plans.find(plan => plan.requestId === requestId)?.status).not.toBe('planning') })
      const plan = f.ctx.securityPlanning.read(identity).plans.find(plan => plan.requestId === requestId)
      if (!plan) throw new Error('Review missing')
      return plan
    }
    return { ...f, first, pending, rows, respond, wait }
  }
  it('saves authoritative findings, real observed URLs, remaining budget and undispatched item identities', async () => {
    const f = await pendingFixture()
    f.executionRead.mockReturnValue({ runs: [{ id: 'execution', planIds: ['previous'], workerRunIds: ['worker'], round: 0,
      snapshot: { limits: { maxRequests: 2 } } }] })
    const findingRead = vi.fn(async () => ({ findings: [{ id: 'canonical', title: 'Exposure', severity: 'high', status: 'open',
      assetId: 'asset', workerRunId: 'worker', proof: 'authoritative', evidence: { url: 'https://example.org/', method: 'GET' } }] }))
    f.ctx.provide('securityFindings', { read: findingRead } as never)
    f.respond({ decision: 'needs-input', summary: 'Budget used; pending authorization check remains', items: [] })
    await f.ctx.securityPlanning.review({ ...review, executionRunId: 'execution' })
    const saved = await f.wait('review')
    const snapshot: unknown = JSON.parse(saved.snapshot.observations ?? '{}')
    expect(snapshot).toMatchObject({ execution: { httpUsed: 2, httpRemaining: 0, stopReason: 'http-budget' },
      unresolvedItems: [{ itemId: 'pending' }],
      runs: [{ findings: [{ proof: 'authoritative', observationIndex: 0, url: 'https://example.org/', method: 'GET' }] }],
      visitedObservations: [{ url: 'https://example.org/', method: 'GET' }, { url: 'https://example.org/observed', method: 'HEAD' }],
      findings: [{ id: 'canonical', severity: 'high' }],
    })
    expect(findingRead).toHaveBeenCalledOnce()
  })
  it.each([true, false])('captures cross-plan results and actual ongoing usage, including an unstarted request: %s', async (hasRequests) => {
    const f = await pendingFixture()
    const ancestor = f.ctx.securityPlanning.read(identity).plans[0]!
    f.plans.set('ancestor', { ...ancestor, id: 'ancestor', requestId: 'ancestor', items: [f.first] })
    f.plans.set('previous', { ...ancestor, snapshot: { ...ancestor.snapshot, previousPlanId: 'ancestor' } })
    const completed = { ...f.rows[0], planId: 'ancestor', requestId: 'completed-request' }
    const ongoing = { ...f.rows[0], id: 'ongoing', itemId: 'pending', requestId: 'ongoing-request', status: 'running',
      httpRequests: hasRequests ? 1 : undefined, summary: 'UNCONFIRMED', evidence: undefined, observations: undefined,
      snapshot: { ...f.rows[0]!.snapshot, item: f.pending } }
    f.workerRead.mockReturnValue({ runs: [completed, ongoing] })
    f.executionRead.mockReturnValue({ runs: [{ id: 'execution', planIds: ['ancestor', 'previous'],
      workerRunIds: ['worker', 'ongoing'], round: 1, snapshot: { limits: { maxRequests: 7 } },
      reviews: [{ requestId: 'review', previousPlanId: 'previous', workerRunIds: ['worker'] }],
      dispatches: [{ requestId: 'completed-request', planId: 'ancestor', itemId: 'item', assetId: 'asset', maxRequests: 2, settled: true },
        { requestId: 'ongoing-request', planId: 'previous', itemId: 'pending', assetId: 'asset', maxRequests: 5 }],
    }] })
    f.ctx.provide('securityFindings', { read: async () => ({ findings: [] }) } as never)
    f.respond({ decision: 'continue', summary: 'Wait', items: [] })
    await f.ctx.securityPlanning.review({ ...review, executionRunId: 'execution' })
    const saved = await f.wait('review')
    expect(saved).toMatchObject({ status: 'ready', reviewDecision: 'continue', items: [], snapshot: {
      executionReviewRequestId: 'review', workerRefs: [{ workerRunId: 'worker', planId: 'ancestor', itemId: 'item' }],
      ongoingWorkerRunIds: ['ongoing'],
    } })
    expect(JSON.parse(saved.snapshot.observations!)).toMatchObject({ runs: [{ id: 'worker' }],
      ongoingWorkers: [{ id: 'ongoing', objective: 'Different objective' }],
      execution: { httpUsed: hasRequests ? 3 : 2, httpReserved: hasRequests ? 4 : 5,
        httpRemaining: hasRequests ? 4 : 5, httpAvailable: 0 } })
  })
  it('rejects a review without its exact durable execution grant before creating an Agent', async () => {
    const f = await pendingFixture()
    f.executionRead.mockReturnValue({ runs: [{ id: 'execution', planIds: ['previous'], workerRunIds: ['worker'], reviews: [] }] })
    await expect(f.ctx.securityPlanning.review({ ...review, executionRunId: 'execution' })).rejects.toThrow('persisted execution grant')
    expect(f.create).not.toHaveBeenCalled()
  })
  it.each([true, false])('derives checkpoint reason from reviewed Workers, including an early important result: %s', async (includeImportant) => {
    const f = await pendingFixture()
    f.rows.push({ ...structuredClone(f.rows[0]!), id: 'normal', itemId: f.pending.id, findings: [],
      snapshot: { ...f.rows[0]!.snapshot, item: f.pending }, httpRequests: 1, createdAt: 2, updatedAt: 2 })
    f.executionRead.mockReturnValue({ runs: [{ id: 'execution', planIds: ['previous'], workerRunIds: ['worker', 'normal'], round: 0,
      snapshot: { limits: { maxRequests: 6 } } }] })
    f.ctx.provide('securityFindings', { read: async () => ({ findings: [] }) } as never)
    f.respond({ decision: 'needs-input', summary: 'Review saved results', items: [] })
    await f.ctx.securityPlanning.review({ ...review, executionRunId: 'execution', workerRunIds: includeImportant ? ['worker', 'normal'] : ['normal'] })
    const saved = await f.wait('review')
    const snapshot: unknown = JSON.parse(saved.snapshot.observations ?? '{}')
    expect(snapshot).toMatchObject({ execution: { stopReason: includeImportant ? 'important-finding' : 'batch-complete' } })
  })
  it('requires authoritative services when execution review is requested', async () => {
    const f = await pendingFixture()
    await expect(f.ctx.securityPlanning.review({ ...review, executionRunId: 'execution' })).rejects.toThrow('Authoritative execution')
    expect(f.create).not.toHaveBeenCalled()
  })
  it('does not complete a different objective merely because its start URL was observed', async () => {
    const f = await pendingFixture()
    f.respond({ decision: 'complete', summary: 'Everything complete', items: [] })
    await f.ctx.securityPlanning.review(review)
    const saved = await f.wait('review')
    expect(saved.reviewDecision).toBe('needs-input')
    const snapshot: unknown = JSON.parse(saved.snapshot.observations ?? '{}')
    expect(snapshot).toMatchObject({ unresolvedItems: [{ itemId: 'pending' }] })
  })
  it('keeps a failed objective unresolved when another objective succeeds at the same URL', async () => {
    const f = await pendingFixture()
    f.rows[0]!.status = 'failed'
    f.rows.push({ ...structuredClone(f.rows[0]!), id: 'other-objective', itemId: f.pending.id, status: 'completed',
      snapshot: { ...f.rows[0]!.snapshot, item: f.pending }, createdAt: 2, updatedAt: 2 })
    f.respond({ decision: 'complete', summary: 'Same URL was observed', items: [] })
    await f.ctx.securityPlanning.review({ ...review, workerRunIds: ['worker', 'other-objective'] })
    const saved = await f.wait('review')
    expect(saved.reviewDecision).toBe('needs-input')
    const snapshot: unknown = JSON.parse(saved.snapshot.observations ?? '{}')
    expect(snapshot).toMatchObject({ unresolvedItems: [{ itemId: 'item' }] })
  })
  it('carries an unchanged pending item and resolves the old gap only after its real descendant Worker completes', async () => {
    const f = await pendingFixture()
    const { id: _id, status: _status, ...unchanged } = f.pending
    f.respond({ decision: 'continue', summary: 'Finish pending work', items: [{ ...unchanged, continuesItemId: 'pending' }] })
    await f.ctx.securityPlanning.review(review)
    const continued = await f.wait('review')
    const item = continued.items[0]!
    expect(item.carriedFrom).toEqual({ planId: 'previous', itemId: 'pending' })
    if (!item.operation) throw new Error('Continued operation missing')
    f.rows.push({ ...structuredClone(f.rows[0]!), id: 'descendant', planId: continued.id, itemId: item.id,
      snapshot: { ...f.rows[0]!.snapshot, item: { ...f.pending, ...item, operation: item.operation } }, createdAt: 2, updatedAt: 2 })
    f.respond({ decision: 'complete', summary: 'Both objectives observed', items: [] })
    await f.ctx.securityPlanning.review({ ...review, requestId: 'second-review', planId: continued.id, workerRunIds: ['descendant'] })
    const completed = await f.wait('second-review')
    expect(completed.reviewDecision).toBe('complete')
    const snapshot: unknown = JSON.parse(completed.snapshot.observations ?? '{}')
    expect(snapshot).toMatchObject({ unresolvedItems: [] })
  })
  it('rejects a continuation reference whose investigation purpose was changed', async () => {
    const f = await pendingFixture()
    const { id: _id, status: _status, ...changed } = f.pending
    f.respond({ decision: 'continue', summary: 'Changed work', items: [{ ...changed, purpose: 'Another objective', continuesItemId: 'pending' }] })
    await f.ctx.securityPlanning.review(review)
    const result = await f.wait('review')
    expect(result.status).toBe('failed')
    expect(result.error).toContain('Continuation must reference one unresolved unchanged investigation item')
    expect(f.plannerFollowup).toHaveBeenCalledTimes(2)
  })
  it('corrects a changed continuation before saving its unchanged lineage', async () => {
    const f = await pendingFixture()
    const { id: _id, status: _status, ...unchanged } = f.pending
    f.respond({ decision: 'continue', summary: 'Changed work', items: [{ ...unchanged, approach: 'Changed method', continuesItemId: 'pending' }] },
      { decision: 'continue', summary: 'Carry unchanged work', items: [{ ...unchanged, continuesItemId: 'pending' }] })
    await f.ctx.securityPlanning.review(review)
    const saved = await f.wait('review')
    expect(saved).toMatchObject({ status: 'ready', items: [{ approach: unchanged.approach, carriedFrom: { planId: 'previous', itemId: 'pending' } }] })
    expect(f.plannerFollowup).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(f.plannerFollowup.mock.calls[1])).toContain('copy all original fields exactly')
  })
  it.each(['unknown', 'item'])('rejects a continuation without an unresolved reference: %s', async (continuesItemId) => {
    const f = await pendingFixture()
    const { id: _id, status: _status, ...unchanged } = f.pending
    f.respond({ decision: 'continue', summary: 'Invalid reference', items: [{ ...unchanged, continuesItemId }] })
    await f.ctx.securityPlanning.review(review)
    expect(await f.wait('review')).toMatchObject({ status: 'failed', items: [] })
    expect(f.plannerFollowup).toHaveBeenCalledTimes(2)
  })
  it('captures authoritative evidence and exact targets once', async () => {
    const f = await ready()
    await f.ctx.securityPlanning.review(review)
    await f.ctx.securityPlanning.review(review)
    expect(f.create).toHaveBeenCalledTimes(1)
    const saved = [...f.plans.values()].find(value => 'requestId' in value && value.requestId === 'review')
    expect(saved).toMatchObject({ snapshot: { previousPlanId: 'previous', workerRunIds: ['worker'], approvedTargets: review.approvedTargets } })
    expect(JSON.stringify(saved)).toContain('authoritative')
  })
  it.each(['missing', 'running', 'other-plan'])('rejects unowned or nonterminal evidence: %s', async (status) => {
    const f = await ready()
    if (status === 'missing') f.workerRead.mockReturnValue({ runs: [] })
    else f.workerRead.mockReturnValue({ runs: [{ id: 'worker', planId: status === 'other-plan' ? 'other' : 'previous', status }] })
    await expect(f.ctx.securityPlanning.review(review)).rejects.toThrow('terminal Worker')
    expect(f.create).not.toHaveBeenCalled()
  })
  it('allows an empty initial capability adaptation and rejects unapproved assets', async () => {
    const f = await ready()
    await expect(f.ctx.securityPlanning.review({ ...review, workerRunIds: [], approvedTargets: [{ assetId: 'other', url: 'https://example.org/' }] })).rejects.toThrow('approved targets')
    await f.ctx.securityPlanning.review({ ...review, workerRunIds: [] })
    expect(f.create).toHaveBeenCalledTimes(1)
  })
  it.each(['{unfinished}{duplicated}', JSON.stringify({ decision: 'continue', summary: 'Observe', items: [{ operation: { kind: 'http-get', assetId: 'asset', url: 'https://example.org/' }, modelDecision: { engine: 'claude', model: 'default', reason: 'Available' } }] })])('repairs malformed review items using the full review contract: %s', async (invalid) => {
    const f = await ready('unused')
    let response = 0
    f.create.mockImplementationOnce(async (request: { sessionId: SessionId }) => ({ agent: {
      followup: f.plannerFollowup, cancel: f.plannerCancel,
      whenIdle: async () => {
        response++
        f.ctx.emit('session/event', { id: request.sessionId } as never, { type: 'step/start' } as SessionEvent)
        f.ctx.emit('session/event', { id: request.sessionId } as never, { type: 'turn/end', data: { reason: { kind: 'completed' } } } as SessionEvent)
      },
      session: { deriveMessages: () => [{ role: 'assistant', content: [{ type: 'text', text: response === 1 ? invalid : JSON.stringify({ decision: 'continue', summary: 'Observe next response', items: [{ title: 'Next', purpose: 'Observe', approach: 'GET', targetAssetIds: ['asset'], operation: { kind: 'http-get', assetId: 'asset', url: 'https://example.org/' } }] }) }] }] },
    }, dispose: async () => {} }) as never)
    await f.ctx.securityPlanning.review(review)
    await vi.waitFor(() => { expect(f.ctx.securityPlanning.read(identity).plans.find(plan => plan.requestId === 'review')?.status).toBe('ready') })
    expect(f.plannerFollowup).toHaveBeenCalledTimes(2)
    const prompt = JSON.stringify(f.plannerFollowup.mock.calls[0])
    expect(prompt).toContain('REVIEW MODE')
    expect(prompt).not.toContain('Return 1 to 30 useful items')
    expect(prompt).not.toContain('without redirects, authentication, query parameters or payloads')
    expect(prompt).toContain('multiple scoped HTTP calls, including query parameters')
    expect(prompt).toContain('Non-GET, authenticated operations and offline analysis require explicit saved permissions and operation approval')
    expect(prompt).toContain('Assign investigation objectives rather than one item per individual request')
    const correction = JSON.stringify(f.plannerFollowup.mock.calls[1])
    expect(correction).toContain('all original target, model and operation restrictions still apply')
    for (const message of [prompt, correction]) {
      for (const field of ['title', 'purpose', 'approach', 'targetAssetIds', 'operation', 'summary', 'decision']) expect(message).toContain(field)
      expect(message).toContain('Review continuation example')
      expect(message).toContain('Terminal review examples')
      expect(message).not.toContain('Initial plan example')
    }
    expect(f.ctx.securityPlanning.read(identity).plans.find(plan => plan.requestId === 'review')?.items[0]).toMatchObject({ title: 'Next', targetAssetIds: ['asset'] })
  })
  it('delivers the tool-using Worker capability description in the model request', async () => {
    const f = await ready(JSON.stringify({ decision: 'complete', summary: 'Observed the requested response', items: [] }))
    await f.ctx.securityPlanning.review(review)
    await vi.waitFor(() => { expect(f.plannerFollowup).toHaveBeenCalledOnce() })
    const message = f.plannerFollowup.mock.calls[0]?.[0]
    const text = message?.content.filter(part => part.type === 'text').map(part => part.text).join('')
    if (!text) throw new Error('Planner input text missing')
    const start = text.indexOf('Each item launches a tool-using Worker')
    const end = text.indexOf('\n\nWorker model selection:', start)
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    expect(text.slice(start, end)).toMatchInlineSnapshot('"Each item launches a tool-using Worker from the supplied HTTP URL. Workers can follow observed links and make multiple scoped HTTP calls, including query parameters. Non-GET, authenticated operations and offline analysis require explicit saved permissions and operation approval. Native tools, unrestricted shell and external capabilities are unavailable. Assign investigation objectives rather than one item per individual request. Describe unsupported investigation needs clearly rather than pretending they can be executed."')
  })
  it('persists a terminal decision with no next items and does not dispatch tools', async () => {
    const f = await ready(JSON.stringify({ decision: 'complete', summary: 'Observed the requested response', items: [] }))
    await f.ctx.securityPlanning.review(review)
    await vi.waitFor(() => { expect(f.ctx.securityPlanning.read(identity).plans.find(plan => plan.requestId === 'review')).toMatchObject({ status: 'ready', reviewDecision: 'complete', items: [] }) })
  })
  it('fails a continuation outside exact approved targets', async () => {
    const f = await ready(JSON.stringify({ decision: 'continue', summary: 'Next', items: [{ title: 'Next', purpose: 'Observe', approach: 'GET', targetAssetIds: ['asset'], operation: { kind: 'http-get', assetId: 'asset', url: 'https://other.example/' } }] }))
    await f.ctx.securityPlanning.review(review)
    await vi.waitFor(() => { expect(f.ctx.securityPlanning.read(identity).plans.find(plan => plan.requestId === 'review')).toMatchObject({ status: 'failed' }) })
  })
  it.each(['https://example.org/', 'https://www.example.org/status'])('accepts Planner-selected registered asset URL without exact target approval: %s', async (url) => {
    const f = await ready(JSON.stringify({ decision: 'continue', summary: 'Observe selected asset', items: [{ title: 'Next', purpose: 'Observe', approach: 'GET', targetAssetIds: ['asset'], operation: { kind: 'http-get', assetId: 'asset', url } }] }))
    await f.ctx.securityPlanning.review({ ...review, targetMode: 'asset-scope', approvedTargets: [] })
    await vi.waitFor(() => { expect(f.ctx.securityPlanning.read(identity).plans.find(plan => plan.requestId === 'review')).toMatchObject({ status: 'ready', snapshot: { targetMode: 'asset-scope' }, items: [{ operation: { url } }] }) })
  })
  it('rejects Planner-selected URLs outside registered assets in asset-scope mode', async () => {
    const f = await ready(JSON.stringify({ decision: 'continue', summary: 'Next', items: [{ title: 'Next', purpose: 'Observe', approach: 'GET', targetAssetIds: ['asset'], operation: { kind: 'http-get', assetId: 'asset', url: 'https://unrelated.org/' } }] }))
    await f.ctx.securityPlanning.review({ ...review, targetMode: 'asset-scope', approvedTargets: [] })
    await vi.waitFor(() => {
      const result = f.ctx.securityPlanning.read(identity).plans.find(plan => plan.requestId === 'review')
      expect(result?.status).toBe('failed')
      expect(result?.error).toContain('registered hostname')
    })
  })

  it.each([{ acquisition: 'partial' }, { bodyTruncated: true }])('downgrades completion with coverage gaps: %j', async (metadata) => {
    const f = await ready(JSON.stringify({ decision: 'complete', summary: 'Everything is safe', items: [] }))
    f.workerRead.mockReturnValue({ runs: [{ id: 'worker', planId: 'previous', itemId: 'item', assetId: 'asset', status: 'completed', snapshot: { url: 'https://example.org/', limits: { responseBytes: 65536 } }, evidence: { url: 'https://example.org/', status: 200, headers: {}, body: 'observed', bytes: 8, ...metadata } }] })
    await f.ctx.securityPlanning.review(review)
    await vi.waitFor(() => { const saved = f.ctx.securityPlanning.read(identity).plans.find(plan => plan.requestId === 'review'); expect(saved).toMatchObject({ status: 'ready', reviewDecision: 'needs-input' }); expect(saved?.reviewSummary).not.toContain('Everything is safe') })
  })
  it('rejects claiming completion before any Worker evidence', async () => {
    const f = await ready(JSON.stringify({ decision: 'complete', summary: 'No work needed', items: [] }))
    await f.ctx.securityPlanning.review({ ...review, workerRunIds: [] })
    await vi.waitFor(() => { expect(f.ctx.securityPlanning.read(identity).plans.find(plan => plan.requestId === 'review')).toMatchObject({ status: 'ready', reviewDecision: 'needs-input' }) })
  })

})

describe('Planner response format correction', () => {
  const valid = JSON.stringify({ items: [{ title: 'Inspect', purpose: 'Observe', approach: 'GET', targetAssetIds: ['asset'] }] })
  const start = { ...identity, requestId: 'format-test' }
  it.each(['broken JSON', JSON.stringify({ items: [], unexpected: true })])('corrects invalid output in the same logged session: %s', async (invalid) => {
    const f = await fixture({ plannerAnswers: [invalid, valid] })
    await f.ctx.securityPlanning.start(start)
    await vi.waitFor(() => { expect(f.ctx.securityPlanning.read(identity).plans[0]?.status).toBe('ready') })
    expect(f.create).toHaveBeenCalledTimes(1)
    expect(f.plannerFollowup).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(f.plannerFollowup.mock.calls[1])).toContain('response format correction')
  })
  it('does not request a second response when the first is valid', async () => {
    const f = await fixture({ plannerAnswer: valid })
    await f.ctx.securityPlanning.start(start)
    await vi.waitFor(() => { expect(f.ctx.securityPlanning.read(identity).plans[0]?.status).toBe('ready') })
    expect(f.plannerFollowup).toHaveBeenCalledTimes(1)
  })
  it('fails visibly when the finite response budget is exhausted', async () => {
    const f = await fixture({ plannerAnswers: ['broken', 'still broken'] })
    await f.ctx.securityPlanning.start(start)
    await vi.waitFor(() => { expect(f.ctx.securityPlanning.read(identity).plans[0]?.status).toBe('failed'); expect(f.ctx.securityPlanning.read(identity).plans[0]?.error).toContain('response format failed after 2 attempts') })
    expect(f.plannerFollowup).toHaveBeenCalledTimes(2)
  })
  it('does not reuse prior completion events for an incomplete correction', async () => {
    const f = await fixture({ plannerAnswers: ['broken', valid], noEventsOnTurn: 2 })
    await f.ctx.securityPlanning.start(start)
    await vi.waitFor(() => { expect(f.ctx.securityPlanning.read(identity).plans[0]).toMatchObject({ status: 'failed', error: 'Planner did not finish a complete response' }) })
    expect(f.plannerFollowup).toHaveBeenCalledTimes(2)
  })
  it('does not retry an operational failure during correction', async () => {
    const f = await fixture({ plannerAnswers: ['broken', valid], onPlannerTurn: async (turn) => { if (turn === 2) throw new Error('Provider connection failed') } })
    await f.ctx.securityPlanning.start(start)
    await vi.waitFor(() => { expect(f.ctx.securityPlanning.read(identity).plans[0]).toMatchObject({ status: 'failed', error: 'Provider connection failed' }) })
    expect(f.plannerFollowup).toHaveBeenCalledTimes(2)
  })
  it('rejects a repaired response with an unapproved asset without another repair', async () => {
    const f = await fixture({ plannerAnswers: ['broken', valid.replace('asset', 'unapproved')] })
    await f.ctx.securityPlanning.start(start)
    await vi.waitFor(() => { expect(f.ctx.securityPlanning.read(identity).plans[0]?.status).toBe('failed'); expect(f.ctx.securityPlanning.read(identity).plans[0]?.error).toContain('unknown or duplicate target') })
    expect(f.plannerFollowup).toHaveBeenCalledTimes(2)
  })
  it.each(['cancel', 'timeout'] as const)('cannot commit after %s during correction', async (stop) => {
    let release: (() => void) | undefined
    const blocked = new Promise<void>((resolve) => { release = resolve })
    const f = await fixture({ plannerAnswers: ['broken', valid], plannerTimeoutMs: stop === 'timeout' ? 30 : 1000,
      onPlannerTurn: async (turn) => { if (turn === 2) await blocked } })
    await f.ctx.securityPlanning.start(start)
    await vi.waitFor(() => { expect(f.plannerFollowup).toHaveBeenCalledTimes(2) })
    const cancelled = stop === 'cancel' ? f.ctx.securityPlanning.cancel(identity) : undefined
    if (stop === 'timeout') await vi.waitFor(() => { expect(f.plannerCancel).toHaveBeenCalled() })
    release?.()
    await cancelled
    await vi.waitFor(() => { expect(f.ctx.securityPlanning.read(identity).plans[0]?.status).toBe(stop === 'cancel' ? 'cancelled' : 'failed') })
    expect(f.ctx.securityPlanning.read(identity).plans[0]?.items).toEqual([])
  })
})

describe('Shared exploration Planner input and durable annotation repair', () => {
  const item = { title: 'Inspect a new lead', purpose: 'Confirm another objective', approach: 'Observe only', targetAssetIds: ['asset'] }
  const shared = { revision: 7, nodes: [{ id: 'goal:objective', kind: 'goal', summary: 'Review access', state: 'unverified', assetIds: ['asset'] }], edges: [] }
  it('captures immutable shared input in the logged prompt and maps response item indexes to saved identities', async () => {
    const f = await fixture({ plannerAnswer: JSON.stringify({ items: [item], explorationAnnotations: {
      investigationLinks: [{ itemIndex: 0, goalIds: ['goal:objective'], sourceNodeIds: [] }],
    } }) })
    const applyPlan = vi.fn(async () => shared)
    f.ctx.provide('securityExploration', { forPlanner: async () => structuredClone(shared), applyPlan } as never)
    await f.ctx.securityPlanning.start({ ...identity, requestId: 'shared-planner' })
    await vi.waitFor(() => { expect(applyPlan).toHaveBeenCalledOnce() })
    const saved = f.ctx.securityPlanning.read(identity).plans[0]!
    expect(JSON.parse(saved.snapshot.exploration!)).toEqual(shared)
    expect(saved.explorationAnnotations?.investigationLinks?.[0]?.itemId).toBe(saved.items[0]?.id)
    const message = f.plannerFollowup.mock.calls[0]![0]
    expect(JSON.stringify(message)).toContain('goal:objective')
    expect(JSON.stringify(message)).toContain('Read shared negative results')
    expect(applyPlan).toHaveBeenCalledWith(expect.objectContaining({ status: 'ready', id: saved.id }))
  })
  it('rejects task edits occurring during asynchronous shared snapshot capture', async () => {
    const f = await fixture({ plannerAnswer: JSON.stringify({ items: [item] }) })
    f.ctx.provide('securityExploration', { forPlanner: async () => {
      await f.saved({ expectedRevision: 1, tasks: [{ ...task, objective: 'Changed while capturing' }] })
      return shared
    } } as never)
    await expect(f.ctx.securityPlanning.start({ ...identity, requestId: 'capture-conflict' })).rejects.toThrow('Task changed')
    expect(f.create).not.toHaveBeenCalled()
    expect(f.plans.size).toBe(0)
  })
  it('keeps a validated ready plan when annotation application fails and clears only its repair error after retry', async () => {
    const f = await fixture({ plannerAnswer: JSON.stringify({ items: [item] }) })
    const applyPlan = vi.fn(async () => shared).mockRejectedValueOnce(new Error('Shared store unavailable'))
    f.ctx.provide('securityExploration', { forPlanner: async () => structuredClone(shared), applyPlan } as never)
    await f.ctx.securityPlanning.start({ ...identity, requestId: 'shared-repair' })
    await vi.waitFor(() => { expect(f.ctx.securityPlanning.read(identity).plans[0]?.error).toContain('requires repair') })
    const saved = f.ctx.securityPlanning.read(identity).plans[0]!
    expect(saved.status).toBe('ready')
    expect(saved.items).toHaveLength(1)
    await f.ctx.securityPlanning.repairExploration({ ...identity, planId: saved.id })
    expect(f.ctx.securityPlanning.read(identity).plans[0]?.error).toBeUndefined()
    expect(applyPlan).toHaveBeenCalledTimes(2)
    expect(f.create).toHaveBeenCalledOnce()
    await expect(f.ctx.securityPlanning.repairExploration({ ...identity, taskId: 'other', planId: saved.id })).rejects.toThrow()
  })
})

describe('Saved wait-only Planner review restart', () => {
  const waiting: SecurityPlan = { ...identity, id: 'waiting', requestId: 'review-waiting', sessionId: SessionId('waiting-session'),
    status: 'ready', createdAt: 1, updatedAt: 1, reviewDecision: 'continue', reviewSummary: 'Wait for captured Workers',
    snapshot: { recordRevision: 1, task, assets: [{ id: 'asset', companyId: 'company', kind: 'domain', value: 'example.org' }],
      conversation: '', previousPlanId: 'previous', ongoingWorkerRunIds: ['worker-one', 'worker-two'],
    }, stopWorkerRunIds: ['worker-one'], items: [],
  }
  it('reads a saved wait-only continuation with an unstopped captured Worker without starting inference', async () => {
    const f = await fixture({ savedPlans: [waiting] })
    expect(f.ctx.securityPlanning.read(identity).plans).toEqual([waiting])
    expect(f.create).not.toHaveBeenCalled()
  })
  it.each([
    { ...waiting, snapshot: { ...waiting.snapshot, previousPlanId: undefined }, stopWorkerRunIds: [] },
    { ...waiting, snapshot: { ...waiting.snapshot, ongoingWorkerRunIds: [] }, stopWorkerRunIds: [] },
    { ...waiting, stopWorkerRunIds: ['worker-one', 'worker-two'] },
    { ...waiting, stopWorkerRunIds: ['outside-worker'] },
    { ...waiting, stopWorkerRunIds: ['worker-one', 'worker-one'] },
  ])('rejects invalid empty initial plans or continuations without an available captured Worker', async (invalid) => {
    await expect(fixture({ savedPlans: [invalid] })).rejects.toThrow('Invalid security planning storage')
  })
})
