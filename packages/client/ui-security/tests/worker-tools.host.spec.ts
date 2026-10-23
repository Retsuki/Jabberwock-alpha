import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { publicHttpNetwork } from '@deepseek-ai/dsh-web-fetch-http/network'
import { workerInvestigationTools } from '../src/security-worker-tools.ts'
import type { ExplorationWorkerCapability } from '../src/exploration-types.ts'
import type { WorkerToolContext } from '../src/security-worker-tools.ts'
import type { SecurityWorkerRun } from '../src/worker-types.ts'
vi.mock('@deepseek-ai/dsh-http-proxy', () => ({ proxyRouteFor: () => ({ proxied: false }) }))
let home: string
beforeEach(async () => { home = await mkdtemp(join(tmpdir(), 'jw-worker-tools-')); vi.stubEnv('DSH_HOME', home) })
afterEach(async () => { await rm(home, { recursive: true, force: true }); vi.restoreAllMocks(); vi.unstubAllEnvs() })
function fixture(constraints: SecurityWorkerRun['snapshot']['task']['constraints'] = [], exploration?: ExplorationWorkerCapability) {
  const abort = new AbortController()
  const run: SecurityWorkerRun = {
    workspaceId: 'workspace' as SecurityWorkerRun['workspaceId'], taskId: 'task', id: 'run', requestId: 'request', planId: 'plan', itemId: 'item', assetId: 'asset', sessionId: 'worker' as SecurityWorkerRun['sessionId'], status: 'running', createdAt: 0, updatedAt: 0,
    observations: [], httpRequests: 0, snapshot: {
      recordRevision: 1, model: { engine: 'claude', model: 'default' }, url: 'https://example.org/',
      task: { id: 'task', name: 'Review', description: '', objective: 'Review', status: 'draft', assetIds: ['asset'], constraints, archived: false, pinned: false, createdAt: 0, updatedAt: 0 },
      asset: { id: 'asset', companyId: 'company', kind: 'domain', value: 'example.org' },
      item: { id: 'item', title: 'Review', purpose: 'Observe', approach: 'Use tools', targetAssetIds: ['asset'], status: 'pending' },
      limits: { requestTimeoutMs: 1000, responseBytes: 4096, modelTimeoutMs: 1000, maxRequests: 2 },
    },
  }
  const save = vi.fn(async () => {})
  const approve = vi.fn(async () => true)
  const check = vi.fn(() => { abort.signal.throwIfAborted() })
  const command = vi.fn(async () => 'offline result')
  const context: WorkerToolContext = { exploration, run, signal: abort.signal, localHttpOrigins: [], maxCalls: 20, save, approve, check,
    workspace: Promise.resolve({ root: '/tmp/worker-tools-fixture', list: async () => '[]', read: async () => 'retained', write: async () => 'saved', command }),
  }
  const tools = workerInvestigationTools(context)
  const call = (name: string, input: unknown, signal = abort.signal) => {
    const tool = tools.find(candidate => candidate.name === name)
    if (!tool) throw new Error('Missing fixture tool')
    return tool.execute(input, signal)
  }
  vi.spyOn(publicHttpNetwork, 'resolve').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
  const network = vi.spyOn(publicHttpNetwork, 'request').mockImplementation(async url => ({ response: { status: 200, headers: new Headers(), body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(url.pathname)); controller.close() } }) }, close: async () => {} }) as never)
  return { run, abort, save, approve, check, call, network, context, command }
}
it('runs multiple model-selected requests and retains every observation under one finite budget', async () => {
  const f = fixture()
  expect(f.network).not.toHaveBeenCalled()
  expect(await f.call('http_request', { url: 'https://example.org/first?q=test', method: 'GET' })).toContain('/first')
  expect(await f.call('http_request', { url: 'https://example.org/second', method: 'GET' })).toContain('/second')
  expect(f.run.observations?.map(value => value.body)).toEqual(['/first', '/second'])
  expect(f.run.httpRequests).toBe(2)
  await expect(f.call('http_request', { url: 'https://example.org/third', method: 'GET' })).rejects.toThrow('budget exhausted')
  expect(f.network).toHaveBeenCalledTimes(2)
  expect(f.save).toHaveBeenCalled()
  expect(await f.call('read_evidence', { index: 0, offset: 0, length: 6 })).toContain('/first')
  expect(f.network).toHaveBeenCalledTimes(2)
})
it('rejects scope violations and aborted queued calls without target access', async () => {
  const f = fixture()
  await expect(f.call('http_request', { url: 'https://attacker.org/', method: 'GET' })).rejects.toThrow('registered hostname')
  const aborted = new AbortController(); aborted.abort()
  await expect(f.call('http_request', { url: 'https://example.org/', method: 'GET' }, aborted.signal)).rejects.toThrow()
  expect(f.network).not.toHaveBeenCalled()
})
it('asks for approval only after saved permission and rechecks lifecycle after approval', async () => {
  const denied = fixture()
  await expect(denied.call('http_request', { url: 'https://example.org/', method: 'POST' })).rejects.toThrow('Explicit allow')
  expect(denied.approve).not.toHaveBeenCalled()
  const f = fixture([{ id: 'p', action: 'allow', text: 'POST' }])
  f.approve.mockImplementation(async () => { f.abort.abort(new Error('Task changed')); return true })
  await expect(f.call('http_request', { url: 'https://example.org/', method: 'POST' })).rejects.toThrow('Task changed')
  expect(f.approve).toHaveBeenCalledOnce()
  expect(f.network).not.toHaveBeenCalled()
})
it('prevents unapproved offline execution and respects the shared tool-call budget', async () => {
  const f = fixture([{ id: 'offline', action: 'allow', text: 'offline analysis' }])
  f.approve.mockResolvedValue(false)
  await expect(f.call('offline_command', { command: 'wc -c sample.txt' })).rejects.toThrow('did not approve')
  expect(f.command).not.toHaveBeenCalled()
  const limited = workerInvestigationTools({ ...f.context, maxCalls: 1 }).find(tool => tool.name === 'list_files')!
  await limited.execute({}, f.abort.signal)
  await expect(limited.execute({}, f.abort.signal)).rejects.toThrow('tool-call limit')
})

