import { Context, Service } from '@deepseek-ai/cordis'
import type { EngineRunRequest } from '@deepseek-ai/dsh-agent'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { runClaude } from '../src/claude.ts'
import SubscriptionEngines from '../src/index.ts'
import { nativeExecutionProjection } from '@deepseek-ai/dsh-agent/src/native-execution.ts'
import type { query } from '@anthropic-ai/claude-agent-sdk'

const mocks = vi.hoisted(() => ({ query: vi.fn(), capture: vi.fn() }))
vi.mock('@anthropic-ai/claude-agent-sdk', async original => ({
  ...await original<typeof import('@anthropic-ai/claude-agent-sdk')>(), query: mocks.query,
}))
vi.mock('../src/shared.ts', async original => ({
  ...await original<typeof import('../src/shared.ts')>(), capture: mocks.capture,
  nativeSession: () => undefined, nativePrompt: async () => 'Investigate the local application',
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.capture.mockResolvedValue(JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty' }))
})

function request(hostTools?: EngineRunRequest['hostTools']): EngineRunRequest {
  return { agent: { session: { header: { cwd: '/tmp' } } }, model: 'default', turn: 1, step: 1, messages: [], hostTools, signal: new AbortController().signal } as unknown as EngineRunRequest
}

async function drain(input: EngineRunRequest, mode: boolean | 'host-tools'): Promise<void> {
  for await (const _chunk of runClaude(new Context(), 'unused', 1000, input, mode)) { /* consume admission */ }
}

describe('Claude isolated host tool admission', () => {
  it.each([true, false, 'host-tools'] as const)('keeps native input open for context accounting on the %s route', async (mode) => {
    const ctx = new Context()
    onTestFinished(() => ctx.fiber.dispose())
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    ctx.sessionProjections.register(nativeExecutionProjection)
    const session = ctx.sessions.create(SessionId(`context-accounting-${String(mode)}`), { meta: { cwd: '/tmp' } })
    const tools = mode === 'host-tools'
      ? [{ name: 'http_request', description: 'Read scope', inputSchema: { type: 'object' }, execute: async () => 'HTTP 200' }]
      : undefined
    let inputEnded = false
    const getContextUsage = vi.fn(async () => {
      await Promise.resolve()
      expect(inputEnded).toBe(false)
      return { model: 'sonnet', totalTokens: 120, rawMaxTokens: 200000, categories: [
        { name: 'Messages', tokens: 120 }, { name: 'Available capacity', tokens: 199850 },
        { name: 'Compaction allowance', tokens: 30 }, { name: 'Deferred tools', tokens: 12, isDeferred: true },
      ] }
    })
    mocks.query.mockImplementation(({ prompt }: Parameters<typeof query>[0]) => {
      if (typeof prompt === 'string') throw new Error('Native input must stay open for the control request')
      const input = prompt[Symbol.asyncIterator]()
      return {
        async *[Symbol.asyncIterator]() {
          expect((await input.next()).done).toBe(false)
          const completion = input.next().then(() => { inputEnded = true })
          yield {
            type: 'assistant', message: { content: [{ type: 'text', text: 'OK' }] },
            context_usage: { model: 'sonnet', total_tokens: 200, raw_max_tokens: 200000, categories: [
              { name: 'Messages', tokens: 200, kind: 'used' }, { name: 'Available capacity', tokens: 199770, kind: 'free' },
              { name: 'Compaction allowance', tokens: 30, kind: 'buffer' },
            ] },
          }
          yield {
            type: 'result', subtype: 'success', is_error: false, result: 'OK', modelUsage: {},
            usage: { input_tokens: 10, output_tokens: 2, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          }
          await completion
        },
        getContextUsage, close: vi.fn(),
      }
    })
    const base = request(tools)
    const input: EngineRunRequest = { ...base, agent: { ...base.agent, session } }
    for await (const _chunk of runClaude(ctx, 'unused', 1000, input, mode)) { /* consume the completed turn */ }
    expect(getContextUsage).toHaveBeenCalledOnce()
    expect(inputEnded).toBe(true)
    expect(session.snapshotEvents().filter(event => event.type === 'engine/usage').at(-1)?.data).toMatchObject({
      engine: 'claude', context: { usedTokens: 120, maxTokens: 200000, categories: [
        { name: 'Messages', tokens: 120, kind: 'used' }, { name: 'Available capacity', tokens: 199850, kind: 'free' },
        { name: 'Compaction allowance', tokens: 30, kind: 'buffer' }, { name: 'Deferred tools', tokens: 12, kind: 'deferred' },
      ] }, tokens: { inputTokens: 10, outputTokens: 2 },
    })
  })

  it('rejects absent capabilities before authentication or CLI startup', async () => {
    await expect(drain(request(), 'host-tools')).rejects.toThrow('requires explicit tools')
    await expect(drain(request([]), 'host-tools')).rejects.toThrow('requires explicit tools')
  })

  it('cannot enable host capabilities on native or conversation-only routes', async () => {
    await expect(drain(request([]), true)).rejects.toThrow('dedicated execution route')
    await expect(drain(request([]), false)).rejects.toThrow('dedicated execution route')
  })

  it('rejects names that can escape the MCP namespace', async () => {
    await expect(drain(request([{ name: 'mcp__other__tool!', description: 'Invalid', inputSchema: { type: 'object' }, execute: vi.fn() }]), 'host-tools')).rejects.toThrow('Invalid or duplicate')
  })

  it('requires typed object arguments', async () => {
    await expect(drain(request([{ name: 'fetch', description: 'Fetch', inputSchema: { type: 'string' }, execute: vi.fn() }]), 'host-tools')).rejects.toThrow('must be an object')
  })

  it('rejects main-chat capabilities on both isolated routes', async () => {
    const tools = [{ name: 'security_tasks', description: 'List tasks', inputSchema: { type: 'object' }, execute: async () => '[]' }]
    for (const mode of [true, 'host-tools'] as const) {
      const collect = async (): Promise<void> => { for await (const _chunk of runClaude(new Context(), 'unused', 1000, request(), mode, tools)) { /* admission */ } }
      await expect(collect()).rejects.toThrow('cannot be added to isolated')
    }
  })

  it('preserves native tools while logging added main-chat capabilities and removes disposed providers', async () => {
    const ctx = new Context()
    onTestFinished(() => ctx.fiber.dispose())
    class FixtureSubprocess extends Service { constructor(context: Context) { super(context, 'subprocess') } }
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    ctx.sessionProjections.register(nativeExecutionProjection)
    await ctx.plugin(FixtureSubprocess)
    await ctx.plugin(SubscriptionEngines, { codexCommand: 'unused', claudeCommand: 'unused', statusTimeoutMs: 1000, loginTimeoutMs: 1000, modelListTimeoutMs: 1000 })
    const session = ctx.sessions.create(SessionId('main-host-tools'), { meta: { cwd: '/tmp' } })
    const provider = ctx.plugin((scope: Context) => {
      scope.on('subscription-engines/host-tools', async (_input, next) => [...await next(), {
        name: 'security_tasks', description: 'List workspace tasks', inputSchema: { type: 'object' }, execute: async () => '[]',
      }])
    })
    await provider
    mocks.query.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield { type: 'system', subtype: 'init', apiKeySource: 'oauth', model: 'sonnet', tools: ['Read', 'Bash', 'mcp__host__security_tasks'] }
        yield { type: 'result', subtype: 'success', is_error: false, result: 'Tasks listed', modelUsage: {}, usage: {} }
      },
      getContextUsage: async () => { throw new Error('Unavailable') }, close: vi.fn(),
    })
    const base = request()
    const input: EngineRunRequest = { ...base, agent: { ...base.agent, session } }
    const engine = ctx.agentEngines.get('claude-subscription')!
    for await (const _chunk of engine.run(input)) { /* consume */ }
    const sdkCall = mocks.query.mock.calls.at(-1)![0] as Parameters<typeof query>[0]
    const options = sdkCall.options!
    expect(options.tools).toBeUndefined()
    expect(options.agents).toBeUndefined()
    expect(options.mcpServers?.host).toBeDefined()
    expect(options.canUseTool).toBeTypeOf('function')
    expect(session.snapshotEvents().some(event => event.type === 'engine/activity' && event.data.kind === 'host-tool-catalog')).toBe(true)
    await provider.dispose()
    for await (const _chunk of engine.run(input)) { /* consume */ }
    const afterDisposal = mocks.query.mock.calls.at(-1)![0] as Parameters<typeof query>[0]
    expect(afterDisposal.options?.mcpServers).toBeUndefined()
  })

  it('publishes only completed conversation output after a restarted partial stream', async () => {
    const final = '{"items":[{"title":"Inspect the storefront"}]}'
    const input = request()
    input.agent.session.append = vi.fn()
    mocks.query.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield { type: 'system', subtype: 'init', apiKeySource: 'oauth', model: 'sonnet', tools: [] }
        for (const text of ['{"items":[{"title":"Interrupted', final]) {
          yield { type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } }
        }
        yield { type: 'result', subtype: 'success', is_error: false, result: final, modelUsage: {}, usage: {} }
      },
      getContextUsage: async () => { throw new Error('Not available in fixture') }, close: vi.fn(),
    })
    const output = []
    for await (const chunk of runClaude(new Context(), 'unused', 1000, input, true)) output.push(chunk)
    expect(output.filter(chunk => chunk.type === 'text-delta')).toEqual([{ type: 'text-delta', index: 0, text: final }])
    expect(output.find(chunk => chunk.type === 'block-end')).toEqual({ type: 'block-end', index: 0, block: { type: 'text', text: final } })
  })

  it('publishes only the SDK final report after intermediate tool-loop narration', async () => {
    const final = '{"summary":"Confirmed response exposure","findings":[]}'
    const append = vi.fn()
    const flush = vi.fn(async () => true)
    const ctx = new Context()
    Object.defineProperty(ctx, 'sessions', { value: { flush } })
    const input = request([{ name: 'http_request', description: 'Read scope', inputSchema: { type: 'object' }, execute: async () => 'HTTP 200' }])
    input.agent.session.append = append
    const sdkMessages = [
      { type: 'system', subtype: 'init', apiKeySource: 'oauth', model: 'sonnet', tools: ['mcp__host__http_request'] },
      { type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'First I will investigate. ' } } },
      { type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'Private chain must stay private' }, { type: 'text', text: 'First I will investigate.' }, { type: 'tool_use', id: 'call-1', name: 'mcp__host__http_request', input: {} }] } },
      { type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', delta: { type: 'text_delta', text: final } } },
      { type: 'assistant', message: { content: [{ type: 'text', text: final }] } },
      { type: 'result', subtype: 'success', is_error: false, result: final, modelUsage: {}, usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
    ]
    mocks.query.mockReturnValue({
      async *[Symbol.asyncIterator]() { yield* sdkMessages },
      getContextUsage: async () => { throw new Error('Not available in fixture') }, close: vi.fn(),
    })
    const output = []
    for await (const chunk of runClaude(ctx, 'unused', 1000, input, 'host-tools')) output.push(chunk)
    expect(output.filter(chunk => chunk.type === 'text-delta')).toEqual([{ type: 'text-delta', index: 0, text: final }])
    expect(JSON.stringify(append.mock.calls)).toContain('First I will investigate.')
    expect(JSON.stringify(append.mock.calls)).not.toContain('Private chain must stay private')
    expect(append).toHaveBeenCalledWith('engine/activity', expect.objectContaining({ kind: 'host-assistant' }))
    expect(append).toHaveBeenCalledWith('engine/activity', expect.objectContaining({ kind: 'host-tool-catalog' }))
    expect(JSON.stringify(append.mock.calls)).toContain('Read scope')
    expect(JSON.stringify(append.mock.calls)).toContain('inputSchema')
    expect(flush).toHaveBeenCalledTimes(3)
  })

  it('flushes tool activity through the real Cordis plugin injection scope', async () => {
    const ctx = new Context()
    onTestFinished(() => ctx.fiber.dispose())
    class FixtureSubprocess extends Service {
      constructor(inner: Context) { super(inner, 'subprocess') }
      spawn(): never { throw new Error('This fixture must not spawn a process') }
    }
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(FixtureSubprocess)
    await ctx.plugin(SubscriptionEngines, {
      codexCommand: 'unused-codex', claudeCommand: 'unused-claude',
      statusTimeoutMs: 1000, loginTimeoutMs: 1000, modelListTimeoutMs: 1000,
    })
    const session = ctx.sessions.create(SessionId('host-tools-injected'), { meta: { cwd: '/tmp' } })
    const flush = vi.spyOn(ctx.sessions, 'flush')
    const final = '{"summary":"Fixture completed","findings":[]}'
    mocks.query.mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield { type: 'assistant', message: { content: [{ type: 'text', text: final }] } }
        yield { type: 'result', subtype: 'success', is_error: false, result: final, modelUsage: {}, usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }
      },
      getContextUsage: async () => { throw new Error('Not available in fixture') }, close: vi.fn(),
    })
    const base = request([{ name: 'http_request', description: 'Read scope', inputSchema: { type: 'object' }, execute: async () => 'HTTP 200' }])
    const input: EngineRunRequest = { ...base, agent: { ...base.agent, session } }
    const engine = ctx.agentEngines.get('claude-host-tools')!
    const output = []
    for await (const chunk of engine.run(input)) output.push(chunk)
    expect(output.at(-1)).toEqual({ type: 'finish', reason: { kind: 'stop' } })
    expect(flush).toHaveBeenCalledWith(session)
    expect(session.snapshotEvents().some(event => event.type === 'engine/activity' && event.data.kind === 'host-tool-catalog')).toBe(true)
    expect(session.snapshotEvents().some(event => event.type === 'engine/activity' && event.data.kind === 'host-assistant')).toBe(true)
  })
})

