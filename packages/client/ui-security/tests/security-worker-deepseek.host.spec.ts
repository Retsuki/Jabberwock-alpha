import type { Context } from '@deepseek-ai/cordis'
import type { EngineRunRequest } from '@deepseek-ai/dsh-agent'
import { createUserMessage, type StreamChunk } from '@deepseek-ai/dsh-llm'
import { describe, expect, it, vi } from 'vitest'
import { createSecurityDeepSeekWorkerEngine } from '../src/security-worker-deepseek.ts'

function setup(rounds: StreamChunk[][], maxSteps = 3) {
  const append = vi.fn()
  const execute = vi.fn(async () => 'HTTP 200: observed')
  const stream = vi.fn(async function* () { yield* rounds.shift() ?? [] })
  const llm = { listProviders: () => [{ id: 'deepseek-official' }], listModels: async () => [{ id: 'deepseek-chat', name: 'DeepSeek' }], stream }
  const ctx = { get: () => llm, sessions: { flush: vi.fn(async () => true) } } as unknown as Context
  const request = { agent: { id: 'worker', session: { append } }, model: 'deepseek-chat', turn: 1, step: 0,
    messages: [createUserMessage({ content: [{ type: 'text', text: 'Investigate the local app' }], source: { kind: 'user' } })],
    signal: new AbortController().signal,
    hostTools: [{ name: 'http_request', description: 'Read permitted target', inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'], additionalProperties: false }, execute }],
  } as unknown as EngineRunRequest
  return { engine: createSecurityDeepSeekWorkerEngine(ctx, 'deepseek-official', maxSteps), request, execute, stream, append }
}
const call = (name = 'http_request'): StreamChunk[] => [
  { type: 'tool-call-delta', index: 0, id: 'call-1' as never, name, argumentsDelta: '{"url":"http://127.0.0.1:43187/"}' },
  { type: 'finish', reason: { kind: 'tool-calls' } },
]
const answer: StreamChunk[] = [{ type: 'text-delta', index: 0, text: 'Observed HTTP 200.' }, { type: 'finish', reason: { kind: 'stop' } }]
async function drain(input: ReturnType<typeof setup>): Promise<StreamChunk[]> {
  const chunks = []
  for await (const chunk of input.engine.run(input.request)) chunks.push(chunk)
  return chunks
}
describe('DeepSeek investigation tool loop', () => {
  it('executes a typed tool then sends its exact result into the next model request', async () => {
    const input = setup([call(), answer])
    const chunks = await drain(input)
    expect(input.execute).toHaveBeenCalledWith({ url: 'http://127.0.0.1:43187/' }, input.request.signal)
    expect(input.stream).toHaveBeenCalledTimes(2)
    expect(input.append).toHaveBeenCalledWith('engine/activity', expect.objectContaining({ engine: 'deepseek-official', kind: 'worker-tool-result' }))
    expect(JSON.stringify(input.append.mock.calls)).toContain('HTTP 200: observed')
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'stop' } })
  })
  it('never executes a model-requested capability outside the explicit set', async () => {
    const input = setup([call('bash'), answer])
    await drain(input)
    expect(input.execute).not.toHaveBeenCalled()
    expect(input.append).toHaveBeenCalledWith('engine/activity', expect.objectContaining({ kind: 'worker-tool-result' }))
    expect(JSON.stringify(input.append.mock.calls)).toContain('Unavailable Worker tool')
  })
  it('stops at the model step budget without dispatching another operation', async () => {
    const input = setup([call()], 1)
    await expect(drain(input)).rejects.toThrow('step budget')
    expect(input.execute).not.toHaveBeenCalled()
  })
  it('rejects an unfinished model stream', async () => {
    await expect(drain(setup([[]]))).rejects.toThrow('without a finish')
  })
  it('validates arguments before executing the capability', async () => {
    const invalid = call()
    invalid[0] = { type: 'tool-call-delta', index: 0, id: 'invalid' as never, name: 'http_request', argumentsDelta: '{"url":42}' }
    const input = setup([invalid, answer])
    await drain(input)
    expect(input.execute).not.toHaveBeenCalled()
    expect(input.append).toHaveBeenCalledWith('engine/activity', expect.objectContaining({ kind: 'worker-tool-result' }))
    expect(JSON.stringify(input.append.mock.calls)).toContain('isError')
  })
  it('does not dispatch a model request after cancellation', async () => {
    const input = setup([call(), answer])
    const abort = new AbortController()
    abort.abort(new Error('cancelled'))
    await expect(drain({ ...input, request: { ...input.request, signal: abort.signal } })).rejects.toThrow('cancelled')
    expect(input.stream).not.toHaveBeenCalled()
    expect(input.execute).not.toHaveBeenCalled()
  })
})
