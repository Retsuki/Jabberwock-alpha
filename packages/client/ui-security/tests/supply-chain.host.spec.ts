import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import LocalJobRegistry from '@deepseek-ai/dsh-jobs-local'
import * as ToolJobs from '@deepseek-ai/dsh-tool-jobs'
import { SecuritySupplyChainService } from '../src/security-supply-chain.ts'
import type { SupplyChainRun } from '../src/supply-chain-types.ts'
const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { vi.unstubAllGlobals(); for (const dispose of cleanup.splice(0).reverse()) await dispose() })
async function setup(
  fetcher: typeof fetch = async () => new Response('{}'), throughLoader = false,
) {
  const root = await mkdtemp(join(tmpdir(), 'supply-chain-host-')); cleanup.push(() => rm(root, { recursive: true, force: true }))
  await writeFile(join(root, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: { '': {}, 'node_modules/is-number': { version: '7.0.0' } } }))
  const ctx = new Context()
  // `sessions` is the durable log; `resident` is the live Session store that `ctx.sessions` exposes.
  cleanup.push(() => ctx.fiber.dispose()); const sessions = new Map<SessionId, Session>(); const resident = new Map<SessionId, Session>()
  const workspaceId = 'registered' as WorkspaceId
  const workspace = { id: workspaceId, path: root, sessionIds: [] as SessionId[] }
  const followup = vi.fn(), inject = vi.fn(), flush = vi.fn(async () => {})
  ctx.provide('workspaceRegistry', { list: () => [workspace], get: (id: WorkspaceId) => id === workspaceId ? workspace : undefined } as never)
  ctx.provide('sessions', { get: (id: SessionId) => resident.get(id) } as never)
  ctx.provide('sessionPersistence', { open: async (id: SessionId) => ({ read: async (offset = 0, length = 100000) => ({ events: sessions.get(id)?.snapshotEvents().slice(offset, offset + length) ?? [] }), close: async () => {} }), flush } as never)
  const observed = vi.fn(async (id: SessionId, options: { projectionMode: string }) => {
    expect(options.projectionMode).toBe('none')
    const session = sessions.get(id)
    if (!session) throw new Error('Session unavailable')
    return { header: session.header, inheritedEventCount: session.inheritedEventCount,
      events: session.snapshotEvents(), [Symbol.dispose]: observationDisposed }
  })
  const observationDisposed = vi.fn(), coldSnapshot = vi.fn()
  ctx.provide('sessionQuery', { observeSession: observed } as never)
  ctx.provide('sessionProjectionCache', { coldSnapshot } as never)
  await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime); await ctx.plugin(AgentRegistry)
  await ctx.plugin(LocalJobRegistry); await ctx.plugin(ToolJobs)
  const resume = vi.fn(async (_owner: Context, options: { resumeSessionId: SessionId }) => {
    const session = sessions.get(options.resumeSessionId); if (!session) throw new Error('Session log unavailable')
    resident.set(options.resumeSessionId, session)
    return { agent: { id: options.resumeSessionId, session } as never as Agent, dispose: async () => {} }
  })
  ctx.agents.setFactory({ createAgent: async () => { throw new Error('Unexpected agent creation') }, resume })
  ctx.provide('sessionController', { create: async () => {
    const id = SessionId(`scanner-${sessions.size}`); const session = Session.create(id); sessions.set(id, session); resident.set(id, session); workspace.sessionIds.push(id)
    const scope = ctx.plugin(() => {})
    const agent = { id, session, ctx: scope.ctx, status: 'idle', followup, inject, options: {}, whenIdle: async () => {}, cancel: () => {} } as never as Agent
    await ctx.agents.register(agent)
    return { sessionId: id }
  }, rename: vi.fn(async () => ({})) } as never)
  vi.stubGlobal('fetch', fetcher)
  let fiber
  if (throughLoader) {
    await writeFile(join(root, 'cordis.yml'), '- name: security-supply-chain\n')
    ctx.baseUrl = pathToFileURL(root).href + '/'
    await ctx.plugin(Loader); ctx.loader.builtins.include = Include
    ctx.loader.internal = { version: 'v2', async import(name: string) { if (name === 'security-supply-chain') return SecuritySupplyChainService; throw new Error('Unexpected composition import') } } as never
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(join(root, 'cordis.yml')).href } }); await ctx.loader.await()
    fiber = ctx.fiber
  } else fiber = await ctx.plugin(SecuritySupplyChainService)
  const start = (requestId = 'click') => ctx.securitySupplyChain.start({ workspaceId, requestId })
  async function terminal(run: SupplyChainRun) { for (let i = 0; i < 100; i++) { const result = (ctx.securitySupplyChain.read({ workspaceId, runId: run.runId })).run!; if (result.status !== 'running') { await new Promise(resolve => setTimeout(resolve, 0)); return result }; await new Promise(resolve => setTimeout(resolve, 2)) }; throw new Error('Check did not settle') }
  return {
    ctx, workspaceId, sessions, resident, resume, start, terminal, followup, inject, flush, fiber, root, observed,
    observationDisposed, coldSnapshot,
  }
}
it('runs a fixed job and persists an ordinary notice without any model wake or injection', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response('{}')); const f = await setup(fetcher)
  const run = await f.start(); const result = await f.terminal(run)
  expect(result.status).toBe('completed'); expect(fetcher).toHaveBeenCalledTimes(1)
  expect(f.followup).not.toHaveBeenCalled(); expect(f.inject).not.toHaveBeenCalled()
  const events = f.sessions.get(run.sessionId)!.snapshotEvents(); const notices = events.filter(event => event.type === 'user/message' && event.data.source.kind === 'security-supply-chain')
  expect(notices).toHaveLength(4); expect(JSON.stringify(notices.at(-1))).toContain('known published dependency advisories')
  expect(events.some(event => event.type === 'assistant/message')).toBe(false)
})
it('deduplicates concurrent starts and stable request retries', async () => {
  const f = await setup()
  const [a, b] = await Promise.all([f.start(), f.start()]); expect(a.runId).toBe(b.runId); expect(f.sessions.size).toBe(1)
  await f.terminal(a); expect((await f.start()).runId).toBe(a.runId)
})
it('immediate producer failure is collected, never waking the model', async () => {
  const f = await setup(async () => { throw new Error('transport unavailable') }); const result = await f.terminal(await f.start())
  expect(result.status).toBe('failed'); expect(result.message).toContain('transport'); expect(f.followup).not.toHaveBeenCalled(); expect(f.inject).not.toHaveBeenCalled()
})
it('cancels an owned job and waits for its terminal notice without waking the model', async () => {
  const f = await setup(async (_url, init) => new Promise((_resolve, reject) => { init!.signal!.addEventListener('abort', () => { reject(new Error('aborted')) }, { once: true }) }))
  const run = await f.start(); const result = await f.ctx.securitySupplyChain.cancel({ workspaceId: f.workspaceId, runId: run.runId })
  expect(result.status).toBe('cancelled'); expect(f.followup).not.toHaveBeenCalled(); expect(f.inject).not.toHaveBeenCalled()
})
it('rejects arbitrary client paths and foreign Workspace/run identities', async () => {
  const f = await setup(); await expect(f.ctx.securitySupplyChain.start({ workspaceId: f.workspaceId, requestId: 'x', cwd: '/tmp' } as never)).rejects.toThrow()
  await expect(f.ctx.securitySupplyChain.start({ workspaceId: 'foreign' as WorkspaceId, requestId: 'x' })).rejects.toThrow('Workspace')
  await expect(f.ctx.securitySupplyChain.cancel({ workspaceId: f.workspaceId, runId: 'foreign' })).rejects.toThrow('not found')
})
it('reopens persisted notices and never automatically rescans after service restart', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response('{}')); const f = await setup(fetcher); const run = await f.start(); await f.terminal(run)
  await f.fiber.dispose(); await f.ctx.plugin(SecuritySupplyChainService)
  expect((f.ctx.securitySupplyChain.read({ workspaceId: f.workspaceId })).run?.runId).toBe(run.runId)
  expect(fetcher).toHaveBeenCalledTimes(1)
})
it('marks prior running notices interrupted on restart without starting work', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response('{}')); const f = await setup(fetcher); const run = await f.start(); const result = await f.terminal(run)
  const { createUserMessage } = await import('@deepseek-ai/dsh-llm')
  const session = f.sessions.get(run.sessionId)!
  session.append('user/message', createUserMessage({ source: { kind: 'security-supply-chain', form: 'notice', summary: 'Supply-chain check', owner: run.sessionId, run: { ...result, status: 'running', phase: 'advisories' } }, content: [{ type: 'text', text: 'Checking' }] }), { surfaceOp: 'append' })
  await f.fiber.dispose(); await f.ctx.plugin(SecuritySupplyChainService)
  const restored = (f.ctx.securitySupplyChain.read({ workspaceId: f.workspaceId })).run
  expect(restored?.status).toBe('interrupted'); expect(restored?.markdown).toContain('No automatic'); expect(fetcher).toHaveBeenCalledTimes(1); expect(f.followup).not.toHaveBeenCalled()
})
it('does not adopt a copied notice with mismatched run owner or Workspace', async () => {
  const f = await setup(); const run = await f.start(); const result = await f.terminal(run)
  const { createUserMessage } = await import('@deepseek-ai/dsh-llm')
  f.sessions.get(run.sessionId)!.append('user/message', createUserMessage({ source: { kind: 'security-supply-chain', form: 'notice', summary: 'Copied', owner: SessionId('foreign'), run: { ...result, runId: 'forged' } }, content: [{ type: 'text', text: 'Copied' }] }), { surfaceOp: 'append' })
  await f.fiber.dispose(); await f.ctx.plugin(SecuritySupplyChainService)
  expect((f.ctx.securitySupplyChain.read({ workspaceId: f.workspaceId, runId: 'forged' })).run).toBeUndefined()
})

