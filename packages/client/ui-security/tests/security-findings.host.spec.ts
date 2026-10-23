import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { Context } from '@deepseek-ai/cordis'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { publicHttpNetwork } from '@deepseek-ai/dsh-web-fetch-http/network'
import { SecurityFindingsService } from '../src/security-findings.ts'
import type { SecurityTask, SecurityAsset } from '../src/security-records.ts'
import type { SecurityWorkerRun } from '../src/worker-types.ts'
import type { SecurityFinding, SecurityFindingState, SecurityRetest } from '../src/finding-types.ts'
vi.mock('@deepseek-ai/dsh-http-proxy', () => ({ proxyRouteFor: vi.fn(() => ({ proxied: false })) }))
const contexts: Context[] = []
let evidenceHome: string
beforeEach(async () => { evidenceHome = await mkdtemp(join(tmpdir(), 'jw-evidence-test-')); vi.stubEnv('DSH_HOME', evidenceHome) })
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  await rm(evidenceHome, { recursive: true, force: true }); vi.unstubAllEnvs(); vi.restoreAllMocks()
})
const identity = { workspaceId: 'workspace' as WorkspaceId, taskId: 'task' }
const task: SecurityTask = { id: 'task', name: 'Review', description: '', objective: 'Review', status: 'draft', assetIds: ['asset'], archived: false, pinned: false, createdAt: 1, updatedAt: 1 }
const asset: SecurityAsset = { id: 'asset', companyId: 'company', kind: 'domain', value: 'example.org' }
const report = {
  title: 'Exposure', summary: 'Retained evidence', severity: 'low' as const,
  proof: 'original exposed text', remediation: 'Remove exposure',
}
const worker: SecurityWorkerRun = { ...identity, id: 'worker', requestId: 'worker', planId: 'plan', itemId: 'item', assetId: 'asset', sessionId: 'security-worker-fixture' as SecurityWorkerRun['sessionId'], status: 'completed', createdAt: 1, updatedAt: 2, findings: [report], evidence: { url: 'https://example.org/', status: 200, headers: {}, body: report.proof, bytes: report.proof.length }, snapshot: { recordRevision: 1, task, asset, item: { id: 'item', title: 'Observe', purpose: 'Observe', approach: 'GET', targetAssetIds: ['asset'], status: 'pending' }, model: { engine: 'claude', model: 'fixture' }, url: 'https://example.org/', limits: { requestTimeoutMs: 1000, responseBytes: 1000, modelTimeoutMs: 1000 } } }
async function fixture(
  workers = [structuredClone(worker)], findings = new Map<string, SecurityFinding>(), retests = new Map<string, SecurityRetest>(),
) {
  const ctx = new Context(); contexts.push(ctx)
  const selectedTask = structuredClone(task)
  const tasks = new Map<string, SecurityFindingState>()
  for (const row of [...findings.values(), ...retests.values()]) {
    const key = JSON.stringify([row.workspaceId, row.taskId])
    const state = tasks.get(key) ?? { findings: [], retests: [] }
    if ('findingId' in row) state.retests.push(row); else state.findings.push(row)
    tasks.set(key, state)
  }
  const put = vi.fn(async (id: string, state: SecurityFindingState) => {
    tasks.set(id, structuredClone(state))
    findings.clear(); retests.clear()
    for (const value of tasks.values()) {
      for (const finding of value.findings) findings.set(finding.id, structuredClone(finding))
      for (const run of value.retests) retests.set(run.id, structuredClone(run))
    }
  })
  ctx.provide('storageDomain', { open: async () => ({ table: () => ({ entries: () => tasks.entries(), get: (id: string) => tasks.get(id), put }), close: async () => {} }) } as never)
  ctx.provide('securityRecords', { read: () => ({ workspaceId: identity.workspaceId, revision: 1, tasks: [selectedTask, { ...selectedTask, id: 'other' }], assets: [asset], companies: [] }) } as never)
  ctx.provide('securityWorkers', { read: (request: typeof identity) => ({ runs: workers.filter(run => run.workspaceId === request.workspaceId && run.taskId === request.taskId), limits: worker.snapshot.limits }) } as never)
  ctx.provide('securityConversations', {} as never)
  ctx.provide('securitySetup', { read: async () => ({ checklist: { ready: true } }) } as never)
  ctx.provide('workspaceRegistry', { get: () => ({ path: '/tmp' }) } as never)
  const create = vi.fn(async () => { throw new Error('No model configured in fixture') })
  ctx.provide('agents', { create } as never); ctx.provide('sessions', {} as never)
  ctx.provide('sessionPersistence', { flush: async () => {} } as never)
  ctx.provide('agentEngines', { get: () => ({ listModels: async () => [{ id: 'fixture', name: 'Fixture' }] }) } as never)
  await ctx.plugin(SecurityFindingsService)
  return { ctx, selectedTask, workers, findings, retests, tasks, put, create, request: { ...identity, findingId: 'worker-finding-0', requestId: 'retest', notes: '' } }
}
function network(body = 'normal application works', status = 200) {
  vi.spyOn(publicHttpNetwork, 'resolve').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
  return vi.spyOn(publicHttpNetwork, 'request').mockImplementation(async () => ({ response: { status, headers: new Headers(), body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(body)); controller.close() } }) }, close: async () => {} }) as never)
}
function model(f: Awaited<ReturnType<typeof fixture>>, answer: object) {
  f.create.mockImplementation(async (options?: { sessionId: string }) => ({ dispose: async () => {}, agent: { cancel: () => {}, followup: () => {}, whenIdle: async () => { f.ctx.emit('session/event', { id: options?.sessionId } as never, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } } as SessionEvent) }, session: { deriveMessages: () => [{ role: 'assistant', content: [{ type: 'text', text: JSON.stringify(answer) }] }] } } }) as never)
}
async function settled(f: Awaited<ReturnType<typeof fixture>>) { await vi.waitFor(async () => { expect((await f.ctx.securityFindings.read(identity)).retests[0]?.status).not.toBe('running') }); return (await f.ctx.securityFindings.read(identity)).retests[0]! }
describe('durable findings and independent retests', () => {
  it('imports completed structured findings once and preserves original evidence and triage', async () => {
    const f = await fixture(); const first = await f.ctx.securityFindings.read(identity)
    expect(first.findings).toHaveLength(1)
    f.workers[0]!.evidence!.body = 'changed later'
    await f.ctx.securityFindings.setStatus({ ...identity, findingId: first.findings[0]!.id, status: 'confirmed' })
    expect((await f.ctx.securityFindings.read(identity)).findings[0]).toMatchObject({ status: 'confirmed', evidence: { body: report.proof } })
    expect((await f.ctx.securityFindings.read({ ...identity, taskId: 'other' })).findings).toEqual([])
    await expect(f.ctx.securityFindings.setStatus({ ...identity, taskId: 'other', findingId: first.findings[0]!.id, status: 'fixed' })).rejects.toThrow('not found')
  })
  it('does not promote old prose or unsuccessful Worker output to findings', async () => {
    const f = await fixture([{ ...worker, findings: undefined, summary: 'Exposure in legacy prose' }, { ...worker, id: 'failed', status: 'failed' }])
    expect((await f.ctx.securityFindings.read(identity)).findings).toEqual([])
  })
  it('fetches fresh evidence, deduplicates delivery, and fixes only a supported successful verification', async () => {
    const request = network(); const f = await fixture(); model(f, { verdict: 'fixed', summary: 'Issue absent, control works', proof: 'normal application', normalControl: 'application works' })
    await f.ctx.securityFindings.startRetest(f.request); const run = await settled(f)
    await f.ctx.securityFindings.startRetest(f.request)
    expect(run).toMatchObject({ status: 'completed', verdict: 'fixed', evidence: { body: 'normal application works' }, snapshot: { finding: { evidence: { body: report.proof } } } })
    expect((await f.ctx.securityFindings.read(identity)).findings[0]?.status).toBe('fixed')
    expect(request).toHaveBeenCalledOnce(); expect(f.create).toHaveBeenCalledOnce()
    await expect(f.ctx.securityFindings.startRetest({ ...f.request, notes: 'different' })).rejects.toThrow('different input')
  })
  it.each([{ body: 'error page', status: 404, control: 'error page' }, { body: 'normal application works', status: 200, control: '' }, { body: report.proof + ' normal', status: 200, control: 'normal' }])('keeps unsupported fixed conclusions inconclusive ($status, $control)', async ({ body, status, control }) => {
    network(body, status); const f = await fixture(); model(f, { verdict: 'fixed', summary: 'Model claims fixed', proof: body, normalControl: control })
    await f.ctx.securityFindings.startRetest(f.request)
    expect((await settled(f)).verdict).toBe('inconclusive')
    expect((await f.ctx.securityFindings.read(identity)).findings[0]?.status).toBe('open')
  })
  it('cannot mark a capture-limited response fixed even with a normal control quote', async () => {
    network('normal application works' + 'x'.repeat(2000)); const f = await fixture()
    model(f, { verdict: 'fixed', summary: 'Claimed fixed', proof: 'normal application', normalControl: 'application works' })
    await f.ctx.securityFindings.startRetest(f.request)
    expect(await settled(f)).toMatchObject({ status: 'completed', verdict: 'inconclusive', evidence: { acquisition: 'partial', truncated: true, bytes: 1000 } })
    expect((await f.ctx.securityFindings.read(identity)).findings[0]?.status).toBe('open')
  })
  it('keeps reproduced results and rejects fabricated fresh proof without marking fixed', async () => {
    network(); const f = await fixture(); model(f, { verdict: 'reproduced', summary: 'Still present', proof: 'normal application', normalControl: '' })
    await f.ctx.securityFindings.startRetest(f.request)
    expect((await settled(f)).verdict).toBe('reproduced')
    expect((await f.ctx.securityFindings.read(identity)).findings[0]?.status).toBe('open')
    model(f, { verdict: 'fixed', summary: 'Claim without evidence', proof: 'invented quotation', normalControl: 'application works' })
    await f.ctx.securityFindings.startRetest({ ...f.request, requestId: 'fabricated' })
    await vi.waitFor(async () => { expect((await f.ctx.securityFindings.read(identity)).retests.find(run => run.requestId === 'fabricated')?.status).toBe('failed') })
    expect((await f.ctx.securityFindings.read(identity)).findings[0]?.status).toBe('open')
  })
  it('does not admit another task to the original finding or cancel its running verification', async () => {
    let finish!: (addresses: { address: string; family: 4 }[]) => void
    vi.spyOn(publicHttpNetwork, 'resolve').mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const f = await fixture(); const accepted = await f.ctx.securityFindings.startRetest(f.request)
    await expect(f.ctx.securityFindings.startRetest({ ...f.request, taskId: 'other' })).rejects.toThrow('not found')
    expect((await f.ctx.securityFindings.cancelRetest({ ...identity, taskId: 'other', retestId: accepted.retests[0]!.id })).retests).toEqual([])
    expect((await f.ctx.securityFindings.read(identity)).retests[0]?.status).toBe('running')
    const cancelling = f.ctx.securityFindings.cancelRetest({ ...identity, retestId: accepted.retests[0]!.id })
    finish([{ address: '93.184.216.34', family: 4 }]); await cancelling
  })
  it('persists completed fixed verdict and finding status together in one aggregate write', async () => {
    network(); const f = await fixture(); model(f, { verdict: 'fixed', summary: 'Control works', proof: 'normal application', normalControl: 'application works' })
    await f.ctx.securityFindings.startRetest(f.request); await settled(f)
    const states = f.put.mock.calls.map(([, state]) => state)
    for (const state of states) {
      const fixedRun = state.retests.find(run => run.verdict === 'fixed')
      const fixedFinding = state.findings.find(finding => finding.status === 'fixed')
      expect(Boolean(fixedRun)).toBe(Boolean(fixedFinding))
    }
    expect(states.filter(state => state.retests.some(run => run.verdict === 'fixed'))).toHaveLength(1)
  })
  it('retains the open finding when atomic completion storage fails', async () => {
    network(); const f = await fixture(); model(f, { verdict: 'fixed', summary: 'Control works', proof: 'normal application', normalControl: 'application works' })
    const write = f.put.getMockImplementation()!
    f.put.mockImplementation(async (id, state) => {
      if (state.retests.some(run => run.verdict === 'fixed')) throw new Error('Atomic completion write rejected')
      await write(id, state)
    })
    await f.ctx.securityFindings.startRetest(f.request)
    expect((await settled(f)).status).toBe('failed')
    const stored = [...f.tasks.values()][0]!
    expect(stored.findings[0]?.status).toBe('open')
    expect(stored.retests[0]?.verdict).toBeUndefined()
  })
  it('retains failure evidence without marking the finding fixed', async () => {
    network(); const f = await fixture(); await f.ctx.securityFindings.startRetest(f.request)
    expect((await settled(f)).status).toBe('failed')
    expect((await f.ctx.securityFindings.read(identity)).findings[0]?.status).toBe('open')
  })
  it('rejects current operation prohibitions and oversized notes before target access', async () => {
    const request = network(); const f = await fixture(); f.selectedTask.constraints = [{ id: 'deny', action: 'deny', text: 'GET' }]
    await expect(f.ctx.securityFindings.startRetest(f.request)).rejects.toThrow('GET')
    await expect(f.ctx.securityFindings.startRetest({ ...f.request, notes: 'x'.repeat(20001) })).rejects.toThrow('Invalid retest request')
    expect(request).not.toHaveBeenCalled()
  })
  it('rejects concurrent retests and cancels without promoting the finding', async () => {
    let finish!: (addresses: { address: string; family: 4 }[]) => void
    vi.spyOn(publicHttpNetwork, 'resolve').mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const request = vi.spyOn(publicHttpNetwork, 'request'); const f = await fixture()
    const accepted = await f.ctx.securityFindings.startRetest(f.request)
    await expect(f.ctx.securityFindings.startRetest({ ...f.request, requestId: 'second' })).rejects.toThrow('active retest')
    await expect(f.ctx.securityFindings.setStatus({ ...identity, findingId: f.request.findingId, status: 'fixed' })).rejects.toThrow('active retest')
    const cancelling = f.ctx.securityFindings.cancelRetest({ ...identity, retestId: accepted.retests[0]!.id })
    finish([{ address: '93.184.216.34', family: 4 }]); await cancelling
    expect((await settled(f)).status).toBe('cancelled'); expect(request).not.toHaveBeenCalled()
    expect((await f.ctx.securityFindings.read(identity)).findings[0]?.status).toBe('open')
  })
  it('marks stored running retests interrupted on restart without replaying requests', async () => {
    network(); const f = await fixture(); model(f, { verdict: 'inconclusive', summary: 'Cannot compare', proof: 'normal', normalControl: '' })
    await f.ctx.securityFindings.startRetest(f.request); const prior = await settled(f)
    await f.ctx.fiber.dispose(); contexts.splice(contexts.indexOf(f.ctx), 1)
    const restored = await fixture([structuredClone(worker)], f.findings, new Map([[prior.id, { ...prior, status: 'running' }]]))
    expect((await restored.ctx.securityFindings.read(identity)).retests[0]?.status).toBe('interrupted')
    expect(restored.create).not.toHaveBeenCalled()
  })
})
