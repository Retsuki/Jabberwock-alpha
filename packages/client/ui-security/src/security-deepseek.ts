/** Isolated text-only DeepSeek requests using the configured account or API adapter. */
import type { Context } from '@deepseek-ai/cordis'
import type { AgentExecutionEngine, EngineRunRequest } from '@deepseek-ai/dsh-agent'
import type { Message, StreamChunk } from '@deepseek-ai/dsh-llm'

/** Distinct provider identities preserve credential ownership. */
export type SecurityDeepSeekProvider = 'deepseek-account' | 'deepseek-official'
/** Create an internal engine with no Harness or native tool access.
 * @param ctx Host LLM service.
 * @param provider Exact configured adapter.
 * @param history Authorized discussion history reader.
 * @param lifetime Plugin lifetime.
 * @returns A lookup-only engine whose models come from the selected provider.
 */
export function deepSeekConversationEngine(
  ctx: Context, provider: SecurityDeepSeekProvider,
  history: (request: EngineRunRequest, provider: SecurityDeepSeekProvider) => Promise<Message[]>, lifetime: AbortSignal,
): AgentExecutionEngine {
  return {
    id: `security-${provider}`, name: provider === 'deepseek-account' ? 'DeepSeek Account' : 'DeepSeek API',
    async listModels() {
      const llm = ctx.get('llm')
      if (!llm || !llm.listProviders().some(candidate => candidate.id === provider)) return []
      return (await llm.listModels(provider)).map(({ id, name }) => ({ id, name }))
    },
    async *run(request): AsyncGenerator<StreamChunk> {
      const signal = AbortSignal.any([request.signal, lifetime])
      signal.throwIfAborted()
      const llm = ctx.get('llm')
      if (!llm || !(await this.listModels()).some(model => model.id === request.model)) throw new Error('Selected DeepSeek conversation model is unavailable')
      const messages = await history({ ...request, signal }, provider)
      signal.throwIfAborted()
      for await (const chunk of llm.stream({ provider, model: request.model, messages, tools: [], signal, sessionId: request.agent.id })) {
        signal.throwIfAborted()
        if (chunk.type === 'tool-call-delta' || (chunk.type === 'finish' && chunk.reason.kind === 'tool-calls')) throw new Error('DeepSeek conversation attempted a tool call')
        yield chunk
      }
    },
  }
}