it('loads the dedicated owner through a real Loader composition without invoking a model', async () => {
  const f = await setup(async () => new Response('{}'), true); const run = await f.start(); expect((await f.terminal(run)).status).toBe('completed'); expect(f.followup).not.toHaveBeenCalled(); expect(f.inject).not.toHaveBeenCalled()
})
it('reads terminal snapshots beyond the first restored page and strips unknown metadata', async () => {
  const f = await setup(); const run = await f.start(); const result = await f.terminal(run)
  const { createUserMessage } = await import('@deepseek-ai/dsh-llm'); const session = f.sessions.get(run.sessionId)!
  for (let index = 0; index < 80; index++) session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Ordinary owner note' }] }), { surfaceOp: 'append' })
  session.append('user/message', createUserMessage({ source: { kind: 'security-supply-chain', form: 'notice', summary: 'Final', owner: run.sessionId, run: { ...result, message: 'Latest terminal record', futureMetadata: 'not adopted' } as never }, content: [{ type: 'text', text: 'Latest terminal record' }] }), { surfaceOp: 'append' })
  await f.fiber.dispose(); await f.ctx.plugin(SecuritySupplyChainService)
  const restored = f.ctx.securitySupplyChain.read({ workspaceId: f.workspaceId }).run
  expect(restored?.message).toBe('Latest terminal record'); expect(restored).not.toHaveProperty('futureMetadata')
})
it('rejects malformed persisted optional finding fields rather than crashing report projection', async () => {
  const f = await setup(); const run = await f.start(); const result = await f.terminal(run)
  const { createUserMessage } = await import('@deepseek-ai/dsh-llm'); const session = f.sessions.get(run.sessionId)!
  session.append('user/message', createUserMessage({ source: { kind: 'security-supply-chain', form: 'notice', summary: 'Malformed', owner: run.sessionId, run: { ...result, runId: 'malformed', findings: [{ package: 'package', version: '1.0.0', title: 'Advisory', description: { invalid: true }, severity: 'high', vulnerableRange: '<2', advisoryUrl: 'https://example.org', cveIds: [], cweIds: [], fixStatus: 'unknown', relationship: 'unknown', environment: 'unknown' }] } as never }, content: [{ type: 'text', text: 'Malformed copied report' }] }), { surfaceOp: 'append' })
  await f.fiber.dispose(); await f.ctx.plugin(SecuritySupplyChainService)
  expect(f.ctx.securitySupplyChain.read({ workspaceId: f.workspaceId, runId: 'malformed' }).run).toBeUndefined()
})