const responseSchema = { type: 'object', properties: { reply: { type: 'string' }, proposal: { type: 'null' } }, required: ['reply', 'proposal'], additionalProperties: false }
async function structuredFixture(messages: Record<string, unknown>[], schema: EngineRunRequest['responseSchema'] = responseSchema) {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  ctx.sessionProjections.register(nativeExecutionProjection)
  const session = ctx.sessions.create(SessionId('structured-conversation'), { meta: { cwd: '/tmp' } })
  mocks.query.mockReturnValue({
    async *[Symbol.asyncIterator]() { yield* messages },
    getContextUsage: async () => { throw new Error('Unavailable') }, close: vi.fn(),
  })
  const base = request()
  const input: EngineRunRequest = {
    ...base, agent: { ...base.agent, session }, ...(schema === undefined ? {} : { responseSchema: schema }),
  }
  const output: StreamChunk[] = []
  const run = async (): Promise<void> => { for await (const chunk of runClaude(ctx, 'unused', 1000, input, true)) output.push(chunk) }
  return { run, input, output }
}
function structuredResult(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return { type: 'result', subtype: 'success', is_error: false, result: 'Unstructured prose must not be used', structured_output: { reply: 'Ready', proposal: null }, modelUsage: {}, usage: {}, ...patch }
}

