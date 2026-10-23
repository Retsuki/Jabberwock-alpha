import { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentExecutionEngine, EngineRunRequest } from '@deepseek-ai/dsh-agent'
import { createUserMessage, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { Session, SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { afterEach, expect, it, vi } from 'vitest'
import { SecuritySetupService } from '../src/security-setup.ts'
import type { SecurityTask } from '../src/security-records.ts'

const contexts: Context[] = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })
const valid = JSON.stringify({ reply: 'Ready', proposal: null })
async function fixture(answers: (string | Error | StreamChunk[])[], owner = 'Explain current task', failSave = false) {
  const ctx = new Context(); contexts.push(ctx)
  const session = Session.create(SessionId('setup-recovery'))
  const identity = { workspaceId: 'workspace' as WorkspaceId, taskId: 'task' }
  const task: SecurityTask = { id: 'task', name: 'Task', objective: 'Review', description: '', status: 'draft', assetIds: [], archived: false, pinned: false, createdAt: 0, updatedAt: 0 }
  const row = { ...identity, sessionId: session.id, beginId: 'begin', locale: 'en', outputs: [], confirmations: [] }
  const rows = new Map<string, object>([[JSON.stringify(['workspace', 'task']), row]])
  const put = vi.fn(async (key: string, value: object) => { if (failSave && calls.length) throw new Error('Storage failed'); rows.set(key, value) })
  const abort = new AbortController()
  const calls: EngineRunRequest[] = []
  const engines = new Map<string, AgentExecutionEngine>()
  const delegated = vi.fn(async () => ({}))
  const agent = { id: session.id, session, options: {}, status: 'idle', whenIdle: async () => {}, cancel: () => {}, followup: vi.fn() } as never as Agent
  const flush = vi.fn(async () => {})
  ctx.provide('storageDomain', { open: async () => ({ table: () => ({ entries: () => rows.entries(), get: (key: string) => rows.get(key), put }), close: async () => {} }) } as never)
  ctx.provide('securityRecords', { read: () => ({ ...identity, revision: 1, tasks: [task], assets: [] }), save: vi.fn() } as never)
  ctx.provide('securityConversations', { routeFor: () => ({ provider: 'stub', model: 'same-model' }), assertSelectionSettled: () => {}, catalog: async () => ({ engines: [], selection: { engine: 'claude', model: 'same-model' } }) } as never)
  ctx.provide('securityPlanning', { start: delegated } as never)
  ctx.provide('agents', { get: () => agent } as never)
  ctx.provide('sessions', {} as never)
  ctx.provide('sessionPersistence', { flush } as never)
  ctx.provide('agentEngines', { register: (engine: AgentExecutionEngine) => { engines.set(engine.id, engine); return () => engines.delete(engine.id) }, get: (id: string) => engines.get(id) } as never)
  engines.set('stub', { id: 'stub', name: 'Stub', listModels: async () => [], async *run(request) {
    calls.push(request)
    const answer = answers[calls.length - 1]
    if (answer instanceof Error) throw answer
    if (Array.isArray(answer)) { yield* answer; return }
    yield { type: 'text-delta', index: 0, text: answer ?? valid }
    yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  } })
  await ctx.plugin(SecuritySetupService)
  const message = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: owner }] })
  const decision = await ctx.waterfall('agent/pre-step', { agent, messages: [message], turn: 1, step: 1, signal: abort.signal }, () => Promise.resolve({ kind: 'enter' as const, messages: [message] }))
  if (decision.kind !== 'enter') throw new Error('Expected admitted setup')
  const request: EngineRunRequest = { agent, model: 'default', turn: 1, step: 1, messages: decision.messages, signal: abort.signal }
  const chunks: StreamChunk[] = []
  async function run() { const engine = engines.get('security-setup'); if (!engine) throw new Error('Missing setup engine'); for await (const chunk of engine.run(request)) chunks.push(chunk) }
  return { ctx, calls, session, chunks, run, flush, rows, put, delegated, abort }
}