it('warms exact metadata from the same full observation used for restore, disposing the read cut', async () => {
  const f = await setup(); const run = await f.start(); await f.terminal(run)
  const session = f.sessions.get(run.sessionId)!
  await f.fiber.dispose(); await f.ctx.plugin(SecuritySupplyChainService)
  expect(f.observed).toHaveBeenCalledTimes(1); expect(f.observationDisposed).toHaveBeenCalledTimes(1)
  expect(f.coldSnapshot).toHaveBeenCalledWith(session.header, session.inheritedEventCount, session.snapshotEvents())
  expect(f.ctx.securitySupplyChain.read({ workspaceId: f.workspaceId }).run?.runId).toBe(run.runId)
  expect(f.followup).not.toHaveBeenCalled(); expect(f.inject).not.toHaveBeenCalled()
})
it('skips unreadable observations without starting work or warming partial metadata', async () => {
  const f = await setup(); const run = await f.start(); await f.terminal(run); await f.fiber.dispose()
  f.observed.mockRejectedValueOnce(new Error('Unreadable Session'))
  await f.ctx.plugin(SecuritySupplyChainService)
  expect(f.coldSnapshot).not.toHaveBeenCalled(); expect(f.observationDisposed).not.toHaveBeenCalled()
  expect(f.ctx.securitySupplyChain.read({ workspaceId: f.workspaceId }).run).toBeUndefined()
  expect(f.followup).not.toHaveBeenCalled(); expect(f.inject).not.toHaveBeenCalled()
})