it('stops before network when durable tool logging fails', async () => {
  const f = fixture()
  f.save.mockRejectedValue(new Error('Storage unavailable'))
  await expect(f.call('http_request', { url: 'https://example.org/', method: 'GET' })).rejects.toThrow('Storage unavailable')
  expect(f.network).not.toHaveBeenCalled()
})
it('rechecks current authorization before every additional request', async () => {
  const f = fixture()
  await f.call('http_request', { url: 'https://example.org/first', method: 'GET' })
  f.check.mockImplementation(() => { throw new Error('Task scope changed') })
  await expect(f.call('http_request', { url: 'https://example.org/second', method: 'GET' })).rejects.toThrow('scope changed')
  expect(f.network).toHaveBeenCalledOnce()
})

it('refuses offline commands without saved permission before asking for approval', async () => {
  const f = fixture()
  await expect(f.call('offline_command', { command: 'wc -c sample.txt' })).rejects.toThrow('requires explicit saved permission')
  expect(f.approve).not.toHaveBeenCalled()
  expect(f.command).not.toHaveBeenCalled()
})
it('aborts in-flight HTTP when the model tool-call signal is cancelled', async () => {
  const f = fixture()
  let transportSignal: AbortSignal | undefined
  f.network.mockImplementation(async (_url, _addresses, _headers, signal) => {
    transportSignal = signal
    return new Promise((_resolve, reject) => {
      if (signal.aborted) { reject(signal.reason instanceof Error ? signal.reason : new Error('Tool call cancelled')); return }
      signal.addEventListener('abort', () => { reject(signal.reason instanceof Error ? signal.reason : new Error('Tool call cancelled')) }, { once: true })
    })
  })
  const operation = new AbortController()
  const pending = f.call('http_request', { url: 'https://example.org/', method: 'GET' }, operation.signal)
  const rejected = expect(pending).rejects.toThrow('Model turn cancelled')
  await vi.waitFor(() => { expect(transportSignal).toBeDefined() })
  operation.abort(new Error('Model turn cancelled'))
  await rejected
  expect(transportSignal?.aborted).toBe(true)
  expect(f.abort.signal.aborted).toBe(false)
  expect(f.network).toHaveBeenCalledOnce()
})

it('logs bounded shared reads and publishes observation-backed facts through the bound capability', async () => {
  const state = { revision: 2, nodes: [{ id: 'fact:run:negative', kind: 'fact' as const,
    summary: 'Anonymous request was denied', state: 'observed', assetIds: ['asset'] }], edges: [] }
  const read = vi.fn(async () => state)
  const publishFact = vi.fn(async () => state)
  const f = fixture([], { read, publishFact })
  await f.call('http_request', { method: 'GET', url: 'https://example.org/negative' })
  const before = f.run.httpRequests
  expect(await f.call('read_exploration', { nodeIds: ['fact:run:negative'] })).toContain('Anonymous request was denied')
  await f.call('publish_fact', { requestId: 'negative', summary: 'Anonymous request was denied', observationIndexes: [0], quote: '/negative' })
  expect(publishFact).toHaveBeenCalledExactlyOnceWith({ requestId: 'negative', summary: 'Anonymous request was denied',
    observationIndexes: [0], quote: '/negative' })
  expect(read).toHaveBeenLastCalledWith({ nodeIds: ['fact:run:negative'] })
  expect(f.run.httpRequests).toBe(before)
  expect(f.run.transcript?.some(entry => entry.text.includes('read_exploration result') && entry.text.includes('Anonymous request was denied'))).toBe(true)
  expect(f.run.transcript?.some(entry => entry.text.includes('publish_fact result'))).toBe(true)
  await expect(f.call('publish_fact', { taskId: 'other', requestId: 'invented', summary: 'Claim', observationIndexes: [0], quote: '/negative' })).rejects.toThrow()
  expect(publishFact).toHaveBeenCalledOnce()
})
it('retains publication validation failures without turning unsupported claims into shared facts', async () => {
  const publishFact = vi.fn(async () => { throw new Error('Quote is not captured evidence') })
  const f = fixture([], { read: async () => ({ revision: 0, nodes: [], edges: [] }), publishFact })
  await expect(f.call('publish_fact', { requestId: 'claim', summary: 'Unverified claim', observationIndexes: [1], quote: 'invented' })).rejects.toThrow('not captured')
  expect(f.run.transcript?.at(-1)).toMatchObject({ kind: 'error' })
  expect(f.run.httpRequests).toBe(0)
  expect(f.network).not.toHaveBeenCalled()
})