it.each(['broken JSON', JSON.stringify({ reply: 'Missing proposal' })])('corrects only response format once: %s', async (invalid) => {
  const f = await fixture([invalid, valid]); await f.run()
  expect(f.calls.map(call => call.model)).toEqual(['same-model', 'same-model'])
  expect(f.calls[0]?.responseSchema).toBe(f.calls[1]?.responseSchema)
  expect(f.calls[0]?.responseSchema).toMatchObject({ type: 'object', required: ['reply', 'proposal'], additionalProperties: false })
  expect(f.calls[0]?.messages.flatMap(message => message.content).some(block => block.type === 'text' && block.text.includes(JSON.stringify(f.calls[0]?.responseSchema)))).toBe(true)
  expect(f.chunks.filter(chunk => chunk.type === 'usage')).toHaveLength(2)
  expect(f.chunks.filter(chunk => chunk.type === 'text-delta')).toEqual([{ type: 'text-delta', index: 0, text: 'Ready' }])
  expect(f.calls[1]?.messages.slice(0, -1)).toEqual(f.calls[0]?.messages)
  const correction = f.calls[1]?.messages.at(-1)
  expect(correction?.source).toMatchObject({ kind: 'security-task-context', summary: 'Security setup response format correction' })
  expect(f.session.snapshotEvents()).toContainEqual(expect.objectContaining({ type: 'user/message', data: correction }))
  expect(JSON.stringify(correction)).toContain('Correct only the response format')
  expect(f.delegated).not.toHaveBeenCalled()
})
it('stops after two malformed complete responses without saving a proposal', async () => {
  const f = await fixture(['invalid', 'also invalid'])
  await expect(f.run()).rejects.toThrow('invalid format')
  expect(f.calls).toHaveLength(2)
  expect(f.chunks.filter(chunk => chunk.type === 'usage')).toHaveLength(2)
  expect(JSON.stringify([...f.rows.values()])).not.toContain('"proposal":')
})
it.each([new Error('Provider refused'), new Error('Provider timeout')])('does not retry provider failure: %s', async (error) => {
  const f = await fixture([error, valid]); await expect(f.run()).rejects.toThrow(error.message); expect(f.calls).toHaveLength(1)
})
it('does not retry an incomplete response or storage failure', async () => {
  const incomplete = await fixture([[{ type: 'text-delta', index: 0, text: valid }, { type: 'finish', reason: { kind: 'max-tokens' } }], valid])
  await expect(incomplete.run()).rejects.toThrow('did not complete'); expect(incomplete.calls).toHaveLength(1)
  const storage = await fixture(['invalid', valid], undefined, true)
  await expect(storage.run()).rejects.toThrow('Storage failed'); expect(storage.calls).toHaveLength(1)
})
it('does not retry cancellation or a semantically invalid model patch', async () => {
  const cancelled = await fixture(['invalid', valid]); cancelled.abort.abort(new Error('Cancelled'))
  await expect(cancelled.run()).rejects.toThrow('Cancelled'); expect(cancelled.calls).toHaveLength(0)
  const patch = await fixture([JSON.stringify({ reply: 'Change model', proposal: { agentModels: { worker: { engine: 'claude', model: 'invented' } } } }), valid])
  await expect(patch.run()).rejects.toThrow(); expect(patch.calls).toHaveLength(1)
})
it('retains the original owner action when a corrected response proposes delegation', async () => {
  const f = await fixture(['invalid', JSON.stringify({ reply: 'Ready', proposal: null, action: { kind: 'start-planner' } })])
  await f.run()
  const row = [...f.rows.values()][0]
  expect(row).toMatchObject({ outputs: [{ ownerAction: undefined, action: { kind: 'start-planner' } }] })
  f.ctx.emit('session/event', { id: f.session.id } as never, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } } as SessionEvent)
  await vi.waitFor(async () => { expect((await f.ctx.securitySetup.read({ workspaceId: 'workspace' as WorkspaceId, taskId: 'task' })).plannerError).toBeDefined() })
  expect(f.delegated).not.toHaveBeenCalled()
})

it('delegates a corrected response once only for the original explicit owner request', async () => {
  const f = await fixture(['invalid', JSON.stringify({ reply: 'Planning', proposal: null, action: { kind: 'start-planner' } })], 'Create a plan only')
  await f.run()
  f.ctx.emit('session/event', { id: f.session.id } as never, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } } as SessionEvent)
  await vi.waitFor(() => { expect(f.delegated).toHaveBeenCalledOnce() })
  expect(f.calls).toHaveLength(2)
  expect(f.delegated).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'setup-planner:setup-recovery:1:1', expectedRevision: 1 }))
})
