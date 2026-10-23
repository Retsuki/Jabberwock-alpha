import type { EngineHostTool } from '@deepseek-ai/dsh-agent'
import type { RemoteInvocation, PeerId } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { Context } from '@deepseek-ai/cordis'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { proxyRouteFor } from '@deepseek-ai/dsh-http-proxy'
import { publicHttpNetwork } from '@deepseek-ai/dsh-web-fetch-http/network'
import { SecurityWorkersService } from '../src/security-workers.ts'
import type { SecurityTask, SecurityAsset } from '../src/security-records.ts'
import type { SecurityWorkerRun } from '../src/worker-types.ts'
vi.mock('@deepseek-ai/dsh-http-proxy', () => ({ proxyRouteFor: vi.fn(() => ({ proxied: false })) }))
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface PrincipalMap {
    /** Non-owner identity for browser credential authorization tests. */
    'test-worker-browser-guest': { readonly kind: 'test-worker-browser-guest' }
  }
}
const contexts: Context[] = []
let evidenceHome: string
beforeEach(async () => { evidenceHome = await mkdtemp(join(tmpdir(), 'jw-evidence-test-')); vi.stubEnv('DSH_HOME', evidenceHome) })
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  await rm(evidenceHome, { recursive: true, force: true }); vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.mocked(proxyRouteFor).mockReturnValue({ proxied: false })
})
const identity = { workspaceId: 'workspace' as WorkspaceId, taskId: 'task' }
const task: SecurityTask = { id: 'task', name: 'Review', description: '', objective: 'Review', status: 'draft', agentModelModes: { worker: 'fixed' }, assetIds: ['asset'], archived: false, pinned: false, createdAt: 1, updatedAt: 1 }
const asset: SecurityAsset = { id: 'asset', companyId: 'company', kind: 'domain', value: 'example.org' }
const item = { id: 'item', title: 'Observe', purpose: 'Review headers', approach: 'One GET', targetAssetIds: ['asset'], status: 'pending' as const }
const config = { workerResponseAttempts: 2, workerTimeoutMs: 1000, workerModelTimeoutMs: 1000, workerMaxResponseBytes: 4 }
function blockedHTTP() {
  vi.spyOn(publicHttpNetwork, 'resolve').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
  return vi.spyOn(publicHttpNetwork, 'request').mockImplementation(async (_url, _addresses, _headers, signal) =>
    new Promise((_resolve, reject) => {
      const abort = () => { reject(signal.reason instanceof Error ? signal.reason : new Error('Cancelled fixture request')) }
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
    }) as never)
}
async function fixture(rows = new Map<string, SecurityWorkerRun>(), selectedTask = task, failWritesAt = Number.POSITIVE_INFINITY, plannedItem: typeof item & { modelDecision?: { engine: 'claude' | 'codex'; model: string; reason: string } } = item, workerConfig: typeof config & { workerBrowserEnabled?: boolean } = config) {
  let writes = 0
  let revision = 1
  const models = vi.fn(async () => [{ id: 'default', name: 'Default' }, { id: 'selected', name: 'Selected' }])
  const ctx = new Context(); contexts.push(ctx)
  const items = [plannedItem]
  ctx.provide('storageDomain', { open: async () => ({ table: () => ({ entries: () => rows.entries(), put: async (id: string, value: SecurityWorkerRun) => { if (++writes >= failWritesAt) throw new Error('Storage fixture failure'); rows.set(id, structuredClone(value)) } }), close: async () => {} }) } as never)
  ctx.provide('securityRecords', { read: () => ({ workspaceId: identity.workspaceId, revision, tasks: [selectedTask], assets: [asset], companies: [] }) } as never)
  ctx.provide('securityConversations', { catalog: async () => ({ selection: { engine: 'claude', model: 'default' }, engines: [{ id: 'claude', name: 'Claude', models: await models() }] }) } as never)
  const repairExploration = vi.fn(async () => {})
  ctx.provide('securityPlanning', { repairExploration, read: () => ({ plans: [{ id: 'plan', status: 'ready', items, snapshot: { task: selectedTask, assets: [asset] } }] }) } as never)
  ctx.provide('securitySetup', { read: async () => ({ checklist: { ready: true } }) } as never)
  ctx.provide('workspaceRegistry', { get: () => ({ path: '/tmp' }) } as never)
  const create = vi.fn(async (_options?: { sessionId: string }) => ({ dispose: async () => {}, agent: { followup: () => {}, cancel: () => {}, whenIdle: async () => { throw new Error('Model fixture failure') }, session: { deriveMessages: () => [] } } }))
  const engines = new Map<string, {
    listModels: typeof models
    run: (request: { agent: { id: string }; hostTools?: EngineHostTool[] }) => Promise<void>
  }>()
  engines.set('claude-host-tools', { listModels: models, run: async (request) => {
    const http = request.hostTools?.find(tool => tool.name === 'http_request')
    if (!http) throw new Error('Missing investigation tool')
    await http.execute({ url: 'https://example.org/', method: 'GET' }, new AbortController().signal)
  } })
  ctx.provide('agents', { create: async (options: { sessionId: string; agentOptions: { provider: string } }) => {
    const handle = await create(options)
    let investigated = options.sessionId.includes('discussion')
    const idle = handle.agent.whenIdle
    return { ...handle, agent: { ...handle.agent, whenIdle: async () => {
      if (!investigated) {
        investigated = true
        const engine = engines.get(options.agentOptions.provider)
        if (!engine) throw new Error('Missing scoped investigation engine')
        await engine.run({ agent: { id: options.sessionId } })
      }
      await idle()
    } } }
  } } as never); ctx.provide('sessions', {} as never)
  ctx.provide('sessionPersistence', { flush: async () => {} } as never)
  ctx.provide('agentEngines', { get: (id: string) => engines.get(id), register: (engine: { id: string } & Parameters<typeof engines.set>[1]) => { engines.set(engine.id, engine); return () => { engines.delete(engine.id) } } } as never)
  await ctx.plugin(SecurityWorkersService, workerConfig)
  const request = { ...identity, planId: 'plan', itemId: 'item', assetId: 'asset', requestId: 'request', url: 'https://example.org/', expectedRevision: 1 }
  return { ctx, rows, request, create, repairExploration, models, items, engines, changeRevision: () => { revision += 1 } }
}
describe('bounded Worker lifecycle', () => {
  it.each((['permission', 'scope', 'operations'] as const).flatMap(field => [true, false].map(notify => ({ field, notify }))))('stops further HTTP when saved $field confirmation is revoked (notify: $notify)', async ({ field, notify }) => {
    const setup = { completionCondition: 'Observe headers', permission: { assetIds: ['asset'], confirmed: true },
      scope: { assetIds: ['asset'], rules: '[]', confirmed: true }, operations: { constraints: '[]', confirmed: true }, limits: 'One request' }
    const selectedTask: SecurityTask = { ...task, setup }
    const resolve = vi.spyOn(publicHttpNetwork, 'resolve').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    const transport = vi.spyOn(publicHttpNetwork, 'request').mockResolvedValue({ response: { status: 302, headers: new Headers(), body: null }, close: async () => {} } as never)
    const f = await fixture(new Map(), selectedTask)
    const entered = Promise.withResolvers<undefined>()
    const resume = Promise.withResolvers<undefined>()
    const native = f.engines.get('claude-host-tools')
    if (!native) throw new Error('Expected the isolated engine')
    native.run = async (request) => {
      const http = request.hostTools?.find(tool => tool.name === 'http_request')
      if (!http) throw new Error('Expected a scoped HTTP tool')
      entered.resolve(undefined)
      await resume.promise
      await http.execute({ url: 'https://example.org/', method: 'GET' }, new AbortController().signal)
    }
    await f.ctx.securityWorkers.start(f.request)
    await entered.promise
    setup[field].confirmed = false
    if (notify) f.ctx.emit('security-records/changed', { workspaceId: identity.workspaceId, revision: 2, tasks: [selectedTask], assets: [asset], companies: [] })
    resume.resolve(undefined)
    await vi.waitFor(() => { expect(f.ctx.securityWorkers.read(identity).runs[0]?.status).not.toBe('running') })
    expect(resolve).not.toHaveBeenCalled()
    expect(transport).not.toHaveBeenCalled()
  })

  it.each(['permission', 'scope', 'operations'] as const)('clears browser credentials when saved %s confirmation is revoked', async (field) => {
    const constraints = [{ id: 'post', action: 'allow' as const, text: 'POST' }, { id: 'auth', action: 'allow' as const, text: 'credential submission' }]
    const setup = { completionCondition: 'Observe headers', permission: { assetIds: ['asset'], confirmed: true },
      scope: { assetIds: ['asset'], rules: '[]', confirmed: true }, operations: { constraints: JSON.stringify(constraints), confirmed: true }, limits: 'One request' }
    const selectedTask: SecurityTask = { ...task, constraints, setup }
    const f = await fixture(new Map(), selectedTask, Number.POSITIVE_INFINITY, item, { ...config, workerBrowserEnabled: true })
    f.ctx.securityWorkers.setBrowserCredentials({ ...identity, credentials: { origin: 'https://example.org', username: 'user', password: 'test-secret' } })
    expect(f.ctx.securityWorkers.read(identity).browser?.credentialsConfigured).toBe(true)
    setup[field].confirmed = false
    f.ctx.emit('security-records/changed', { workspaceId: identity.workspaceId, revision: 2, tasks: [selectedTask], assets: [asset], companies: [] })
    expect(f.ctx.securityWorkers.read(identity).browser?.credentialsConfigured).toBe(false)
    expect(JSON.stringify(f.ctx.securityWorkers.read(identity))).not.toContain('test-secret')
  })

  it('stores browser credentials only in Host memory and clears them when authorization changes', async () => {
    const selectedTask: SecurityTask = { ...task, constraints: [{ id: 'post', action: 'allow', text: 'POST' }, { id: 'auth', action: 'allow', text: 'credential submission' }] }
    const f = await fixture(new Map(), selectedTask, Number.POSITIVE_INFINITY, item, { ...config, workerBrowserEnabled: true })
    expect(f.ctx.securityWorkers.setBrowserCredentials({ ...identity, credentials: { origin: 'https://example.org', username: 'test-user', password: 'test-password' } })).toEqual({ configured: true })
    expect(f.ctx.securityWorkers.read(identity).browser).toEqual({ enabled: true, credentialsConfigured: true })
    expect(JSON.stringify(f.ctx.securityWorkers.read(identity))).not.toContain('test-password')
    expect(f.rows.size).toBe(0)
    expect(() => f.ctx.securityWorkers.setBrowserCredentials({ ...identity, credentials: { origin: 'https://outside.invalid', username: 'test-user', password: 'test-password' } })).toThrow('Browser login requires')
    const changed = { ...selectedTask, constraints: [{ id: 'auth', action: 'deny' as const, text: 'credential submission' }] }
    f.ctx.emit('security-records/changed', { workspaceId: identity.workspaceId, revision: 2, tasks: [changed], assets: [asset], companies: [] })
    expect(f.ctx.securityWorkers.read(identity).browser?.credentialsConfigured).toBe(false)
  })
  it('replaces and clears credentials without returning secret values', async () => {
    const selectedTask: SecurityTask = { ...task, constraints: [{ id: 'post', action: 'allow', text: 'POST' }, { id: 'auth', action: 'allow', text: 'credential submission' }] }
    const f = await fixture(new Map(), selectedTask, Number.POSITIVE_INFINITY, item, { ...config, workerBrowserEnabled: true })
    for (const password of ['first-secret', 'replacement-secret']) {
      expect(f.ctx.securityWorkers.setBrowserCredentials({ ...identity, credentials: { origin: 'https://example.org', username: 'user', password } })).toEqual({ configured: true })
      expect(JSON.stringify(f.ctx.securityWorkers.read(identity))).not.toContain(password)
    }
    expect(f.ctx.securityWorkers.setBrowserCredentials(identity)).toEqual({ configured: false })
    expect(f.ctx.securityWorkers.read(identity).browser?.credentialsConfigured).toBe(false)
    f.ctx.securityWorkers.setBrowserCredentials({ ...identity, credentials: { origin: 'https://example.org', username: 'user', password: 'secret' } })
    const service = f.ctx.securityWorkers
    await f.ctx.fiber.dispose()
    expect(() => service.setBrowserCredentials({ ...identity, credentials: { origin: 'https://example.org', username: 'user', password: 'secret' } })).toThrow()
  })
  it('rejects non-owner Remote credential configuration', async () => {
    const f = await fixture()
    const signal = new AbortController().signal
    const invocation: RemoteInvocation = { request: { namespace: 'securityWorkers', method: 'setBrowserCredentials', args: {} }, service: 'securityWorkers', signal,
      peer: { id: 'test-peer' as PeerId, ctx: f.ctx, principal: { kind: 'test-worker-browser-guest' }, interactions: 'none', signal, dispose: async () => {} },
      uplink: <In>(): AsyncIterable<In> => ({ [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true, value: undefined }) }) }),
    }
    expect(() => f.ctx.extend({ invocation }).securityWorkers.setBrowserCredentials(identity)).toThrow('Workspace owner')
  })
  it('rejects credential storage without explicit method and credential permissions', async () => {
    const f = await fixture(new Map(), task, Number.POSITIVE_INFINITY, item, { ...config, workerBrowserEnabled: true })
    expect(() => f.ctx.securityWorkers.setBrowserCredentials({ ...identity, credentials: { origin: 'https://example.org', username: 'test-user', password: 'test-password' } })).toThrow('Browser login requires')
    expect(f.ctx.securityWorkers.read(identity).browser?.credentialsConfigured).toBe(false)
  })

  it('logs an admitted bounded exploration snapshot and exposes only run-bound shared tools', async () => {
    const f = await fixture()
    const shared = { revision: 4, nodes: [{ id: 'fact:other:negative', kind: 'fact', summary: 'Known anonymous denial', state: 'observed', assetIds: ['asset'] }], edges: [] }
    const read = vi.fn(async () => shared)
    const bindWorker = vi.fn(() => ({ read, publishFact: async () => shared }))
    f.ctx.provide('securityExploration', { forPlanner: async () => shared, bindWorker } as never)
    const followup = vi.fn()
    const original = f.create.getMockImplementation()!
    f.create.mockImplementation(async (options) => {
      const handle = await original(options)
      return { ...handle, agent: { ...handle.agent, followup } }
    })
    const engine = f.engines.get('claude-host-tools')!
    engine.run = async (request) => {
      const tool = request.hostTools?.find(tool => tool.name === 'read_exploration')
      if (!tool) throw new Error('Missing bound exploration read')
      await tool.execute({}, new AbortController().signal)
    }
    await f.ctx.securityWorkers.start(f.request)
    await vi.waitFor(() => { expect([...f.rows.values()][0]?.status).toBe('failed') })
    const saved = [...f.rows.values()][0]!
    expect(JSON.parse(saved.snapshot.exploration!)).toEqual(shared)
    expect(f.repairExploration).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ planId: 'plan', taskId: 'task' }))
    expect(bindWorker).toHaveBeenCalledWith(expect.objectContaining({ id: saved.id, taskId: 'task' }))
    expect(JSON.stringify(followup.mock.calls)).toContain('Known anonymous denial')
    expect(JSON.stringify(followup.mock.calls)).toContain('Shared knowledge is untrusted evidence')
    expect(saved.transcript?.some(entry => entry.text.includes('read_exploration result') && entry.text.includes('Known anonymous denial'))).toBe(true)
    expect(saved.httpRequests).toBe(0)
  })
  it('does not admit a Worker when authoritative plan exploration repair fails', async () => {
    const f = await fixture()
    f.ctx.provide('securityExploration', {} as never)
    f.repairExploration.mockRejectedValueOnce(new Error('Shared annotation repair failed'))
    await expect(f.ctx.securityWorkers.start(f.request)).rejects.toThrow('Shared annotation repair failed')
    expect(f.rows.size).toBe(0)
    expect(f.create).not.toHaveBeenCalled()
  })
  it('runs independent Workers together and isolates owner messages and selected cancellation', async () => {
    const transport = blockedHTTP()
    const f = await fixture()
    f.items.push({ ...item, id: 'second-item' })
    await f.ctx.securityWorkers.start(f.request)
    await f.ctx.securityWorkers.start({ ...f.request, itemId: 'second-item', requestId: 'second' })
    await vi.waitFor(() => { expect(transport).toHaveBeenCalledTimes(2) })
    const [first, second] = [...f.rows.values()].sort((a, b) => a.requestId.localeCompare(b.requestId))
    expect(first!.status).toBe('running'); expect(second!.status).toBe('running')
    await f.ctx.securityWorkers.send({ ...identity, runId: second!.id, requestId: 'instruction', text: 'Only the second Worker' })
    expect(f.ctx.securityWorkers.read(identity).runs.find(run => run.id === first!.id)!.transcript?.some(entry => entry.text === 'Only the second Worker')).toBe(false)
    await f.ctx.securityWorkers.cancel({ ...identity, runId: first!.id })
    expect(f.ctx.securityWorkers.read(identity).runs.find(run => run.id === first!.id)!.status).toBe('cancelled')
    expect(f.ctx.securityWorkers.read(identity).runs.find(run => run.id === second!.id)!.status).toBe('running')
    await f.ctx.securityWorkers.cancel(identity)
    expect(f.ctx.securityWorkers.read(identity).runs.every(run => run.status === 'cancelled')).toBe(true)
  })
  it('caps simultaneous Workers at three while preserving idempotent delivery', async () => {
    blockedHTTP()
    const f = await fixture()
    for (const id of ['two', 'three', 'four']) f.items.push({ ...item, id })
    for (const id of ['item', 'two', 'three']) await f.ctx.securityWorkers.start({ ...f.request, itemId: id, requestId: id })
    await f.ctx.securityWorkers.start({ ...f.request, requestId: 'item' })
    expect(f.rows.size).toBe(3)
    await expect(f.ctx.securityWorkers.start({ ...f.request, itemId: 'four', requestId: 'four' })).rejects.toThrow('concurrency')
    await expect(f.ctx.securityWorkers.start({ ...f.request, itemId: 'two', requestId: 'item' })).rejects.toThrow('different input')
    await f.ctx.securityWorkers.cancel(identity)
  })
  it('fences in-flight and queued admissions when cancelling the whole task', async () => {
    const f = await fixture()
    const gate = Promise.withResolvers<undefined>()
    f.models.mockImplementation(async () => { await gate.promise; return [{ id: 'default', name: 'Default' }] })
    const first = f.ctx.securityWorkers.start(f.request)
    const second = f.ctx.securityWorkers.start({ ...f.request, requestId: 'queued' })
    const outcomes = Promise.allSettled([first, second])
    await vi.waitFor(() => { expect(f.models).toHaveBeenCalled() })
    const cancellation = f.ctx.securityWorkers.cancel(identity)
    expect(() => f.ctx.securityWorkers.start({ ...f.request, requestId: 'late' })).toThrow('cancelled')
    gate.resolve(undefined)
    await cancellation
    expect((await outcomes).every(result => result.status === 'rejected')).toBe(true)
    expect(f.rows.size).toBe(0); expect(f.create).not.toHaveBeenCalled()
  })
  it('waits for handle disposal after a Worker terminal record is saved', async () => {
    vi.spyOn(publicHttpNetwork, 'resolve').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    vi.spyOn(publicHttpNetwork, 'request').mockResolvedValue({ response: { status: 200, headers: new Headers(), body: null }, close: async () => {} } as never)
    const f = await fixture()
    const gate = Promise.withResolvers<undefined>()
    const original = f.create.getMockImplementation()!
    f.create.mockImplementation(async options => ({ ...await original(options), dispose: async () => { await gate.promise } }))
    await f.ctx.securityWorkers.start(f.request)
    await vi.waitFor(() => { expect([...f.rows.values()][0]!.status).toBe('failed') })
    const runId = [...f.rows.values()][0]!.id
    let done = false
    const waiting = f.ctx.securityWorkers.waitForSettled({ ...identity, runId }).then(() => { done = true })
    await Promise.resolve(); expect(done).toBe(false)
    gate.resolve(undefined); await waiting; expect(done).toBe(true)
  })
  it('requires exact persisted execution grants and prevents manual quota bypass', async () => {
    blockedHTTP()
    const f = await fixture()
    const parent = { id: 'execution', status: 'running', workerRunIds: [], snapshot: { limits: { maxRequests: 3, maxConcurrentWorkers: 3 } },
      dispatches: [{ requestId: f.request.requestId, planId: 'plan', itemId: 'item', assetId: 'asset', url: f.request.url, maxRequests: 3 }] }
    f.ctx.provide('securityExecution', { read: () => ({ runs: [parent] }) } as never)
    await expect(f.ctx.securityWorkers.start(f.request)).rejects.toThrow('reservation')
    await expect(f.ctx.securityWorkers.startReserved({ ...f.request, executionRunId: 'execution', maxRequests: 2 })).rejects.toThrow('grant')
    await f.ctx.securityWorkers.startReserved({ ...f.request, executionRunId: 'execution', maxRequests: 3 })
    expect(f.rows.size).toBe(1)
    await f.ctx.securityWorkers.cancel(identity)
  })
  it('keeps pending approvals isolated between simultaneous Workers', async () => {
    const transport = blockedHTTP()
    const f = await fixture(new Map(), { ...task, constraints: [{ id: 'post', action: 'allow', text: 'POST' }] })
    f.items.push({ ...item, id: 'second-item' })
    f.engines.get('claude-host-tools')!.run = async (request) => {
      const tool = request.hostTools?.find(value => value.name === 'http_request')
      if (!tool) throw new Error('Missing scoped HTTP tool')
      await tool.execute({ url: 'https://example.org/', method: 'POST' }, new AbortController().signal)
    }
    await f.ctx.securityWorkers.start(f.request)
    await f.ctx.securityWorkers.start({ ...f.request, itemId: 'second-item', requestId: 'second' })
    await vi.waitFor(() => { expect([...f.rows.values()].filter(run => run.pendingApproval)).toHaveLength(2) })
    const [first, second] = [...f.rows.values()]
    await expect(f.ctx.securityWorkers.approveTool({ ...identity, runId: second!.id, approvalId: first!.pendingApproval!.id, allow: true })).rejects.toThrow('no longer')
    await f.ctx.securityWorkers.approveTool({ ...identity, runId: first!.id, approvalId: first!.pendingApproval!.id, allow: false })
    expect(f.rows.get(second!.id)!.pendingApproval).toBeDefined()
    expect(transport).not.toHaveBeenCalled()
    await f.ctx.securityWorkers.approveTool({ ...identity, runId: second!.id, approvalId: second!.pendingApproval!.id, allow: true })
    await vi.waitFor(() => { expect(transport).toHaveBeenCalledOnce() })
    expect(f.rows.get(first!.id)!.httpRequests).toBe(0)
    expect(f.rows.get(second!.id)!.httpRequests).toBe(1)
    await f.ctx.securityWorkers.cancel(identity)
  })
  it('executes one anonymous observation with saved permission ceilings and operation prohibitions', async () => {
    const selectedTask: SecurityTask = { ...task, constraints: [
      { id: 'scan', action: 'allow', text: 'ポートスキャン、稼働サービス／バージョンの検出' },
      { id: 'observe', action: 'allow', text: '既知脆弱性の軽量・非破壊な確認（バナー確認、安全なシグネチャ照合）' },
      ...['実際のエクスプロイト実行（攻撃コードの投入）', 'DoS／高負荷・ストレステスト', 'データの改ざん・削除、設定変更', 'ログイン総当たり（ブルートフォース）'].map((text, i) => ({ id: `deny${i}`, action: 'deny' as const, text })),
    ] }
    const addresses = [{ address: '93.184.216.34', family: 4 as const }]
    const resolve = vi.spyOn(publicHttpNetwork, 'resolve').mockResolvedValue(addresses)
    const request = vi.spyOn(publicHttpNetwork, 'request').mockResolvedValue({ response: { status: 302, headers: new Headers(), body: null }, close: async () => {} } as never)
    const f = await fixture(new Map(), selectedTask)
    await f.ctx.securityWorkers.start(f.request)
    await vi.waitFor(() => { expect(f.ctx.securityWorkers.read(identity).runs[0]?.status).toBe('failed') })
    expect(resolve).toHaveBeenCalledOnce()
    expect(request).toHaveBeenCalledExactlyOnceWith(new URL(f.request.url), addresses, { accept: 'text/plain, text/html, application/json' }, expect.any(AbortSignal), { method: 'GET', body: undefined })
    expect(f.ctx.securityWorkers.read(identity).runs[0]?.evidence?.status).toBe(302)
    expect(f.create).toHaveBeenCalledOnce()
  })
  it.each([
    { action: 'deny' as const, text: 'GET', url: 'https://example.org/', error: 'GET調査は禁止' },
    { action: 'deny' as const, text: '個人情報を絶対に取得しない', url: 'https://example.org/', error: '個人情報を絶対に取得しない' },
    { action: 'allow' as const, text: 'HTTPSのみ', url: 'http://example.org/', error: 'HTTP接続' },
  ])('rejects $text before DNS and transport', async ({ action, text, url, error }) => {
    const resolve = vi.spyOn(publicHttpNetwork, 'resolve')
    const request = vi.spyOn(publicHttpNetwork, 'request')
    const f = await fixture(new Map(), { ...task, constraints: [{ id: 'restrict', action, text }] })
    await expect(f.ctx.securityWorkers.start({ ...f.request, url })).rejects.toThrow(error)
    expect(resolve).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
    expect(f.create).not.toHaveBeenCalled()
    expect(f.rows.size).toBe(0)
  })
  it('rejects legacy items without an automatic model decision before target access', async () => {
    const network = vi.spyOn(publicHttpNetwork, 'request')
    const f = await fixture(new Map(), { ...task, agentModelModes: { worker: 'auto' } })
    await expect(f.ctx.securityWorkers.start(f.request)).rejects.toThrow('model selection is missing')
    expect(network).not.toHaveBeenCalled()
  })
  it('captures the per-item automatic model before fetching the observation', async () => {
    vi.spyOn(publicHttpNetwork, 'resolve').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    vi.spyOn(publicHttpNetwork, 'request').mockResolvedValue({ response: { status: 302, headers: new Headers(), body: null }, close: async () => {} } as never)
    const decision = { engine: 'claude' as const, model: 'selected', reason: 'Appropriate for this observation' }
    const f = await fixture(new Map(), { ...task, agentModelModes: { worker: 'auto' } }, Number.POSITIVE_INFINITY, { ...item, modelDecision: decision })
    await f.ctx.securityWorkers.start(f.request)
    await vi.waitFor(() => { expect(f.ctx.securityWorkers.read(identity).runs[0]?.status).toBe('failed') })
    expect(f.ctx.securityWorkers.read(identity).runs[0]?.snapshot).toMatchObject({ model: { model: 'selected' }, item: { modelDecision: decision } })
  })
  it('records the actual fixed override instead of the earlier item model reason', async () => {
    vi.spyOn(publicHttpNetwork, 'resolve').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    vi.spyOn(publicHttpNetwork, 'request').mockResolvedValue({ response: { status: 302, headers: new Headers(), body: null }, close: async () => {} } as never)
    const f = await fixture(new Map(), task, Number.POSITIVE_INFINITY, { ...item, modelDecision: { engine: 'claude', model: 'selected', reason: 'Earlier plan choice' } })
    await f.ctx.securityWorkers.start(f.request)
    await vi.waitFor(() => { expect(f.ctx.securityWorkers.read(identity).runs[0]?.status).toBe('failed') })
    expect(f.ctx.securityWorkers.read(identity).runs[0]?.snapshot.modelDecision).toEqual({ engine: 'claude', model: 'default', reason: 'Task owner fixed this role model.' })
  })
  it('rejects configured proxy routing before DNS or HTTP', async () => {
    vi.mocked(proxyRouteFor).mockReturnValue({ proxied: true } as never)
    const network = vi.spyOn(publicHttpNetwork, 'request')
    const f = await fixture()
    await expect(f.ctx.securityWorkers.start(f.request)).rejects.toThrow('proxy routing')
    expect(network).not.toHaveBeenCalled()
  })
  it('rejects unavailable models before any target access', async () => {
    const network = vi.spyOn(publicHttpNetwork, 'request')
    const f = await fixture(new Map(), { ...task, agentModels: { worker: { engine: 'claude', model: 'retired' } } })
    await expect(f.ctx.securityWorkers.start(f.request)).rejects.toThrow('available conversation-only')
    expect(network).not.toHaveBeenCalled()
  })
  it('rejects a revision changed during asynchronous model discovery', async () => {
    const f = await fixture()
    f.models.mockImplementation(async () => { f.changeRevision(); return [{ id: 'default', name: 'Default' }] })
    await expect(f.ctx.securityWorkers.start(f.request)).rejects.toThrow('during admission')
    expect(f.rows.size).toBe(0)
  })
  it('admits only one active operation per investigation item', async () => {
    let finish!: (value: { address: string; family: 4 }[]) => void
    vi.spyOn(publicHttpNetwork, 'resolve').mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const f = await fixture(); await f.ctx.securityWorkers.start(f.request)
    await expect(f.ctx.securityWorkers.start({ ...f.request, requestId: 'second' })).rejects.toThrow('active Worker')
    await vi.waitFor(() => { expect(finish).toBeTypeOf('function') })
    const cancellation = f.ctx.securityWorkers.cancel(identity)
    await vi.waitFor(() => { expect(finish).toBeTypeOf('function') })
    finish([{ address: '93.184.216.34', family: 4 }]); await cancellation
  })

  it('cancels an owned archived task while ignoring a different run identifier', async () => {
    let finish!: (value: { address: string; family: 4 }[]) => void
    vi.spyOn(publicHttpNetwork, 'resolve').mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const selectedTask = structuredClone(task)
    const f = await fixture(new Map(), selectedTask)
    await f.ctx.securityWorkers.start(f.request)
    const run = f.ctx.securityWorkers.read(identity).runs[0]!
    const untouched = await f.ctx.securityWorkers.cancel({ ...identity, runId: 'unrelated' })
    expect(untouched.runs[0]?.status).toBe('running')
    await vi.waitFor(() => { expect(finish).toBeTypeOf('function') })
    selectedTask.archived = true
    await vi.waitFor(() => { expect(finish).toBeTypeOf('function') })
    const cancellation = f.ctx.securityWorkers.cancel({ ...identity, runId: run.id })
    await vi.waitFor(() => { expect(finish).toBeTypeOf('function') })
    finish([{ address: '93.184.216.34', family: 4 }])
    expect((await cancellation).runs[0]?.status).toBe('cancelled')
  })

  it('exposes storage failure instead of leaving an apparently active run', async () => {
    vi.spyOn(publicHttpNetwork, 'resolve').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    vi.spyOn(publicHttpNetwork, 'request').mockResolvedValue({ response: { status: 302, headers: new Headers(), body: null }, close: async () => {} } as never)
    const f = await fixture(new Map(), task, 2)
    await f.ctx.securityWorkers.start(f.request)
    await vi.waitFor(() => { expect(() => f.ctx.securityWorkers.read(identity)).toThrow('Worker storage failed') })
    await expect(f.ctx.securityWorkers.start({ ...f.request, requestId: 'retry' })).rejects.toThrow('Worker storage failed')
  })
  it('records tool-selected redirects without following, and deduplicates retries', async () => {
    vi.spyOn(publicHttpNetwork, 'resolve').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    const close = vi.fn(async () => {})
    const request = vi.spyOn(publicHttpNetwork, 'request').mockResolvedValue({ response: { status: 302, headers: new Headers(), body: null }, close } as never)
    const f = await fixture()
    await f.ctx.securityWorkers.start(f.request)
    await vi.waitFor(() =>{  expect(f.ctx.securityWorkers.read(identity).runs[0]?.status).toBe('failed') })
    await f.ctx.securityWorkers.start(f.request)
    expect(request).toHaveBeenCalledTimes(1)
    expect(f.ctx.securityWorkers.read(identity).runs[0]?.evidence?.status).toBe(302)
    expect(f.create).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce()
  })
  it('retains bounded partial evidence when the byte cap is exceeded', async () => {
    vi.spyOn(publicHttpNetwork, 'resolve').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    vi.spyOn(publicHttpNetwork, 'request').mockResolvedValue({ response: { status: 200, headers: new Headers(), body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('abcdef')); controller.close() } }) }, close: async () => {} } as never)
    const f = await fixture()
    f.create.mockImplementation(async (options?: { sessionId: string }) => ({ dispose: async () => {}, agent: { followup: () => {}, whenIdle: async () => { f.ctx.emit('session/event', { id: options?.sessionId } as never, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } } as SessionEvent) }, session: { deriveMessages: () => [{ role: 'assistant', content: [{ type: 'text', text: JSON.stringify({ summary: 'Partial observation only.', findings: [] }) }] }] } } }) as never)
    await f.ctx.securityWorkers.start(f.request)
    await vi.waitFor(() => { expect(f.ctx.securityWorkers.read(identity).runs[0]?.status).toBe('completed') })
    expect(f.ctx.securityWorkers.read(identity).runs[0]?.evidence).toMatchObject({ bytes: 4, body: 'abcd', acquisition: 'partial', truncated: true })
    expect(typeof f.ctx.securityWorkers.read(identity).runs[0]?.evidence?.artifactId).toBe('string')
    expect(f.create).toHaveBeenCalledOnce()
  })
  it('cancellation rejects late DNS completion before target access', async () => {
    let finish!: (value: { address: string; family: 4 }[]) => void
    vi.spyOn(publicHttpNetwork, 'resolve').mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const network = vi.spyOn(publicHttpNetwork, 'request')
    const f = await fixture(); await f.ctx.securityWorkers.start(f.request)
    await vi.waitFor(() => { expect(finish).toBeTypeOf('function') })
    const cancellation = f.ctx.securityWorkers.cancel(identity)
    await vi.waitFor(() => { expect(finish).toBeTypeOf('function') })
    finish([{ address: '93.184.216.34', family: 4 }]); await cancellation
    expect(f.ctx.securityWorkers.read(identity).runs[0]?.status).toBe('cancelled')
    expect(network).not.toHaveBeenCalled()
  })
  it('persists actual evidence and the completed scoped-tool model summary', async () => {
    vi.spyOn(publicHttpNetwork, 'resolve').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    vi.spyOn(publicHttpNetwork, 'request').mockResolvedValue({ response: { status: 200, headers: new Headers({ 'set-cookie': 'secret' }), body: null }, close: async () => {} } as never)
    const f = await fixture(new Map(), { ...task, agentModels: { worker: { engine: 'claude', model: 'selected' } }, updatedAt: 2 })
    const dispose = vi.fn(async () => {})
    f.create.mockImplementation(async (options?: { sessionId: string }) => ({ dispose, agent: { followup: () => {}, whenIdle: async () => { f.ctx.emit('session/event', { id: options?.sessionId } as never, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } } as SessionEvent) }, session: { deriveMessages: () => [{ role: 'assistant', content: [{ type: 'text', text: JSON.stringify({ summary: 'One HTTP observation only.', findings: [] }) }] }] } } }) as never)
    await f.ctx.securityWorkers.start(f.request)
    await vi.waitFor(() =>{  expect(f.ctx.securityWorkers.read(identity).runs[0]?.status).toBe('completed') })
    expect(f.ctx.securityWorkers.read(identity).runs[0]).toMatchObject({ summary: 'One HTTP observation only.', evidence: { status: 200, headers: {}, bytes: 0 } })
    expect(dispose).toHaveBeenCalledOnce()
    expect(f.ctx.securityWorkers.read(identity).runs[0]?.snapshot.model.model).toBe('selected')
    expect(f.create).toHaveBeenCalledWith(expect.objectContaining({ agentOptions: { provider: 'security-worker-claude', model: 'selected' } }))
  })
  it('keeps real evidence when the model fails', async () => {
    vi.spyOn(publicHttpNetwork, 'resolve').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    vi.spyOn(publicHttpNetwork, 'request').mockResolvedValue({ response: { status: 200, headers: new Headers(), body: null }, close: async () => {} } as never)
    const f = await fixture(); await f.ctx.securityWorkers.start(f.request)
    await vi.waitFor(() =>{  expect(f.ctx.securityWorkers.read(identity).runs[0]?.status).toBe('failed') })
    expect(f.ctx.securityWorkers.read(identity).runs[0]?.evidence?.status).toBe(200)
  })
  it('marks durable running requests interrupted on restart without replaying requests', async () => {
    const f = await fixture()
    const stored: SecurityWorkerRun = { ...identity, id: 'old', requestId: 'old', planId: 'plan', itemId: 'item', assetId: 'asset', sessionId: 'security-worker-old' as SecurityWorkerRun['sessionId'], status: 'running', createdAt: 1, updatedAt: 1, snapshot: { recordRevision: 1, task, asset, item, model: { engine: 'claude', model: 'default' }, url: 'https://example.org/', limits: { requestTimeoutMs: 1000, responseBytes: 4, modelTimeoutMs: 1000 } } }
    const restored = await fixture(new Map([[stored.id, stored]]))
    expect(restored.ctx.securityWorkers.read(identity).runs[0]?.status).toBe('interrupted')
    expect(f.create).not.toHaveBeenCalled(); expect(restored.create).not.toHaveBeenCalled()
  })
  it('keeps completed execution status while persisting owner followups and deduplicating delivery', async () => {
    const stored: SecurityWorkerRun = { ...identity, id: 'old', requestId: 'old', planId: 'plan', itemId: 'item', assetId: 'asset', sessionId: 'security-worker-old' as SecurityWorkerRun['sessionId'], status: 'completed', createdAt: 1, updatedAt: 2, summary: 'Earlier observation', evidence: { url: 'https://example.org/', status: 200, headers: {}, body: 'retained', bytes: 8 }, snapshot: { recordRevision: 1, task, asset, item, model: { engine: 'claude', model: 'default' }, url: 'https://example.org/', limits: { requestTimeoutMs: 1000, responseBytes: 4, modelTimeoutMs: 1000 } } }
    const rows = new Map([[stored.id, stored]])
    const f = await fixture(rows)
    const followup = vi.fn()
    f.create.mockImplementation(async (options?: { sessionId: string }) => ({ dispose: async () => {}, agent: { followup, whenIdle: async () => { f.ctx.emit('session/event', { id: options?.sessionId } as never, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } } as SessionEvent) }, session: { deriveMessages: () => [{ role: 'assistant', content: [{ type: 'text', text: 'Retained evidence only; no new request.' }] }] } } }) as never)
    const network = vi.spyOn(publicHttpNetwork, 'request')
    const request = { ...identity, runId: 'old', requestId: 'owner-message', text: 'Explain the retained response' }
    await f.ctx.securityWorkers.send(request)
    await vi.waitFor(() => { expect(f.ctx.securityWorkers.read(identity).runs[0]?.conversationStatus).toBe('idle') })
    await f.ctx.securityWorkers.send(request)
    const run = f.ctx.securityWorkers.read(identity).runs[0]!
    expect(run.status).toBe('completed')
    expect(run.summary).toBe('Earlier observation')
    expect(run.transcript?.map(entry => entry.kind)).toEqual(['instruction', 'log', 'report', 'user', 'report'])
    expect(followup).toHaveBeenCalledOnce()
    expect(network).not.toHaveBeenCalled()
    vi.spyOn(f.ctx.securityPlanning, 'read').mockReturnValue({ plans: [{ id: 'review', status: 'ready', updatedAt: 3, snapshot: { workerRunIds: ['old'] }, reviewSummary: 'Planner reviewed the observation' }] } as never)
    const reviewed = f.ctx.securityWorkers.read(identity).runs[0]!
    expect(reviewed.transcript?.find(entry => entry.id === 'old-planner-review')).toMatchObject({ kind: 'instruction', text: 'Planner reviewed the observation', createdAt: 3 })
    expect(reviewed.transcript?.findIndex(entry => entry.id === 'old-planner-review')).toBeLessThan(reviewed.transcript?.findIndex(entry => entry.kind === 'user') ?? 0)

    await f.ctx.fiber.dispose()
    const restored = await fixture(rows)
    expect(restored.ctx.securityWorkers.read(identity).runs[0]?.transcript).toEqual(run.transcript)
    await restored.ctx.securityWorkers.send(request)
    expect(restored.create).not.toHaveBeenCalled()
  })
  it('retains failed followup and does not change the completed execution result', async () => {
    const stored: SecurityWorkerRun = { ...identity, id: 'old', requestId: 'old', planId: 'plan', itemId: 'item', assetId: 'asset', sessionId: 'security-worker-old' as SecurityWorkerRun['sessionId'], status: 'completed', createdAt: 1, updatedAt: 2, snapshot: { recordRevision: 1, task, asset, item, model: { engine: 'claude', model: 'default' }, url: 'https://example.org/', limits: { requestTimeoutMs: 1000, responseBytes: 4, modelTimeoutMs: 1000 } } }
    const f = await fixture(new Map([[stored.id, stored]]))
    await f.ctx.securityWorkers.send({ ...identity, runId: 'old', requestId: 'failed-message', text: 'Explain' })
    await vi.waitFor(() => { expect(f.ctx.securityWorkers.read(identity).runs[0]?.conversationStatus).toBe('failed') })
    expect(f.ctx.securityWorkers.read(identity).runs[0]?.status).toBe('completed')
    expect(f.ctx.securityWorkers.read(identity).runs[0]?.transcript?.map(entry => entry.kind)).toEqual(['instruction', 'user', 'error'])
  })

  it('queues one additional instruction during the initial request without dropping its transcript', async () => {
    let finish!: (value: { address: string; family: 4 }[]) => void
    vi.spyOn(publicHttpNetwork, 'resolve').mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const network = vi.spyOn(publicHttpNetwork, 'request').mockResolvedValue({ response: { status: 200, headers: new Headers(), body: null }, close: async () => {} } as never)
    const f = await fixture()
    f.create.mockImplementation(async (options?: { sessionId: string }) => ({ dispose: async () => {}, agent: { followup: () => {}, whenIdle: async () => { f.ctx.emit('session/event', { id: options?.sessionId } as never, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } } as SessionEvent) }, session: { deriveMessages: () => [{ role: 'assistant', content: [{ type: 'text', text: options?.sessionId.includes('discussion') ? 'Additional explanation' : JSON.stringify({ summary: 'Initial report', findings: [] }) }] }] } } }) as never)
    await f.ctx.securityWorkers.start(f.request)
    const runId = f.ctx.securityWorkers.read(identity).runs[0]!.id
    const accepted = await f.ctx.securityWorkers.send({ ...identity, runId, requestId: 'queued', text: 'Explain this response' })
    expect(accepted.runs[0]?.conversationStatus).toBe('running')
    await expect(f.ctx.securityWorkers.send({ ...identity, runId, requestId: 'other', text: 'More' })).rejects.toThrow('busy')
    await vi.waitFor(() => { expect(finish).toBeTypeOf('function') })
    finish([{ address: '93.184.216.34', family: 4 }])
    await vi.waitFor(() => { expect(f.ctx.securityWorkers.read(identity).runs[0]?.conversationStatus).toBe('idle') })
    const final = f.ctx.securityWorkers.read(identity).runs[0]!
    expect(final.status).toBe('completed')
    expect(final.transcript?.filter(entry => entry.kind === 'user')).toHaveLength(1)
    expect(final.transcript?.filter(entry => entry.kind === 'report').map(entry => entry.text)).toEqual(['Initial report', 'Additional explanation'])
    expect(network).toHaveBeenCalledOnce()
  })
  it('marks a queued followup interrupted on restart without changing its completed execution', async () => {
    const stored: SecurityWorkerRun = { ...identity, id: 'old', requestId: 'old', planId: 'plan', itemId: 'item', assetId: 'asset', sessionId: 'security-worker-old' as SecurityWorkerRun['sessionId'], status: 'completed', conversationStatus: 'running', createdAt: 1, updatedAt: 2, transcript: [{ id: 'queued', kind: 'user', text: 'Explain', requestId: 'queued', createdAt: 2 }], snapshot: { recordRevision: 1, task, asset, item, model: { engine: 'claude', model: 'default' }, url: 'https://example.org/', limits: { requestTimeoutMs: 1000, responseBytes: 4, modelTimeoutMs: 1000 } } }
    const f = await fixture(new Map([[stored.id, stored]]))
    expect(f.ctx.securityWorkers.read(identity).runs[0]).toMatchObject({ status: 'completed', conversationStatus: 'interrupted' })
    expect(f.create).not.toHaveBeenCalled()
  })

  it('cancels queued instructions without creating an additional discussion session', async () => {
    let finish!: (value: { address: string; family: 4 }[]) => void
    vi.spyOn(publicHttpNetwork, 'resolve').mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const f = await fixture()
    await f.ctx.securityWorkers.start(f.request)
    const runId = f.ctx.securityWorkers.read(identity).runs[0]!.id
    await f.ctx.securityWorkers.send({ ...identity, runId, requestId: 'queued', text: 'Explain' })
    await vi.waitFor(() => { expect(finish).toBeTypeOf('function') })
    const cancelled = f.ctx.securityWorkers.cancel({ ...identity, runId })
    await vi.waitFor(() => { expect(finish).toBeTypeOf('function') })
    finish([{ address: '93.184.216.34', family: 4 }])
    await cancelled
    expect(f.ctx.securityWorkers.read(identity).runs[0]).toMatchObject({ status: 'cancelled', conversationStatus: 'cancelled' })
    expect(f.create).toHaveBeenCalledOnce()
  })

})

