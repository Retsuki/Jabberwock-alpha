import { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { afterEach, describe, expect, it } from 'vitest'
import { SecurityExplorationService } from '../src/security-exploration.ts'
import type { SecurityAsset, SecurityRecords, SecurityTask } from '../src/security-records.ts'
import type { SecurityWorkerRun } from '../src/worker-types.ts'
import type { SecurityPlan, SecurityPlanItem } from '../src/planning-types.ts'

const contexts: Context[] = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })
const workspaceId = 'workspace' as WorkspaceId
const request = { workspaceId, taskId: 'task' }
async function fixture(table = new Map<string, unknown>(), explorationModelBytes = 65536) {
  const ctx = new Context()
  contexts.push(ctx)
  const task: SecurityTask = {
    id: 'task', name: 'Task', objective: 'Check access', description: '', status: 'draft', assetIds: ['asset'],
    goals: [{ id: 'access', text: 'Verify access controls' }], archived: false, pinned: false, createdAt: 1, updatedAt: 1,
  }
  const asset: SecurityAsset = { id: 'asset', companyId: 'company', kind: 'domain', value: 'example.org' }
  const records: SecurityRecords = { workspaceId, revision: 1, companies: [], assets: [asset], tasks: [task] }
  const items: SecurityPlanItem[] = ['one', 'two'].map((id, index) => ({ id, title: index === 0 ? 'First' : 'Second',
    purpose: 'Check access', approach: 'Read public response', targetAssetIds: ['asset'], status: 'pending' }))
  const workers: SecurityWorkerRun[] = items.map(item => ({ ...request, id: item.id, requestId: item.id,
    planId: 'plan', itemId: item.id, assetId: 'asset', sessionId: SessionId(`worker-${item.id}`),
    status: 'running', createdAt: 1, updatedAt: 1,
    snapshot: { recordRevision: 1, task, asset, item, model: { engine: 'claude', model: 'default' },
      url: 'https://example.org/', limits: { requestTimeoutMs: 1000, responseBytes: 65536, modelTimeoutMs: 1000 } },
    observations: [{ body: 'public page: access denied', url: 'https://example.org/', method: 'GET',
      status: 403, headers: {}, bytes: 26 }],
  }))
  const plan: SecurityPlan = { ...request, id: 'plan', requestId: 'plan-request', sessionId: SessionId('plan-session'),
    status: 'ready', createdAt: 1, updatedAt: 1, snapshot: { recordRevision: 1, task, assets: [asset], conversation: '' }, items }
  const plans = [plan]
  let puts = 0
  let failPut = false
  ctx.provide('securityRecords', { read: () => structuredClone(records) } as never)
  ctx.provide('securityWorkers', { read: () => ({ runs: structuredClone(workers) }) } as never)
  ctx.provide('securityPlanning', { read: () => ({ plans: structuredClone(plans) }) } as never)
  ctx.provide('workspaceRegistry', {} as never)
  ctx.provide('storageDomain', { open: async () => ({ table: () => ({ get: (key: string) => table.get(key),
    entries: () => table.entries(), put: async (key: string, value: unknown) => {
      if (failPut) { failPut = false; throw new Error('Simulated storage interruption') }
      puts++; table.set(key, structuredClone(value))
    },
  }), close: async () => {} }) } as never)
  await ctx.plugin(SecurityExplorationService, { explorationModelBytes })
  return { ctx, records, workers, plan, plans, table, puts: () => puts, failNextPut: () => { failPut = true } }
}
const fact = { requestId: 'fact', summary: 'Access denied on the public endpoint', observationIndexes: [0], quote: 'access denied' }
describe('Shared exploration source ownership', () => {
  it('projects old sources without fabricating facts or performing writes', async () => {
    const f = await fixture()
    const state = await f.ctx.securityExploration.read(request)
    expect(state.nodes.filter(node => node.kind === 'observation')).toHaveLength(2)
    expect(state.nodes.filter(node => node.kind === 'fact')).toHaveLength(0)
    expect(f.puts()).toBe(0)
  })
  it('preserves concurrent Worker results and retry identities across restart', async () => {
    const f = await fixture()
    await Promise.all(f.workers.map(run => f.ctx.securityExploration.bindWorker(run).publishFact(fact)))
    expect((await f.ctx.securityExploration.read(request)).nodes.filter(node => node.kind === 'fact')).toHaveLength(2)
    const g = await fixture(f.table)
    await g.ctx.securityExploration.bindWorker(g.workers[0]!).publishFact(fact)
    expect(g.puts()).toBe(0)
    expect((await g.ctx.securityExploration.read(request)).revision).toBe(2)
    await expect(g.ctx.securityExploration.bindWorker(g.workers[0]!).publishFact({ ...fact, summary: 'Changed' })).rejects.toThrow('retry identity')
  })
  it('rejects invented quotes, indexes and another task Worker', async () => {
    const f = await fixture()
    const capability = f.ctx.securityExploration.bindWorker(f.workers[0]!)
    await expect(capability.publishFact({ ...fact, quote: 'invented' })).rejects.toThrow('retained')
    await expect(capability.publishFact({ ...fact, observationIndexes: [100] })).rejects.toThrow('retained')
    f.workers[0] = { ...f.workers[0]!, taskId: 'other' }
    await expect(capability.publishFact(fact)).rejects.toThrow('unavailable')
    expect(f.puts()).toBe(0)
  })
  it('retains annotations but exposes unavailable original evidence as unknown', async () => {
    const f = await fixture()
    await f.ctx.securityExploration.bindWorker(f.workers[0]!).publishFact(fact)
    f.workers.splice(0)
    expect((await f.ctx.securityExploration.read(request)).nodes.find(node => node.kind === 'fact')?.state).toBe('unknown')
  })
  it('bounds the whole model result, preserves full owner reads and offers explicit source details', async () => {
    const f = await fixture(undefined, 1024)
    await f.ctx.securityExploration.bindWorker(f.workers[0]!).publishFact({ ...fact, summary: '長い主張'.repeat(500) })
    const owner = await f.ctx.securityExploration.read(request)
    const node = owner.nodes.find(value => value.kind === 'fact')!
    expect(node.detail).toBe('access denied')
    expect(node.at).toBeGreaterThan(0)
    const overview = await f.ctx.securityExploration.forPlanner(request)
    expect(Buffer.byteLength(JSON.stringify(overview))).toBeLessThanOrEqual(1024)
    expect(overview.truncated).toBe(true)
    expect(overview.nodes.length).toBeLessThan(owner.nodes.length)
    const detail = await f.ctx.securityExploration.bindWorker(f.workers[1]!).read({ nodeIds: [node.id] })
    expect(detail.nodes[0]?.id).toBe(node.id)
    expect(Buffer.byteLength(JSON.stringify(detail))).toBeLessThanOrEqual(1024)
    expect(detail.edges.every(edge => detail.nodes.some(value => value.id === edge.from)
      && detail.nodes.some(value => value.id === edge.to))).toBe(true)
  })
  it('uses source plan chronology rather than application order for goal assessment', async () => {
    const f = await fixture()
    const old = { ...f.plan, id: 'old', createdAt: 1, explorationAnnotations: {
      goalAssessments: [{ goalId: 'goal:access', assessment: 'supported' as const, supportNodeIds: ['observation:one:0'] }],
    } }
    const recent = { ...f.plan, id: 'recent', createdAt: 2, explorationAnnotations: {
      goalAssessments: [{ goalId: 'goal:access', assessment: 'contradicted' as const, supportNodeIds: ['observation:one:0'] }],
    } }
    f.plans.push(old, recent)
    await f.ctx.securityExploration.applyPlan(recent)
    await f.ctx.securityExploration.applyPlan(old)
    expect((await f.ctx.securityExploration.read(request)).nodes.find(node => node.id === 'goal:access')?.assessment).toBe('contradicted')
  })
  it('applies evidence-linked assessments once without mutating goals or execution, and invalidates stale settings', async () => {
    const f = await fixture()
    f.plan.explorationAnnotations = { goalAssessments: [{ goalId: 'goal:access', assessment: 'supported', supportNodeIds: ['observation:one:0'] }],
      investigationLinks: [{ itemId: 'two', goalIds: ['goal:access'], sourceNodeIds: ['observation:one:0'] }],
      hints: [{ summary: 'Review another access boundary', sourceNodeIds: [] }] }
    await f.ctx.securityExploration.applyPlan(f.plan)
    await f.ctx.securityExploration.applyPlan(f.plan)
    expect(f.puts()).toBe(1)
    expect(f.records.tasks[0]!.status).toBe('draft')
    expect((await f.ctx.securityExploration.read(request)).nodes.find(node => node.id === 'goal:access')?.assessment).toBe('supported')
    f.records.revision++
    expect((await f.ctx.securityExploration.read(request)).nodes.find(node => node.id === 'goal:access')?.assessment).toBe('unverified')
  })
  it.each(['access', 'goal:access'])('repairs saved ready plans with raw or canonical goal IDs: %s', async (goalId) => {
    const f = await fixture()
    f.plan.explorationAnnotations = {
      goalAssessments: [{ goalId, assessment: 'supported', supportNodeIds: ['observation:one:0'] }],
      investigationLinks: [{ itemId: 'two', goalIds: [goalId], sourceNodeIds: ['observation:one:0'] }],
    }
    const original = structuredClone(f.plan.explorationAnnotations)
    await f.ctx.securityExploration.applyPlan(f.plan)
    await f.ctx.securityExploration.applyPlan(f.plan)
    const shared = await f.ctx.securityExploration.read(request)
    expect(shared.nodes.find(node => node.id === 'goal:access')?.assessment).toBe('supported')
    expect(shared.edges).toContainEqual({ from: 'goal:access', to: 'investigation:plan:two', relation: 'derived-from' })
    expect(f.puts()).toBe(1)
    expect(f.plan.explorationAnnotations).toEqual(original)
    expect(JSON.stringify([...f.table.values()])).toContain('"goalId":"goal:access"')
  })
  it.each(['unknown', 'goal:unknown'])('rejects unknown raw and canonical task goals: %s', async (goalId) => {
    const f = await fixture()
    f.plan.explorationAnnotations = { investigationLinks: [{ itemId: 'two', goalIds: [goalId], sourceNodeIds: [] }] }
    await expect(f.ctx.securityExploration.applyPlan(f.plan)).rejects.toThrow('unknown task goal')
    expect(f.puts()).toBe(0)
  })
  it.each(['hint:invented', 'observation:another-task:0', 'goal:objective'])('rejects unsupported goal support %s atomically', async (id) => {
    const f = await fixture()
    f.plan.explorationAnnotations = { goalAssessments: [{ goalId: 'goal:access', assessment: 'supported', supportNodeIds: [id] }] }
    await expect(f.ctx.securityExploration.applyPlan(f.plan)).rejects.toThrow('unsupported')
    expect(f.puts()).toBe(0)
  })
  it('rejects stale new assessments and repairs a failed atomic save without duplicates', async () => {
    const f = await fixture()
    f.plan.explorationAnnotations = { goalAssessments: [{ goalId: 'goal:access', assessment: 'supported', supportNodeIds: ['observation:one:0'] }] }
    f.records.revision++
    await expect(f.ctx.securityExploration.applyPlan(f.plan)).rejects.toThrow('stale')
    expect(f.puts()).toBe(0)
    f.records.revision--
    f.failNextPut()
    await expect(f.ctx.securityExploration.applyPlan(f.plan)).rejects.toThrow('storage interruption')
    expect(f.puts()).toBe(0)
    await f.ctx.securityExploration.applyPlan(f.plan)
    expect(f.puts()).toBe(1)
  })
})
