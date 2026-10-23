import { Context } from '@deepseek-ai/cordis'
import type { Agent, EngineHostTool, EngineRunRequest } from '@deepseek-ai/dsh-agent'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { nativeExecutionProjection, readNativeExecution } from '@deepseek-ai/dsh-agent/src/native-execution.ts'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { CodexHostTools } from '../src/codex-host-tools.ts'

async function setup() {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  ctx.sessionProjections.register(nativeExecutionProjection)
  const session = ctx.sessions.create(SessionId('codex-host-tools'))
  const unsupported = (): never => { throw new Error('unused Agent operation') }
  const agent: Agent = {
    id: session.id, session, ctx, options: {}, status: 'idle',
    inbox: {
      nextTurn: [], nextStep: [], clear: unsupported, append: unsupported, prepend: unsupported,
      replace: unsupported, remove: unsupported, splice: unsupported,
    },
    send: unsupported, followup: unsupported, steer: unsupported, inject: unsupported, cancel: unsupported,
    whenIdle: async () => {}, runMaintenance: task => task(new AbortController().signal),
  }
  const abort = new AbortController()
  const request: EngineRunRequest = { agent, model: 'default', turn: 1, step: 1, messages: [], signal: abort.signal }
  const execute = vi.fn(async () => 'host result')
  const definition: EngineHostTool = { name: 'host_action', description: 'Bound Host action', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false }, execute }
  return { ctx, session, abort, request, execute, definition }
}

const call = { threadId: 'thread', turnId: 'turn', callId: 'call', tool: 'host_action', arguments: { path: 'item' } }

describe('Codex live Host tool dispatch', () => {
  it('advertises the validated schema and logs inputs and results before returning native output', async () => {
    const { ctx, session, request, execute, definition } = await setup()
    const bridge = new CodexHostTools(ctx, request, [definition])
    expect(bridge.catalog).toMatchObject([{ type: 'function', name: 'host_action', inputSchema: { type: 'object' } }])
    const flush = vi.spyOn(ctx.sessions, 'flush')
    expect(await bridge.execute(call, 'thread', 'turn')).toEqual({ success: true, contentItems: [{ type: 'inputText', text: 'host result' }] })
    expect(execute).toHaveBeenCalledExactlyOnceWith({ path: 'item' }, request.signal)
    expect(flush).toHaveBeenCalledTimes(2)
    expect(session.snapshotEvents().filter(event => event.type === 'engine/activity').map(event => event.data.kind)).toEqual(['host-tool-call', 'host-tool-result'])
    await expect(bridge.execute(call, 'thread', 'turn')).rejects.toThrow('repeated')
    expect(execute).toHaveBeenCalledOnce()
  })

  it('denies unbound, namespaced, invalid-input and wrong-thread calls without invoking a capability', async () => {
    const { ctx, request, execute, definition } = await setup()
    const bridge = new CodexHostTools(ctx, request, [definition])
    await expect(bridge.execute(call, 'other', 'turn')).rejects.toThrow('another')
    await expect(bridge.execute(call, 'thread', 'other')).rejects.toThrow('another')
    await expect(bridge.execute(call, 'thread', undefined)).rejects.toThrow('another')
    for (const [index, override] of [{ tool: 'missing' }, { namespace: 'unbound' }, { arguments: { path: 3 } }].entries()) {
      expect((await bridge.execute({ ...call, ...override, callId: String(index) }, 'thread', 'turn')).success).toBe(false)
    }
    expect(execute).not.toHaveBeenCalled()
    expect((await new CodexHostTools(ctx, request, []).execute(call, 'thread', 'turn')).success).toBe(false)
  })

  it('returns an execution failure and stops aborted tool work', async () => {
    const { ctx, request, abort, execute, definition } = await setup()
    execute.mockRejectedValueOnce(new Error('Host denied operation'))
    const bridge = new CodexHostTools(ctx, request, [definition])
    expect(await bridge.execute(call, 'thread', 'turn')).toEqual({ success: false, contentItems: [{ type: 'inputText', text: 'Host denied operation' }] })
    abort.abort(new Error('cancelled'))
    await expect(bridge.execute({ ...call, callId: 'next' }, 'thread', 'turn')).rejects.toThrow('cancelled')
    expect(execute).toHaveBeenCalledOnce()
  })

  it('rejects malformed and duplicate declarations before native startup', async () => {
    const { ctx, request, definition } = await setup()
    expect(() => new CodexHostTools(ctx, request, [definition, definition])).toThrow('duplicate')
    expect(() => new CodexHostTools(ctx, request, [{ ...definition, name: 'bad/tool' }])).toThrow('Invalid')
    expect(() => new CodexHostTools(ctx, request, [{ ...definition, inputSchema: { type: 'string' } }])).toThrow('object')
  })

  it('resumes only an unchanged catalog bound to the same thread', async () => {
    const { ctx, request, definition } = await setup()
    const bridge = new CodexHostTools(ctx, request, [definition])
    const previous = { nativeId: 'thread', catalog: JSON.stringify(bridge.catalog) }
    expect(bridge.canResume('thread', previous)).toBe(true)
    expect(bridge.canResume('other', previous)).toBe(false)
    expect(bridge.canResume('thread', undefined)).toBe(false)
    expect(new CodexHostTools(ctx, request, [{ ...definition, description: 'changed' }]).canResume('thread', previous)).toBe(false)
    expect(new CodexHostTools(ctx, request, []).canResume('thread', previous)).toBe(false)
    expect(new CodexHostTools(ctx, request, []).canResume('legacy', undefined)).toBe(true)
  })

  it('projects exact-thread catalog facts and resets inherited catalog state', async () => {
    const { ctx, session } = await setup()
    const append = (detail: string) => session.append('engine/activity', { engine: 'codex', turn: 1, step: 1, kind: 'host-tool-catalog', detail })
    expect(readNativeExecution(ctx, session).codexToolCatalog).toBeUndefined()
    append(JSON.stringify({ nativeId: 'thread', catalog: '[]' }))
    expect(readNativeExecution(ctx, session).codexToolCatalog).toEqual({ nativeId: 'thread', catalog: '[]' })
    append('broken')
    expect(readNativeExecution(ctx, session).codexToolCatalog?.nativeId).toBe('thread')
    append(JSON.stringify({ nativeId: 3, catalog: '[]' }))
    expect(readNativeExecution(ctx, session).codexToolCatalog?.nativeId).toBe('thread')
    session.append('session/end-seed', { inherited: true })
    expect(readNativeExecution(ctx, session).codexToolCatalog).toBeUndefined()
  })
})