it('requests native JSON Schema and publishes only validated structured output with isolated tools', async () => {
  const f = await structuredFixture([
    { type: 'system', subtype: 'init', apiKeySource: 'oauth', model: 'sonnet', tools: ['StructuredOutput'] },
    { type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Partial prose' } } },
    structuredResult(),
  ])
  await f.run()
  expect(f.output.filter(chunk => chunk.type === 'text-delta')).toEqual([{ type: 'text-delta', index: 0, text: '{"reply":"Ready","proposal":null}' }])
  const call = mocks.query.mock.calls.at(-1)![0] as Parameters<typeof query>[0]
  expect(call.options).toMatchObject({ outputFormat: { type: 'json_schema', schema: responseSchema }, tools: [], agents: {}, skills: [], plugins: [], mcpServers: {}, strictMcpConfig: true, permissionMode: 'default' })
  const hook = call.options?.hooks?.PreToolUse?.[0]?.hooks[0]
  if (!hook || !call.options?.canUseTool) throw new Error('Expected isolated permission controls')
  const invokeHook = (tool_name: string, tool_input: unknown) => hook({ hook_event_name: 'PreToolUse', session_id: 'test', transcript_path: '', cwd: '/tmp', tool_name, tool_input, tool_use_id: 'call' }, 'call', { signal: f.input.signal })
  expect(await invokeHook('StructuredOutput', { reply: 'Ready', proposal: null })).toMatchObject({ hookSpecificOutput: { permissionDecision: 'allow' } })
  expect(await invokeHook('StructuredOutput', { command: 'read a file' })).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny' } })
  for (const name of ['Bash', 'Read', 'mcp__host__StructuredOutput', 'StructuredOutputOther']) {
    expect(await invokeHook(name, { reply: 'Ready', proposal: null })).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny' } })
    expect(await call.options.canUseTool(name, {}, { signal: f.input.signal, toolUseID: 'call', requestId: 'structured-permission' })).toMatchObject({ behavior: 'deny' })
  }
  expect(await call.options.canUseTool('StructuredOutput', { reply: 'Ready', proposal: null }, { signal: f.input.signal, toolUseID: 'call', requestId: 'structured-permission' })).toMatchObject({ behavior: 'allow', updatedInput: { reply: 'Ready', proposal: null } })
  expect(await call.options.canUseTool('StructuredOutput', { command: 'read a file' }, { signal: f.input.signal, toolUseID: 'call', requestId: 'structured-permission' })).toMatchObject({ behavior: 'deny' })
})
it.each([undefined, null, { reply: 'Missing proposal' }, { reply: 'Ready', proposal: null, extra: true }])('refuses missing or invalid native structured output without prose fallback: %j', async (structured_output) => {
  const f = await structuredFixture([structuredResult({ structured_output })])
  await expect(f.run()).rejects.toThrow()
  expect(f.output.filter(chunk => chunk.type === 'text-delta')).toEqual([])
})
it('propagates native structured output retry exhaustion without publishing a response', async () => {
  const f = await structuredFixture([structuredResult({ subtype: 'error_max_structured_output_retries', is_error: true })])
  await expect(f.run()).rejects.toThrow('error_max_structured_output_retries')
  expect(f.output.filter(chunk => chunk.type === 'text-delta')).toEqual([])
})
it('refuses any advertised real tool even when structured output was requested', async () => {
  const f = await structuredFixture([{ type: 'system', subtype: 'init', apiKeySource: 'oauth', model: 'sonnet', tools: ['StructuredOutput', 'Read'] }, structuredResult()])
  await expect(f.run()).rejects.toThrow('unexpected tools')
})
it('never exposes StructuredOutput without an explicit schema', async () => {
  const f = await structuredFixture([{ type: 'system', subtype: 'init', apiKeySource: 'oauth', model: 'sonnet', tools: ['StructuredOutput'] }])
  delete f.input.responseSchema
  await expect(f.run()).rejects.toThrow('unexpected tools')
})
it.each([false, 'host-tools'] as const)('refuses structured schema on the %s route before native execution', async (mode) => {
  const input = request(mode === 'host-tools' ? [{ name: 'read', description: 'Read', inputSchema: { type: 'object' }, execute: vi.fn() }] : undefined)
  input.responseSchema = responseSchema
  await expect(drain(input, mode)).rejects.toThrow('conversation-only route')
  expect(mocks.query).not.toHaveBeenCalled()
})

it('keeps ordinary conversation final text unchanged without a response schema', async () => {
  const f = await structuredFixture([structuredResult({ result: 'Ordinary final answer' })])
  delete f.input.responseSchema
  await f.run()
  expect(f.output.filter(chunk => chunk.type === 'text-delta')).toEqual([{ type: 'text-delta', index: 0, text: 'Ordinary final answer' }])
  const call = mocks.query.mock.calls.at(-1)![0] as Parameters<typeof query>[0]
  expect(call.options?.outputFormat).toBeUndefined()
})
