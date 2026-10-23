import { Context } from '@deepseek-ai/cordis'
import type { Agent, EngineRunRequest } from '@deepseek-ai/dsh-agent'
import { createUserMessage, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { describe, expect, it, vi } from 'vitest'
import { deepSeekConversationEngine } from '../src/security-deepseek.ts'
import { taskSchema } from '../src/security-records.ts'
import { SecurityConversationsService, resolveTaskModelDecision, securityConversationProvider } from '../src/security-conversations.ts'

const message = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Discuss this task' }] })
function agentFor(ctx: Context, session: Session): Agent {
  const unsupported = (): never => { throw new Error('Unused test Agent operation') }
  return { id: session.id, session, ctx, options: {}, status: 'idle',
    inbox: { nextTurn: [], nextStep: [], clear: unsupported, append: unsupported, prepend: unsupported,
      replace: unsupported, remove: unsupported, splice: unsupported },
    send: unsupported, followup: unsupported, steer: unsupported, inject: unsupported, cancel: unsupported,
    whenIdle: async () => {}, runMaintenance: task => task(new AbortController().signal),
  }
}
function fixture() {
  const ctx = new Context()
  const requests: GenerateOptions[] = []
  const lifetime = new AbortController()
  let chunks: StreamChunk[] = [{ type: 'text-delta', index: 0, text: 'Answer' }]
  const llm = { listProviders: () => [{ id: 'deepseek-account', name: 'Account' }, { id: 'deepseek-official', name: 'API' }],
    listModels: vi.fn(async (provider: string) => [{ id: `${provider}-model`, name: 'Actual catalog model' }]),
    async *stream(options: GenerateOptions) { requests.push(options); yield* chunks },
  }
  ctx.provide('llm', llm as never)
  const history = vi.fn(async () => [message])
  const engine = deepSeekConversationEngine(ctx, 'deepseek-account', history, lifetime.signal)
  const request: EngineRunRequest = { agent: agentFor(ctx, Session.create(SessionId('task-session'))), model: 'deepseek-account-model', turn: 1, step: 1, messages: [message], signal: new AbortController().signal }
  return { ctx, llm, requests, lifetime, history, engine, request, setChunks(value: StreamChunk[]) { chunks = value } }
}
async function drain(stream: AsyncIterable<StreamChunk>) {
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

describe('Conversation-only DeepSeek adapters', () => {
  it('discovers the exact provider catalog and sends the selected model without tools', async () => {
    const f = fixture()
    expect(await f.engine.listModels()).toEqual([{ id: 'deepseek-account-model', name: 'Actual catalog model' }])
    expect(await drain(f.engine.run(f.request))).toEqual([{ type: 'text-delta', index: 0, text: 'Answer' }])
    expect(f.requests[0]).toMatchObject({ provider: 'deepseek-account', model: 'deepseek-account-model', tools: [], messages: [message] })
    expect(f.requests[0]?.system).toBeUndefined()
    expect(f.history).toHaveBeenCalledWith(expect.objectContaining({ model: 'deepseek-account-model' }), 'deepseek-account')
    await f.ctx.fiber.dispose()
  })
  it('never falls back to another provider for an unavailable model', async () => {
    const f = fixture()
    await expect(drain(f.engine.run({ ...f.request, model: 'deepseek-official-model' }))).rejects.toThrow('unavailable')
    expect(f.requests).toHaveLength(0)
    await f.ctx.fiber.dispose()
  })
  it('fails before sending after cancellation or unload and rejects returned tool activity', async () => {
    const f = fixture()
    f.lifetime.abort(new Error('unloaded'))
    await expect(drain(f.engine.run(f.request))).rejects.toThrow('unloaded')
    expect(f.requests).toHaveLength(0)
    await f.ctx.fiber.dispose()
  })
  it('stops rather than exposing a provider tool call to the agent loop', async () => {
    const f = fixture()
    f.setChunks([{ type: 'tool-call-delta', index: 0, id: 'call' as never, name: 'shell', argumentsDelta: '{}' }])
    await expect(drain(f.engine.run(f.request))).rejects.toThrow('attempted a tool call')
    await f.ctx.fiber.dispose()
  })
  it('preserves both DeepSeek destinations in durable task role selections', () => {
    const task = taskSchema.parse({ id: 'task', name: 'Task', description: '', objective: '', status: 'draft', assetIds: [], archived: false, pinned: false, createdAt: 1, updatedAt: 1,
      agentModels: { main: { engine: 'deepseek-account', model: 'account-model' }, planner: { engine: 'deepseek-official', model: 'api-model' } } })
    expect(task.agentModels?.main?.engine).toBe('deepseek-account')
    expect(securityConversationProvider('deepseek-account')).toBe('security-deepseek-account')
    const selection = { engine: 'deepseek-official' as const, model: 'api-model' }
    expect(resolveTaskModelDecision(task, 'planner', { selection, engines: [{ id: 'deepseek-official', name: 'API', models: [{ id: 'api-model', name: 'API model' }] }] }).engine).toBe('deepseek-official')
  })
})

async function consentFixture(choice: string, saved?: Map<string, object>) {
  const ctx = new Context()
  const id = SessionId('persisted-task-session')
  const workspaceId = 'workspace' as import('@deepseek-ai/dsh-workspace/types').WorkspaceId
  const task = taskSchema.parse({ id: 'task', name: 'Task', description: '', objective: '', status: 'draft', assetIds: [], archived: false, pinned: false, createdAt: 1, updatedAt: 1 })
  const rows = saved ?? new Map<string, object>([[JSON.stringify([workspaceId, task.id]), { workspaceId, taskId: task.id, sessionId: id }]])
  const engines = new Map<string, import('@deepseek-ai/dsh-agent').AgentExecutionEngine>()
  const seen: GenerateOptions[] = []
  const oldUser = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'Prior owner text' }] })
  const oldNotice = createUserMessage({ source: { kind: 'security-task-context', form: 'notice', summary: 'Old task' }, content: [{ type: 'text', text: 'Old task configuration must not leak' }] })
  const ask = vi.fn(async () => ({ answers: [{ id: 'native-history-sharing', selected: [choice] }] }))
  ctx.provide('storageDomain', { open: async () => ({ table: () => ({ entries: () => rows.entries(), get: (key: string) => rows.get(key), put: async (key: string, value: object) => { rows.set(key, value) } }), close: async () => {} }) } as never)
  ctx.provide('securityRecords', { read: () => ({ tasks: [task], assets: [] }) } as never)
  ctx.provide('workspaceRegistry', {} as never)
  ctx.provide('agents', {} as never)
  ctx.provide('sessions', {} as never)
  ctx.provide('sessionPersistence', {} as never)
  ctx.provide('userQuestions', { ask } as never)
  ctx.provide('agentEngines', { get: (id: string) => engines.get(id), register: (engine: import('@deepseek-ai/dsh-agent').AgentExecutionEngine) => { engines.set(engine.id, engine); return () => engines.delete(engine.id) } } as never)
  ctx.provide('llm', { listProviders: () => [{ id: 'deepseek-account' }, { id: 'deepseek-official' }], listModels: async () => [{ id: 'model', name: 'Model' }], async *stream(options: GenerateOptions) { seen.push(options); yield { type: 'text-delta', index: 0, text: 'Answer' } } } as never)
  await ctx.plugin(SecurityConversationsService)
  await vi.waitFor(() => { expect(engines.has('security-deepseek-account')).toBe(true) })
  const session = Session.create(id)
  for (const entry of [oldUser, oldNotice, message]) session.append('user/message', entry, { surfaceOp: 'append' })
  const request: EngineRunRequest = { agent: agentFor(ctx, session), model: 'model', turn: 1, step: 1, messages: [message], signal: new AbortController().signal }
  return { ctx, engines, request, ask, seen, rows }
}
it('requires destination-specific consent, persists always, and strips old task notices', async () => {
  const f = await consentFixture('この会話では常に許可する')
  try {
    const account = f.engines.get('security-deepseek-account')!
    await drain(account.run(f.request))
    await drain(account.run(f.request))
    expect(f.ask).toHaveBeenCalledOnce()
    expect(f.seen[0]?.messages.map(item => item.content)).toEqual([
      [{ type: 'text', text: 'Prior owner text' }], message.content,
    ])
    await drain(f.engines.get('security-deepseek-official')!.run(f.request))
    expect(f.ask).toHaveBeenCalledTimes(2)
    expect([...f.rows.values()][0]).toMatchObject({ historySharing: { 'deepseek-account': true, 'deepseek-official': true } })
  } finally { await f.ctx.fiber.dispose() }
})
it('does not send history when the owner refuses sharing', async () => {
  const f = await consentFixture('拒否する')
  try {
    await expect(drain(f.engines.get('security-deepseek-account')!.run(f.request))).rejects.toThrow('not approved')
    expect(f.seen).toHaveLength(0)
  } finally { await f.ctx.fiber.dispose() }
})

it('restores destination consent from the durable task mapping after restart', async () => {
  const first = await consentFixture('この会話では常に許可する')
  await drain(first.engines.get('security-deepseek-account')!.run(first.request))
  await first.ctx.fiber.dispose()
  const restored = await consentFixture('拒否する', first.rows)
  try {
    await drain(restored.engines.get('security-deepseek-account')!.run(restored.request))
    expect(restored.ask).not.toHaveBeenCalled()
    expect(restored.seen).toHaveLength(1)
  } finally { await restored.ctx.fiber.dispose() }
})
