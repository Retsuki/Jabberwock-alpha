import { describe, expect, it } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { SecurityTask, SecurityAsset } from '../src/security-records.ts'
import type { SecurityPlan } from '../src/planning-types.ts'
import type { SecurityExecutionRun } from '../src/execution-types.ts'
import type { SecurityWorkerRun } from '../src/worker-types.ts'
import { buildTaskActivity } from '../src/client/activity-model.ts'

const task: SecurityTask = { id: 'task', name: 'Review', description: '', objective: '', assetIds: [], status: 'draft', archived: false, pinned: false, createdAt: 0, updatedAt: 10 }
const asset: SecurityAsset = { id: 'asset', companyId: 'company', kind: 'domain', value: 'example.org' }
const owner = { workspaceId: 'workspace' as WorkspaceId, taskId: task.id }
const sessionId = 'session' as SessionId
const limits = { requestTimeoutMs: 100, responseBytes: 100, modelTimeoutMs: 100 }
const execution = { runs: [], limits: { maxRequests: 10, maxRounds: 3, timeoutMs: 100 } }
function plan(id: string): SecurityPlan {
  return { ...owner, id, requestId: id, sessionId, createdAt: 1, updatedAt: 2, status: 'ready', snapshot: { recordRevision: 1, task, assets: [asset], conversation: '' }, items: [{ id: 'same', title: 'Observe', purpose: 'Review', approach: 'HTTP', targetAssetIds: [asset.id], status: 'pending' }] }
}
function worker(id: string, planId: string): SecurityWorkerRun {
  return { ...owner, id, requestId: id, planId, itemId: 'same', assetId: asset.id, sessionId, status: 'completed', createdAt: 3, updatedAt: 4, snapshot: { recordRevision: 1, task, asset, item: plan(planId).items[0]!, model: { engine: 'claude', model: 'sonnet' }, url: 'https://example.org/', limits }, evidence: { url: 'https://example.org/', status: 200, headers: {}, body: 'Page', bytes: 4 }, summary: 'Model report' }
}
describe('Durable task activity projection', () => {
  it('places shared facts at their recorded publication time without inventing old timestamps', () => {
    const shared = { revision: 2, edges: [], nodes: [
      { id: 'fact:new', kind: 'fact' as const, summary: 'Observed denial', state: 'observed', assetIds: [], at: 0 },
      { id: 'fact:old', kind: 'fact' as const, summary: 'Legacy fact', state: 'observed', assetIds: [] },
    ] }
    const model = buildTaskActivity(task, [], { plans: [] }, { runs: [], limits }, execution, shared)
    expect(model.events).toHaveLength(1)
    expect(model.events[0]).toMatchObject({ nodeId: 'fact:new', kind: 'fact', at: 0 })
    expect(model.nodes.find(node => node.id === 'fact:old')?.payload.timestampUnavailable).toBe(true)
  })
  it('keeps an empty task empty and ignores unrelated workspace assets', () => {
    expect(buildTaskActivity(task, [asset], { plans: [] }, { runs: [], limits }, execution)).toEqual({ nodes: [], edges: [], events: [] })
  })
  it('uses current goal snapshots without inventing goal achievement or creation events', () => {
    const model = buildTaskActivity({ ...task, objective: 'Check', goals: [{ id: 'g', text: 'Goal' }] }, [], { plans: [] }, { runs: [], limits }, execution)
    expect(model.nodes.map(node => node.status)).toEqual(['recorded', 'recorded'])
    expect(model.events).toEqual([])
    expect(model.nodes.every(node => node.payload.snapshot === true)).toBe(true)
  })
  it('keeps repeated item IDs distinct and connects only saved review references', () => {
    const first = plan('p1'), second = plan('p2')
    second.snapshot.previousPlanId = first.id
    second.snapshot.workerRunIds = ['w1', 'missing']
    const model = buildTaskActivity(task, [], { plans: [second, first] }, { runs: [worker('w1', first.id)], limits }, execution)
    expect(model.nodes.filter(node => node.kind === 'intent')).toHaveLength(2)
    expect(model.edges).toContainEqual(expect.objectContaining({ source: 'worker:w1', target: 'plan:p2', kind: 'reviews' }))
    expect(model.edges).toContainEqual(expect.objectContaining({ source: 'plan:p1', target: 'plan:p2', kind: 'replans' }))
    const ids = new Set(model.nodes.map(node => node.id))
    expect(model.edges.every(edge => ids.has(edge.source) && ids.has(edge.target))).toBe(true)
    expect(model.nodes.some(node => node.kind === 'fact' && node.payload.recordType === 'http-observation')).toBe(true)
    expect(model.nodes.some(node => node.kind === 'goal' || node.payload.recordType === 'finding')).toBe(false)
  })
  it('retains legacy reports and public owner input without duplicating a recorded report', () => {
    const run = worker('w', 'p')
    const legacy = buildTaskActivity(task, [], { plans: [] }, { runs: [run], limits }, execution)
    expect(legacy.events.some(event => event.payload.legacy === true)).toBe(true)
    run.transcript = [{ id: 'user', kind: 'user', text: 'Explain', createdAt: 5 }, { id: 'report', kind: 'report', text: run.summary!, createdAt: 6 }]
    const model = buildTaskActivity(task, [], { plans: [] }, { runs: [run], limits }, execution)
    expect(model.events.filter(event => event.title === 'Model report')).toHaveLength(1)
    expect(model.events.find(event => event.title === 'Explain')?.source).toBe('owner')
    expect(model.events.some(event => event.payload.recordType === 'http-observation')).toBe(false)
  })
  it('has stable IDs across input order and Worker lifecycle updates', () => {
    const p1 = plan('p1'), p2 = plan('p2'), run = worker('w', p1.id)
    const first = buildTaskActivity(task, [], { plans: [p1, p2] }, { runs: [run], limits }, execution)
    expect(buildTaskActivity(task, [], { plans: [p2, p1] }, { runs: [run], limits }, execution)).toEqual(first)
    run.status = 'failed'; run.error = 'Stopped'
    const updated = buildTaskActivity(task, [], { plans: [p1, p2] }, { runs: [run], limits }, execution)
    expect(updated.nodes.map(node => node.id)).toEqual(first.nodes.map(node => node.id))
    expect(updated.nodes.find(node => node.id === 'worker:w')?.status).toBe('failed')
  })
  it('keeps separate executions linked only to their own saved plans and Workers', () => {
    const executions: SecurityExecutionRun[] = ['one', 'two'].map((id, index) => ({
      ...owner, id, requestId: id, status: 'completed', createdAt: index, updatedAt: index + 1, round: 1,
      planIds: [id], workerRunIds: [id], events: [{ at: index, kind: 'started', message: id }],
      snapshot: { recordRevision: 1, task, assets: [asset], targets: [], limits: execution.limits },
    }))
    const model = buildTaskActivity(task, [], { plans: executions.map(run => plan(run.id)) },
      { runs: executions.map(run => worker(run.id, run.id)), limits }, { ...execution, runs: executions })
    expect(model.edges).toContainEqual(expect.objectContaining({ source: 'execution:one', target: 'worker:one' }))
    expect(model.edges.some(edge => edge.source === 'execution:one' && edge.target === 'worker:two')).toBe(false)
    expect(model.events.filter(event => event.payload.recordType === 'execution-event')).toHaveLength(2)
    expect(model.nodes.filter(node => node.kind === 'intent').every(node => node.status === 'completed')).toBe(true)
  })
  it('keeps the original completion timestamp after later owner conversations', () => {
    const run = worker('w', 'p')
    run.transcript = [{ id: 'w-report', kind: 'report', text: 'Initial report', createdAt: 4 },
      { id: 'later', kind: 'user', text: 'More', createdAt: 20 }]
    run.updatedAt = 30
    const model = buildTaskActivity(task, [], { plans: [] }, { runs: [run], limits }, execution)
    expect(model.events.find(event => event.id === 'event:worker%3Aw:settled')?.at).toBe(4)
    expect(model.events.find(event => event.id === 'event:worker%3Aw:settled')?.payload.timestampUnavailable).toBe(false)
  })
  it('keeps complete message text outside its bounded preview and does not backdate a later review', () => {
    const p = plan('p'); p.reviewSummary = 'Later review'
    const run = worker('w', 'p')
    const text = 'x'.repeat(1000)
    run.transcript = [{ id: 'log', kind: 'log', text, createdAt: 3 }]
    const model = buildTaskActivity(task, [], { plans: [p] }, { runs: [run], limits }, execution)
    const message = model.events.find(event => event.payload.messageKind === 'log')
    expect(message?.title).toHaveLength(160)
    expect(message?.payload.text).toBe(text)
    expect(model.events.find(event => event.payload.recordType === 'plan-started')?.title).toBe(task.name)
  })
  it('excludes records whose task identity differs', () => {
    const p = plan('other'); p.taskId = 'other'
    const run = worker('other', 'other'); run.snapshot = { ...run.snapshot, task: { ...task, id: 'other' } }
    expect(buildTaskActivity(task, [], { plans: [p] }, { runs: [run], limits }, execution).nodes).toEqual([])
  })
  it('replaces legacy knowledge once and keeps public logs distinct from supported facts', () => {
    const run = worker('w', 'p')
    run.transcript = [{ id: 'log', kind: 'log', text: 'Tool output', createdAt: 4 }]
    const model = buildTaskActivity(task, [], { plans: [plan('p')] }, { runs: [run], limits }, execution, {
      revision: 2, nodes: [
        { id: 'goal:objective', kind: 'goal', summary: 'Check exposure', state: 'open', assessment: 'supported', assetIds: [] },
        { id: 'investigation:p:same', kind: 'investigation', summary: 'Observe', state: 'completed', assetIds: ['asset'], source: { planId: 'p', itemId: 'same' } },
        { id: 'observation:w:0', kind: 'observation', summary: 'GET response', state: 'recorded', assetIds: ['asset'], source: { workerRunId: 'w', observationIndex: 0 } },
        { id: 'fact:w:f', kind: 'fact', summary: 'Observed header', state: 'observed', assetIds: ['asset'], source: { workerRunId: 'w' } },
        { id: 'finding:f', kind: 'finding', summary: 'Reported exposure', state: 'open', assetIds: ['asset'], source: { workerRunId: 'w', findingId: 'f' } },
        { id: 'hint:p:0', kind: 'hint', summary: 'Try another page', state: 'unverified', assetIds: [], source: { planId: 'p' } },
        { id: 'missing', kind: 'hint', summary: 'Source unavailable', state: 'unknown', assetIds: [] },
      ], edges: [{ from: 'observation:w:0', to: 'fact:w:f', relation: 'supports' },
        { from: 'fact:w:f', to: 'goal:objective', relation: 'supports' }],
    })
    expect(model.nodes.filter(node => node.kind === 'intent')).toHaveLength(1)
    expect(model.nodes.filter(node => node.kind === 'fact').map(node => node.title)).toEqual(['Observed header'])
    expect(model.nodes.find(node => node.payload.messageKind === 'log')?.kind).toBe('message')
    expect(model.nodes.find(node => node.id === 'goal:objective')?.status).toBe('supported')
    expect(model.nodes.find(node => node.id === 'missing')?.status).toBe('unverified')
    expect(model.nodes.find(node => node.kind === 'hint' && node.id !== 'missing')?.status).toBe('unverified')
    expect(model.edges).toContainEqual(expect.objectContaining({ source: 'observation:w:0', target: 'fact:w:f', kind: 'supports' }))
    expect(model.events.some(event => event.payload.recordType === 'shared-knowledge')).toBe(false)
    expect(model.nodes.some(node => node.payload.recordType === 'http-observation')).toBe(false)
    expect(model.events.some(event => event.nodeId === 'investigation:p:same' && event.title === 'Observe')).toBe(true)
  })
})