it('retains saved results when an unrelated summary projection cannot be rebuilt', async () => {
  const f = await setup(); const run = await f.start(); await f.terminal(run)
  await f.fiber.dispose(); f.coldSnapshot.mockImplementation(() => { throw new Error('Projection unavailable') })
  await f.ctx.plugin(SecuritySupplyChainService)
  expect(f.ctx.securitySupplyChain.read({ workspaceId: f.workspaceId }).run?.runId).toBe(run.runId)
  expect(f.observationDisposed).toHaveBeenCalledTimes(1)
  expect(f.followup).not.toHaveBeenCalled(); expect(f.inject).not.toHaveBeenCalled()
})
async function appendSecondRun(f: Awaited<ReturnType<typeof setup>>, first: SupplyChainRun): Promise<void> {
  const { createUserMessage } = await import('@deepseek-ai/dsh-llm')
  f.sessions.get(first.sessionId)!.append('user/message', createUserMessage({ source: { kind: 'security-supply-chain', form: 'notice', summary: 'Supply-chain check', owner: first.sessionId, run: { ...first, runId: 'second', requestId: 'second-request', createdAt: first.createdAt + 1 } }, content: [{ type: 'text', text: 'Second run' }] }), { surfaceOp: 'append' })
}
const noticeCount = (f: Awaited<ReturnType<typeof setup>>, sessionId: SessionId) => f.sessions.get(sessionId)!.snapshotEvents().filter(event => event.type === 'user/message' && event.data.source.kind === 'security-supply-chain').length
it('deletes one finished run logically, keeps its Session evidence and the other run in the same Session, and survives restart', async () => {
  const f = await setup(); const first = await f.terminal(await f.start()); await appendSecondRun(f, first)
  await f.fiber.dispose(); const restarted = await f.ctx.plugin(SecuritySupplyChainService)
  expect(f.ctx.securitySupplyChain.list({ workspaceId: f.workspaceId }).runs.map(run => run.runId).sort()).toEqual([first.runId, 'second'].sort())
  const before = noticeCount(f, first.sessionId)
  const removed = await f.ctx.securitySupplyChain.deleteRun({ workspaceId: f.workspaceId, runId: first.runId })
  expect(removed.runId).toBe(first.runId); expect(removed.deletedAt).toBeGreaterThan(0)
  expect(f.ctx.securitySupplyChain.list({ workspaceId: f.workspaceId }).runs.map(run => run.runId)).toEqual(['second'])
  expect(f.ctx.securitySupplyChain.read({ workspaceId: f.workspaceId, runId: first.runId }).run).toBeUndefined()
  expect(f.ctx.securitySupplyChain.read({ workspaceId: f.workspaceId }).run?.runId).toBe('second')
  await expect(f.ctx.securitySupplyChain.repair({ workspaceId: f.workspaceId, runId: first.runId, requestId: 'after-delete' })).rejects.toThrow('not found')
  await expect(f.ctx.securitySupplyChain.cancel({ workspaceId: f.workspaceId, runId: first.runId })).rejects.toThrow('not found')
  expect(noticeCount(f, first.sessionId)).toBe(before + 1)
  expect(f.sessions.get(first.sessionId)!.snapshotEvents().some(event => event.type === 'user/message' && event.data.source.kind === 'security-supply-chain' && event.data.source.run.runId === first.runId && event.data.source.run.deletedAt === undefined && event.data.source.run.findings !== undefined)).toBe(true)
  await restarted.dispose(); await f.ctx.plugin(SecuritySupplyChainService)
  expect(f.ctx.securitySupplyChain.list({ workspaceId: f.workspaceId }).runs.map(run => run.runId)).toEqual(['second'])
  expect(f.ctx.securitySupplyChain.read({ workspaceId: f.workspaceId, runId: first.runId }).run).toBeUndefined()
  expect(await f.ctx.securitySupplyChain.deleteRun({ workspaceId: f.workspaceId, runId: first.runId })).toEqual(removed)
  expect(f.followup).not.toHaveBeenCalled(); expect(f.inject).not.toHaveBeenCalled()
})
it('refuses to delete a running check, deletes it after it is stopped, and never stops another job', async () => {
  const f = await setup(async (_url, init) => new Promise((_resolve, reject) => { init!.signal!.addEventListener('abort', () => { reject(new Error('aborted')) }, { once: true }) }))
  const run = await f.start()
  await expect(f.ctx.securitySupplyChain.deleteRun({ workspaceId: f.workspaceId, runId: run.runId })).rejects.toThrow('running')
  expect(f.ctx.securitySupplyChain.read({ workspaceId: f.workspaceId, runId: run.runId }).run?.status).toBe('running')
  await f.ctx.securitySupplyChain.cancel({ workspaceId: f.workspaceId, runId: run.runId })
  await f.ctx.securitySupplyChain.deleteRun({ workspaceId: f.workspaceId, runId: run.runId })
  expect(f.ctx.securitySupplyChain.list({ workspaceId: f.workspaceId }).runs).toEqual([])
})
it('rejects deletion of unknown or foreign runs and malformed requests without changing saved results', async () => {
  const f = await setup(); const run = await f.terminal(await f.start())
  await expect(f.ctx.securitySupplyChain.deleteRun({ workspaceId: f.workspaceId, runId: 'unknown' })).rejects.toThrow('not found')
  await expect(f.ctx.securitySupplyChain.deleteRun({
    workspaceId: 'foreign' as WorkspaceId, runId: run.runId,
  })).rejects.toThrow('Workspace')
  await expect(f.ctx.securitySupplyChain.deleteRun({
    workspaceId: f.workspaceId, runId: run.runId, extra: true,
  } as never)).rejects.toThrow()
  expect(f.ctx.securitySupplyChain.list({ workspaceId: f.workspaceId }).runs).toHaveLength(1)
})
it('reports an unconfirmed deletion write while memory and the Session log stay consistent', async () => {
  const f = await setup(); const run = await f.terminal(await f.start())
  f.flush.mockRejectedValueOnce(new Error('disk full'))
  await expect(f.ctx.securitySupplyChain.deleteRun({ workspaceId: f.workspaceId, runId: run.runId })).rejects.toThrow('disk full')
  expect(f.ctx.securitySupplyChain.list({ workspaceId: f.workspaceId }).runs).toEqual([])
  await f.fiber.dispose(); await f.ctx.plugin(SecuritySupplyChainService)
  expect(f.ctx.securitySupplyChain.list({ workspaceId: f.workspaceId }).runs).toEqual([])
})
it('deletes a restored run whose Session is not resident by resuming it without a model, then survives restart', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response('{}')); const f = await setup(fetcher); const first = await f.terminal(await f.start())
  await f.fiber.dispose(); f.resident.clear(); const restarted = await f.ctx.plugin(SecuritySupplyChainService)
  expect(f.ctx.sessions.get(first.sessionId)).toBeUndefined(); expect(f.resume).not.toHaveBeenCalled()
  const before = noticeCount(f, first.sessionId)
  const removed = await f.ctx.securitySupplyChain.deleteRun({ workspaceId: f.workspaceId, runId: first.runId })
  expect(f.resume).toHaveBeenCalledTimes(1); expect(f.resume.mock.calls[0]![1]).toEqual({ resumeSessionId: first.sessionId })
  expect(noticeCount(f, first.sessionId)).toBe(before + 1)
  expect(f.ctx.securitySupplyChain.list({ workspaceId: f.workspaceId }).runs).toEqual([])
  await restarted.dispose(); f.resident.clear(); await f.ctx.plugin(SecuritySupplyChainService)
  expect(f.ctx.securitySupplyChain.list({ workspaceId: f.workspaceId }).runs).toEqual([])
  expect(fetcher).toHaveBeenCalledTimes(1); expect(f.followup).not.toHaveBeenCalled(); expect(f.inject).not.toHaveBeenCalled()
  expect(removed.deletedAt).toBeGreaterThan(0)
})
it('leaves the run visible and retryable without a tombstone when the Session cannot be resumed', async () => {
  const f = await setup(); const first = await f.terminal(await f.start())
  await f.fiber.dispose(); f.resident.clear(); await f.ctx.plugin(SecuritySupplyChainService)
  const before = noticeCount(f, first.sessionId)
  f.resume.mockRejectedValueOnce(new Error('Session log unreadable'))
  await expect(f.ctx.securitySupplyChain.deleteRun({ workspaceId: f.workspaceId, runId: first.runId })).rejects.toThrow('unreadable')
  expect(noticeCount(f, first.sessionId)).toBe(before)
  expect(f.ctx.securitySupplyChain.list({ workspaceId: f.workspaceId }).runs.map(run => run.runId)).toEqual([first.runId])
  await f.ctx.securitySupplyChain.deleteRun({ workspaceId: f.workspaceId, runId: first.runId })
  expect(f.ctx.securitySupplyChain.list({ workspaceId: f.workspaceId }).runs).toEqual([])
})
it('acknowledges a repeated deletion only after the flush is confirmed again', async () => {
  const f = await setup(); const run = await f.terminal(await f.start()); const before = f.flush.mock.calls.length
  f.flush.mockRejectedValueOnce(new Error('disk full')).mockRejectedValueOnce(new Error('disk still full'))
  const request = { workspaceId: f.workspaceId, runId: run.runId }
  await expect(f.ctx.securitySupplyChain.deleteRun(request)).rejects.toThrow('disk full')
  await expect(f.ctx.securitySupplyChain.deleteRun(request)).rejects.toThrow('disk still full')
  const removed = await f.ctx.securitySupplyChain.deleteRun(request)
  expect(removed.runId).toBe(run.runId); expect(f.flush.mock.calls.length - before).toBe(3)
})
it('rejects a start retry that reuses a deleted request without a new run or advisory lookup', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response('{}')); const f = await setup(fetcher); const first = await f.terminal(await f.start('click'))
  await f.ctx.securitySupplyChain.deleteRun({ workspaceId: f.workspaceId, runId: first.runId })
  const reject = async () => { await expect(f.start('click')).rejects.toThrow('already deleted') }
  await reject(); expect(f.sessions.size).toBe(1); expect(fetcher).toHaveBeenCalledTimes(1)
  await f.fiber.dispose(); f.resident.clear(); await f.ctx.plugin(SecuritySupplyChainService)
  await reject(); expect(f.sessions.size).toBe(1); expect(fetcher).toHaveBeenCalledTimes(1)
  expect((await f.start('new-click')).runId).not.toBe(first.runId)
})
it('collects a repair job without waking the model and persists its linked recheck', async () => {
  const { readFile } = await import('node:fs/promises')
  const fetcher: typeof fetch = async (url, init) => {
    if (typeof url === 'string' && url.includes('registry.npmjs.org')) {
      const body: unknown = JSON.parse(typeof init?.body === 'string' ? init.body : '')
      return new Response(JSON.stringify(JSON.stringify(body).includes('6.0.0') ? { 'is-number': [{ title: 'Controlled advisory', url: 'https://github.com/advisories/GHSA-35jh-r3h4-6jhm', severity: 'high', vulnerable_versions: '<7.0.0' }] } : {}))
    }
    return new Response(JSON.stringify({ ghsa_id: 'GHSA-35jh-r3h4-6jhm', cve_id: null, description: 'Controlled metadata', published_at: null, updated_at: null, vulnerabilities: [{ package: { ecosystem: 'npm', name: 'is-number' }, vulnerable_version_range: '<7.0.0', first_patched_version: '7.0.0' }] }))
  }
  const f = await setup(fetcher)
  const lock = (version: string) => JSON.stringify({ lockfileVersion: 3, packages: { '': { dependencies: { 'is-number': version } }, 'node_modules/is-number': { version } } })
  await writeFile(join(f.root, 'package.json'), JSON.stringify({ dependencies: { 'is-number': '6.0.0' } }))
  await writeFile(join(f.root, 'package-lock.json'), lock('6.0.0'))
  f.ctx.provide('subprocess', { resolveExecutable: async () => '/trusted/npm', spawn: (spec: { cwd: string }) => ({ done: writeFile(join(spec.cwd, 'package-lock.json'), lock('7.0.0')).then(() => ({ exitCode: 0, signal: null })), waitForExit: async () => true }) } as never)
  const run = await f.terminal(await f.start())
  const request = { workspaceId: f.workspaceId, runId: run.runId, requestId: 'repair-click' }
  await f.ctx.securitySupplyChain.repair(request)
  let repaired = f.ctx.securitySupplyChain.read({ workspaceId: f.workspaceId, runId: run.runId }).run!
  for (let index = 0; index < 100 && repaired.repair?.status === 'running'; index++) {
    await new Promise(resolve => setTimeout(resolve, 5))
    repaired = f.ctx.securitySupplyChain.read({ workspaceId: f.workspaceId, runId: run.runId }).run!
  }
  if (repaired.repair?.recoveryPath) cleanup.push(() => rm(repaired.repair!.recoveryPath!, { recursive: true, force: true }))
  expect(repaired.repair?.status).toBe('completed'); expect(repaired.repair?.applied).toBe(true)
  expect(f.ctx.securitySupplyChain.list({ workspaceId: f.workspaceId }).runs).toHaveLength(2)
  expect(f.ctx.securitySupplyChain.read({ workspaceId: f.workspaceId, runId: repaired.repair?.resultRunId }).run?.findings).toEqual([])
  expect(await readFile(join(f.root, 'package.json'), 'utf8')).toContain('7.0.0')
  expect(f.followup).not.toHaveBeenCalled(); expect(f.inject).not.toHaveBeenCalled()
  expect((await f.ctx.securitySupplyChain.repair(request)).repair?.status).toBe('completed')
})
