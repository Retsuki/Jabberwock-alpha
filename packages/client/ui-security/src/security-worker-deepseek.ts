/** Bounded DeepSeek tool loop exposing only explicitly supplied investigation capabilities. */
import type { Context } from '@deepseek-ai/cordis'
import type { AgentExecutionEngine } from '@deepseek-ai/dsh-agent'
import { BlockAssembler, createToolResultMessage, type Message, type StreamChunk, type TokenUsage } from '@deepseek-ai/dsh-llm'
import { z } from 'zod'
import type { SecurityDeepSeekProvider } from './security-deepseek.ts'

/** Create an internal Worker engine without exposing ambient Harness tools.
 * @param ctx Host LLM and Session services.
 * @param provider Exact configured DeepSeek adapter.
 * @param maxSteps Maximum model requests, including the final report.
 * @returns Lookup-only bounded investigation engine.
 */
export function createSecurityDeepSeekWorkerEngine(
  ctx: Context, provider: SecurityDeepSeekProvider, maxSteps: number,
): AgentExecutionEngine {
  if (!Number.isSafeInteger(maxSteps) || maxSteps < 1) throw new Error('Worker requires a positive step budget')
  return {
    id: `security-worker-${provider}`, name: 'DeepSeek investigation Worker',
    async listModels() {
      const llm = ctx.get('llm')
      if (!llm || !llm.listProviders().some(candidate => candidate.id === provider)) return []
      return (await llm.listModels(provider)).map(({ id, name }) => ({ id, name }))
    },
    async *run(request): AsyncGenerator<StreamChunk> {
      const { signal, agent } = request
      const tools = request.hostTools
      if (!tools?.length) throw new Error('Worker requires explicit host tools')
      const capabilities = new Map(tools.map((tool) => {
        if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(tool.name)) throw new Error('Invalid Worker tool name')
        const schema = z.fromJSONSchema(tool.inputSchema)
        if (!(schema instanceof z.ZodObject)) throw new Error('Worker tool input schema must be an object')
        return [tool.name, { tool, schema }] as const
      }))
      if (capabilities.size !== tools.length) throw new Error('Duplicate Worker tool name')
      const schemas = tools.map(tool => ({ name: tool.name, description: tool.description, parameters: tool.inputSchema }))
      const llm = ctx.get('llm')
      if (!llm || !(await this.listModels()).some(model => model.id === request.model)) throw new Error('Selected DeepSeek Worker model is unavailable')
      const messages: Message[] = [...request.messages]
      let total: TokenUsage | undefined
      const log = async (kind: 'request' | 'response' | 'tool-call' | 'tool-result', step: number, value: unknown): Promise<void> => {
        agent.session.append('engine/activity', { engine: provider, turn: request.turn, step, kind: `worker-${kind}`, detail: JSON.stringify({ model: request.model, value }) })
        await ctx.sessions.flush(agent.session)
      }
      for (let step = 0; step < maxSteps; step++) {
        signal.throwIfAborted()
        await log('request', step, { messages, tools: schemas })
        const assembly = new BlockAssembler()
        let finished = false
        for await (const chunk of llm.stream({ provider, model: request.model, messages, tools: schemas, signal, sessionId: agent.id })) {
          signal.throwIfAborted()
          assembly.push(chunk)
          if (chunk.type === 'finish') finished = true
        }
        if (!finished) throw new Error('DeepSeek Worker model ended without a finish')
        const finish = assembly.finish
        if (finish.kind === 'error' || finish.kind === 'aborted') throw new Error(finish.failure.message)
        if (finish.kind === 'max-tokens') throw new Error('DeepSeek Worker model exhausted its output budget')
        const message = assembly.message({
          provider, model: request.model,
          ...assembly.replayState === undefined ? {} : { replayState: assembly.replayState },
        })
        await log('response', step, message)
        const usage = assembly.usage
        if (usage) {
          total = {
            inputTokens: (total?.inputTokens ?? 0) + usage.inputTokens,
            outputTokens: (total?.outputTokens ?? 0) + usage.outputTokens,
            cacheReadTokens: (total?.cacheReadTokens ?? 0) + (usage.cacheReadTokens ?? 0),
            cacheWriteTokens: (total?.cacheWriteTokens ?? 0) + (usage.cacheWriteTokens ?? 0),
          }
          agent.session.append('engine/usage', { engine: provider, model: request.model, updatedAt: Date.now(), tokens: total })
        }
        messages.push(message)
        const calls = message.content.filter(block => block.type === 'tool-call')
        if (calls.length === 0) {
          if (finish.kind === 'tool-calls') throw new Error('DeepSeek model did not supply usable tool calls')
          const text = message.content.filter(block => block.type === 'text').map(block => block.text).join('\n')
          if (!text.trim()) throw new Error('DeepSeek Worker model supplied no final report')
          yield { type: 'block-start', index: 0, blockType: 'text' }
          yield { type: 'text-delta', index: 0, text }
          yield { type: 'block-end', index: 0, block: { type: 'text', text } }
          if (total) yield { type: 'usage', usage: total }
          yield { type: 'finish', reason: { kind: 'stop' } }
          return
        }
        if (step + 1 >= maxSteps) throw new Error('DeepSeek Worker reached its model step budget before a final report')
        for (const call of calls) {
          signal.throwIfAborted()
          await log('tool-call', step, call)
          let text: string
          let isError = false
          try {
            const capability = capabilities.get(call.name)
            if (!capability) throw new Error(`Unavailable Worker tool: ${call.name}`)
            text = await capability.tool.execute(capability.schema.parse(JSON.parse(call.arguments)), signal)
          } catch (error: unknown) {
            signal.throwIfAborted()
            isError = true
            text = error instanceof Error ? error.message : String(error)
          }
          signal.throwIfAborted()
          const result = createToolResultMessage({ callId: call.id, content: [{ type: 'text', text }], isError })
          await log('tool-result', step, result)
          messages.push(result)
        }
      }
      throw new Error('DeepSeek Worker reached its model step budget')
    },
  }
}