describe('Worker observation response format correction', () => {
  const valid = JSON.stringify({ summary: 'Observed HTTP 200', findings: [] })
  async function replies(answers: string[], options: {
    onTurn?: (turn: number) => Promise<void>
    noCompletionOnTurn?: number
    modelTimeoutMs?: number
    responseBody?: string
  } = {}) {
    vi.spyOn(publicHttpNetwork, 'resolve').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    const network = vi.spyOn(publicHttpNetwork, 'request').mockImplementation(async () => ({ response: { status: 200, headers: new Headers(), body: options.responseBody === undefined ? null : new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(options.responseBody)); controller.close() } }) }, close: async () => {} }) as never)
    const f = await fixture(new Map(), task, Number.POSITIVE_INFINITY, item, {
      ...config, workerModelTimeoutMs: options.modelTimeoutMs ?? 1000,
    })
    const followup = vi.fn()
    const cancel = vi.fn()
    let turn = 0
    f.create.mockImplementation(async (request?: { sessionId: string }) => ({ dispose: async () => {}, agent: {
      followup, cancel,
      whenIdle: async () => {
        turn++
        await options.onTurn?.(turn)
        if (options.noCompletionOnTurn !== turn) f.ctx.emit('session/event', { id: request?.sessionId } as never, { type: 'turn/end', data: { reason: { kind: 'completed' } } } as SessionEvent)
      },
      session: { deriveMessages: () => [{ role: 'assistant', content: [{ type: 'text', text: answers[turn - 1] }] }] },
    } }) as never)
    await f.ctx.securityWorkers.start(f.request)
    return { ...f, network, followup, cancel }
  }
  it.each(['{"summary":"unescaped\nnewline","findings":[]}', '```json\n{"summary":', JSON.stringify({ summary: 'Missing findings' })])('repairs invalid report without repeating HTTP: %s', async (invalid) => {
    const f = await replies([invalid, valid])
    await vi.waitFor(() => { expect(f.ctx.securityWorkers.read(identity).runs[0]?.status).toBe('completed') })
    expect(f.network).toHaveBeenCalledTimes(1)
    expect(f.create).toHaveBeenCalledTimes(1)
    expect(f.followup).toHaveBeenCalledTimes(2)
    const correction = JSON.stringify(f.followup.mock.calls[1])
    for (const field of ['summary', 'findings', 'title', 'severity', 'proof', 'remediation']) expect(correction).toContain(field)
    expect(correction).toContain('JSON string values must escape literal newlines')
    expect(f.ctx.securityWorkers.read(identity).runs[0]?.summary).toBe('Observed HTTP 200')
  })
  it('uses one response when the first report is valid', async () => {
    const f = await replies([valid])
    await vi.waitFor(() => { expect(f.ctx.securityWorkers.read(identity).runs[0]?.status).toBe('completed') })
    expect(f.followup).toHaveBeenCalledTimes(1)
    expect(f.network).toHaveBeenCalledTimes(1)
  })
  it('retains HTTP evidence when the response budget is exhausted', async () => {
    const f = await replies(['{"summary":', '{"summary":'])
    await vi.waitFor(() => { expect(f.ctx.securityWorkers.read(identity).runs[0]?.status).toBe('failed') })
    const run = f.ctx.securityWorkers.read(identity).runs[0]
    expect(run?.error).toContain('Worker response format failed after 2 attempts')
    expect(run?.evidence?.status).toBe(200)
    expect(f.followup).toHaveBeenCalledTimes(2)
    expect(f.network).toHaveBeenCalledTimes(1)
  })
  it('repairs an unsupported proof within the same finite report budget without accepting it', async () => {
    const invalid = JSON.stringify({ summary: 'Claim', findings: [{ title: 'Claim', summary: 'Claimed impact', severity: 'high', proof: 'not in observation', remediation: 'Fix' }] })
    const f = await replies([invalid, invalid])
    await vi.waitFor(() => { expect(f.ctx.securityWorkers.read(identity).runs[0]?.status).toBe('failed') })
    expect(f.ctx.securityWorkers.read(identity).runs[0]?.error).toContain('Finding proof must quote')
    expect(f.ctx.securityWorkers.read(identity).runs[0]?.findings).toBeUndefined()
    expect(f.followup).toHaveBeenCalledTimes(2)
    expect(f.network).toHaveBeenCalledOnce()
  })
  it('repairs explanation-prefixed JSON instead of silently importing a legacy prose report', async () => {
    const f = await replies(['Sufficient evidence collected.\n```json\n' + valid + '\n```', valid])
    await vi.waitFor(() => { expect(f.ctx.securityWorkers.read(identity).runs[0]?.status).toBe('completed') })
    expect(f.ctx.securityWorkers.read(identity).runs[0]?.summary).toBe('Observed HTTP 200')
    expect(f.followup).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(f.followup.mock.calls[1])).toContain('no explanation before or after')
    expect(f.network).toHaveBeenCalledOnce()
  })
  it('repairs proof decorated with HTTP context into an exact captured body quotation', async () => {
    const finding = { title: 'Unauthorized access', summary: 'Cross-user response', severity: 'high', remediation: 'Check object ownership' }
    const f = await replies([
      JSON.stringify({ summary: 'Observed access', findings: [{ ...finding, proof: 'GET https://example.org/ -> 200, body: IDOR' }] }),
      JSON.stringify({ summary: 'Observed access', findings: [{ ...finding, proof: 'IDOR' }] }),
    ], { responseBody: 'IDOR' })
    await vi.waitFor(() => { expect(f.ctx.securityWorkers.read(identity).runs[0]?.status).toBe('completed') })
    expect(f.ctx.securityWorkers.read(identity).runs[0]?.findings).toEqual([{ ...finding, proof: 'IDOR' }])
    expect(JSON.stringify(f.followup.mock.calls[1])).toContain('Do not add an HTTP method, URL, status')
    expect(f.followup).toHaveBeenCalledTimes(2)
    expect(f.network).toHaveBeenCalledOnce()
  })
  it('does not inherit first-turn completion for an incomplete correction', async () => {
    const f = await replies(['{"summary":', valid], { noCompletionOnTurn: 2 })
    await vi.waitFor(() => { expect(f.ctx.securityWorkers.read(identity).runs[0]?.status).toBe('failed') })
    expect(f.ctx.securityWorkers.read(identity).runs[0]?.error).toContain('did not complete')
    expect(f.network).toHaveBeenCalledTimes(1)
  })
  it.each(['cancel', 'timeout'] as const)('cannot commit late corrected output after %s', async (stop) => {
    let release: (() => void) | undefined
    const blocked = new Promise<void>((resolve) => { release = resolve })
    const timers = vi.spyOn(globalThis, 'setTimeout')
    const f = await replies(['{"summary":', valid], { modelTimeoutMs: stop === 'timeout' ? 177 : 1000,
      onTurn: async (turn) => { if (turn === 2) await blocked } })
    await vi.waitFor(() => { expect(f.followup).toHaveBeenCalledTimes(2) })
    const cancellation = stop === 'cancel' ? f.ctx.securityWorkers.cancel(identity) : undefined
    if (stop === 'timeout') {
      await vi.waitFor(() => { expect(f.cancel).toHaveBeenCalled() })
      expect(timers.mock.calls.filter(call => call[1] === 177)).toHaveLength(1)
    }
    release?.()
    await cancellation
    await vi.waitFor(() => { expect(f.ctx.securityWorkers.read(identity).runs[0]?.status).toBe(stop === 'cancel' ? 'cancelled' : 'failed') })
    const run = f.ctx.securityWorkers.read(identity).runs[0]
    expect(run?.summary).toBeUndefined()
    expect(run?.evidence?.status).toBe(200)
    expect(f.network).toHaveBeenCalledTimes(1)
    expect(f.followup).toHaveBeenCalledTimes(2)
  })
})
