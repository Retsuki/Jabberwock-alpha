import { describe, expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { buildSecurityReport, classifySecurityWorker } from '../src/report-model.ts'
import type { SecurityReportInput } from '../src/report-model.ts'
import type { SecurityWorkerRun } from '../src/worker-types.ts'
const task: SecurityReportInput['task'] = { id: 'task', name: 'Review', description: '', objective: 'Review', status: 'draft', assetIds: ['asset'], archived: false, pinned: false, createdAt: 1, updatedAt: 1 }
const identity = { workspaceId: 'workspace' as WorkspaceId, taskId: task.id }
const asset: SecurityReportInput['assets'][number] = { id: 'asset', companyId: 'company', kind: 'domain', value: 'example.org' }
const item: SecurityReportInput['plans'][number]['items'][number] = { id: 'item', title: 'Observe', purpose: 'Observe', approach: 'GET', targetAssetIds: ['asset'], status: 'pending', operation: { kind: 'http-get', assetId: 'asset', url: 'https://example.org/' } }
function fixture(): SecurityReportInput {
  const worker: SecurityWorkerRun = { ...identity, id: 'worker', requestId: 'worker-request', planId: 'plan', itemId: item.id, assetId: asset.id, sessionId: SessionId('worker'), status: 'completed', createdAt: 1, updatedAt: 2, snapshot: { task, asset, item, recordRevision: 1, model: { engine: 'claude', model: 'fake' }, url: 'https://example.org/', limits: { responseBytes: 64, requestTimeoutMs: 100, modelTimeoutMs: 100 } }, evidence: { url: 'https://example.org/', status: 200, headers: {}, body: 'observed', bytes: 8, acquisition: 'complete' }, findings: [] }
  return { task, assets: [asset], plans: [{ ...identity, id: 'plan', requestId: 'plan-request', sessionId: SessionId('plan'), status: 'ready', createdAt: 1, updatedAt: 1, snapshot: { task, assets: [asset], recordRevision: 1, conversation: '' }, items: [item] }], workers: [worker], executions: [{ ...identity, id: 'execution', requestId: 'execution-request', status: 'completed', createdAt: 1, updatedAt: 3, round: 1, planIds: ['plan'], workerRunIds: ['worker'], events: [], snapshot: { recordRevision: 1, task, assets: [asset], targets: [], limits: { maxRounds: 3, maxRequests: 10, timeoutMs: 1000 } } }], findings: [], retests: [] }
}
describe('saved investigation report', () => {
  it('reports zero findings separately from completed bounded operation coverage', () => {
    const report = buildSecurityReport(fixture())
    expect(report.coverage).toBe('complete'); expect(report.findings).toEqual([])
    expect(report.counts).toEqual({ confirmed: 1, partial: 0, unverified: 0, unsupported: 0 })
    expect(report.limitations).toEqual(['bounded-http'])
  })
  it.each([{ acquisition: 'partial' as const }, { bodyTruncated: true }, { acquisition: undefined, bytes: 64 }])('keeps a historically completed workflow incomplete when capture or analysis is partial: %j', (metadata) => {
    const input = fixture(); Object.assign(input.workers[0]!.evidence!, metadata)
    const report = buildSecurityReport(input)
    expect(report.execution?.status).toBe('completed'); expect(report.coverage).toBe('incomplete'); expect(report.counts.partial).toBe(1)
  })
  it('retains unsupported and never-dispatched proposals rather than calling them checked', () => {
    const input = fixture(); input.plans[0]!.items.push({ ...item, id: 'second', operation: undefined }, { ...item, id: 'third', operation: { ...item.operation!, url: 'https://example.org/other' } })
    const report = buildSecurityReport(input)
    expect(report.coverage).toBe('incomplete'); expect(report.counts.unsupported).toBe(1); expect(report.counts.unverified).toBe(1)
  })
  it('uses the latest execution snapshot and excludes unrelated task attempts', () => {
    const input = fixture(); input.task = { ...task, name: 'Edited', updatedAt: 4 }; input.workers.push({ ...input.workers[0]!, id: 'unrelated', taskId: 'other' })
    const report = buildSecurityReport(input)
    expect(report.task.name).toBe('Review'); expect(report.operations).toHaveLength(1); expect(report.limitations).toContain('configuration-changed')
  })
  it('closes an earlier failed operation only with a later observation under the same saved revision', () => {
    const input = fixture(); const original = input.workers[0]!
    original.status = 'failed'
    input.workers.push({ ...structuredClone(original), id: 'retry', status: 'completed', createdAt: 3, updatedAt: 4 })
    input.executions[0]!.workerRunIds.push('retry')
    expect(buildSecurityReport(input).coverage).toBe('complete')
    input.workers[1]!.snapshot.recordRevision = 2
    expect(buildSecurityReport(input).coverage).toBe('incomplete')
  })
  it('distinguishes no investigation from no findings', () => {
    const input = fixture(); input.executions = []; input.workers = []; input.plans = []
    expect(buildSecurityReport(input).coverage).toBe('not-started')
  })
  it('does not confirm a different investigation just because its URL was already observed', () => {
    const input = fixture()
    input.plans[0]!.items.push({ ...item, id: 'different-purpose', purpose: 'Check a separate requirement' })
    const report = buildSecurityReport(input)
    expect(report.counts).toMatchObject({ confirmed: 1, unverified: 1 })
    expect(report.operations[1]?.worker).toBeUndefined()
  })
  it('closes a pending item only through an unchanged explicit continuation', () => {
    const input = fixture()
    const original = input.plans[0]!
    const nextItem = { ...item, id: 'continued', carriedFrom: { planId: original.id, itemId: item.id } }
    const next = { ...structuredClone(original), id: 'next', items: [nextItem] }
    input.plans.push(next)
    input.workers[0] = { ...input.workers[0]!, planId: next.id, itemId: nextItem.id,
      snapshot: { ...input.workers[0]!.snapshot, item: nextItem } }
    input.executions[0]!.planIds.push(next.id)
    expect(buildSecurityReport(input).counts.confirmed).toBe(2)
    nextItem.purpose = 'Unrelated requirement'
    expect(buildSecurityReport(input).counts.unverified).toBe(1)
  })
  it('does not treat failed response analysis or redirects as confirmation', () => {
    const input = fixture(); const worker = input.workers[0]!
    worker.status = 'failed'; expect(classifySecurityWorker(worker)).toEqual({ status: 'partial', reason: 'worker-failed' })
    worker.evidence!.status = 301; expect(classifySecurityWorker(worker).reason).toBe('redirect')
  })
})
