import { describe, expect, it } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { SecurityAsset, SecurityCompany, SecurityTask } from '../src/security-records.ts'
import type { SecurityWorkerRun } from '../src/worker-types.ts'
import type { SecurityPlan } from '../src/planning-types.ts'
import { buildTaskCoverage } from '../src/client/coverage-model.ts'

const task: SecurityTask = { id: 't', name: 'Test', description: '', objective: '', status: 'draft', assetIds: ['root'], archived: false, pinned: false, createdAt: 0, updatedAt: 0 }
const company: SecurityCompany = { id: 'c', name: 'Company', scope: [{ kind: 'domain', value: 'example.co.jp' }], evidence: '' }
const root: SecurityAsset = { id: 'root', companyId: 'c', kind: 'domain', value: 'example.co.jp' }
const sub: SecurityAsset = { id: 'sub', companyId: 'c', kind: 'subdomain', value: 'app.example.co.jp' }
const service: SecurityAsset = { id: 'svc', companyId: 'c', kind: 'service', value: 'https://app.example.co.jp:8443' }
const endpoint: SecurityAsset = { id: 'url', companyId: 'c', kind: 'endpoint', value: 'https://app.example.co.jp:8443/check' }
const limits = { requestTimeoutMs: 100, responseBytes: 100, modelTimeoutMs: 100 }
const owner = { workspaceId: 'w' as WorkspaceId, taskId: task.id }
function worker(asset = root, id = 'worker'): SecurityWorkerRun {
  return { ...owner, id, requestId: id, planId: 'p', itemId: 'i', assetId: asset.id, sessionId: 'session' as SessionId, status: 'completed', createdAt: 1, updatedAt: 2, snapshot: { recordRevision: 0, task, asset, item: { id: 'i', title: 'Read', purpose: '', approach: '', targetAssetIds: [asset.id], status: 'pending' }, model: { engine: 'claude', model: 'sonnet' }, url: 'https://example.co.jp/', limits }, evidence: { url: asset.kind === 'endpoint' || asset.kind === 'service' ? asset.value : `https://${asset.value}/`, status: 200, headers: {}, body: '', bytes: 0 } }
}
function project(assets: SecurityAsset[] = [root], runs: SecurityWorkerRun[] = [], saved = task, plans: SecurityPlan[] = []) {
  return buildTaskCoverage(saved, assets, [company], { plans }, { runs, limits }, { findings: [], retests: [] })
}
describe('Saved asset coverage', () => {
  it('has no percentage for an empty scope and never adds observed URLs as assets', () => {
    expect(project([], [worker()], { ...task, assetIds: [] }).stats).toEqual({ denominator: 0, tested: 0, percentage: null, byType: {} })
    expect(project([root], [worker()]).nodes.filter(node => !node.connector)).toHaveLength(1)
  })
  it('counts distinct observed assets despite partial acquisition, failed reports, or repeated GETs', () => {
    const partial = worker(); partial.status = 'failed'; partial.evidence!.acquisition = 'partial'
    const other = worker(root, 'two')
    const model = project([root, sub], [partial, other])
    expect(model.stats).toEqual({ denominator: 2, tested: 1, percentage: 50,
      byType: { domain: { total: 1, tested: 1 }, subdomain: { total: 1, tested: 0 } } })
    expect(model.nodes.find(node => node.assetId === 'root')?.refs.workers).toHaveLength(2)
  })
  it('does not count a plan, a request without response, unrelated task, or URL outside the bound asset', () => {
    const pending = worker(); delete pending.evidence
    const unrelated = worker(root, 'other'); unrelated.taskId = 'other'
    const wrong = worker(root, 'wrong'); wrong.evidence!.url = 'https://elsewhere.example/'
    expect(project([root], [pending, unrelated, wrong]).stats.tested).toBe(0)
    expect(project([root], [{ ...worker(), snapshot: { ...worker().snapshot, task: { ...task, id: 'different' } } }]).stats.tested).toBe(0)
  })
  it('never counts a snapshot after the current registered identity changes', () => {
    expect(project([{ ...root, value: 'new.example.co.jp' }], [worker()]).stats.tested).toBe(0)
    expect(project([{ ...root, kind: 'subdomain' }], [worker()]).stats.tested).toBe(0)
  })
  it('keeps same-company descendants in scope and unrelated companies out of the graph', () => {
    const model = project([root, sub, service, endpoint, { ...sub, id: 'other', companyId: 'other' }])
    expect(model.stats.denominator).toBe(4)
    expect(model.nodes.some(node => node.assetId === 'other')).toBe(false)
    expect(model.edges).toContainEqual(expect.objectContaining({ source: 'asset:url', target: 'asset:svc' }))
    expect(model.edges).toContainEqual(expect.objectContaining({ source: 'asset:svc', target: 'asset:sub' }))
    expect(model.edges).toContainEqual(expect.objectContaining({ source: 'asset:sub', target: 'asset:root' }))
  })
  it('applies deny before allow, with exact domain label boundaries', () => {
    const saved: SecurityTask = { ...task, scopeRules: [{ id: 'allow', action: 'allow', kind: 'domain', value: 'example.co.jp', note: '' }, { id: 'deny', action: 'deny', kind: 'domain', value: 'app.example.co.jp', note: '' }] }
    const model = project([root, sub, { ...sub, id: 'bad', value: 'badexample.co.jp' }], [worker(sub)], saved)
    expect(model.stats.denominator).toBe(1)
    expect(model.stats.tested).toBe(0)
    expect(model.nodes.find(node => node.assetId === sub.id)?.scopeState).toBe('out')
  })
  it('marks DNS-dependent, malformed and partial URL scopes unresolved rather than reporting zero percent', () => {
    for (const rule of [{ kind: 'ip' as const, value: '203.0.113.1' }, { kind: 'cidr' as const, value: 'broken' }, { kind: 'url' as const, value: 'https://example.co.jp/one' }]) {
      const model = project([root], [], { ...task, scopeRules: [{ ...rule, id: 'r', action: 'allow', note: '' }] })
      expect(model.warnings).toContain('unresolved-scope'); expect(model.stats.percentage).toBeNull()
    }
  })
  it('matches exact endpoint and service origins without broadening explicit selections', () => {
    const model = project([root, sub, service, endpoint], [worker(endpoint)], { ...task, assetIds: [endpoint.id] })
    expect(model.stats).toMatchObject({ denominator: 1, tested: 1, percentage: 100 })
    const wrong = worker(endpoint); wrong.evidence!.url += '/other'
    expect(project([endpoint], [wrong], { ...task, assetIds: [endpoint.id] }).stats.tested).toBe(0)
    const sameOrigin = worker(service); sameOrigin.evidence!.url += '/other'
    expect(project([service], [sameOrigin], { ...task, assetIds: [service.id] }).stats.tested).toBe(1)
  })
  it('normalizes IDN and IPv6 and applies known IP rules without DNS', () => {
    const ip: SecurityAsset = { id: 'ip', companyId: 'c', kind: 'ip', value: '2001:db8::1' }
    const run = worker(ip); run.evidence!.url = 'https://[2001:db8:0:0:0:0:0:1]/'
    expect(project([ip], [run], { ...task, assetIds: ['ip'], scopeRules: [{ id: 'r', action: 'allow', kind: 'cidr', value: '2001:db8::/32', note: '' }] }).stats.tested).toBe(1)
    const idn = { ...root, value: '例え.jp' }, idnRun = worker(idn)
    idnRun.evidence!.url = 'https://xn--r8jz45g.jp/'
    expect(project([idn], [idnRun]).stats.tested).toBe(1)
  })
  it('uses explicit company roots as connectors and never guesses co.jp as a parent', () => {
    const model = project([sub], [], { ...task, assetIds: [sub.id] })
    expect(model.nodes.filter(node => node.connector).map(node => node.label)).toEqual(['Company', 'example.co.jp'])
    expect(model.stats.denominator).toBe(1)
    expect(model.nodes.some(node => node.label === 'co.jp')).toBe(false)
  })
  it('keeps registered roots unique and preserves exact endpoint query identity', () => {
    expect(project().nodes.filter(node => node.label === root.value)).toHaveLength(1)
    const query = { ...endpoint, value: `${endpoint.value}?q=x` }
    expect(project([query], [worker(query)], { ...task, assetIds: [query.id] }).stats.tested).toBe(1)
    const wrong = worker(query); wrong.evidence!.url = `${endpoint.value}?q=y`
    expect(project([query], [wrong], { ...task, assetIds: [query.id] }).stats.tested).toBe(0)
  })
  it('retains 25 children and stable graph IDs regardless of input order', () => {
    const children = Array.from({ length: 25 }, (_, index) => ({ ...sub, id: `s${index}`, value: `${'long-domain-'.repeat(3)}${index}.example.co.jp` }))
    const first = project([root, ...children]), second = project([...children].reverse().concat(root))
    expect(first).toEqual(second)
    expect(first.stats.denominator).toBe(26)
    expect(first.edges.filter(edge => edge.target === 'asset:root')).toHaveLength(25)
  })
  it('reports deleted selected assets and malformed registered assets as unresolved', () => {
    expect(project([]).warnings).toContain('missing-asset')
    expect(project([{ ...root, value: 'not a domain' }]).warnings).toContain('unresolved-scope')
  })
})
