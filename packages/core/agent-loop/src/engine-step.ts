/** Durable admission and assistant settlement for engines that own their tool loop. */

import type { Agent, AgentExecutionEngine } from '@deepseek-ai/dsh-agent'
import { createAssistantMessage, LlmError } from '@deepseek-ai/dsh-llm'
import type { LlmCallConfig, UserMessage } from '@deepseek-ai/dsh-llm'
import { canonicalHeader, headerEquals } from '@deepseek-ai/dsh-session'
import type { RequestContext, TurnEndReason } from '@deepseek-ai/dsh-session'
import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import type { AssistantStreamAttempt } from './assistant-stream.ts'

interface EngineStepOptions {
  agent: Agent
  engine: AgentExecutionEngine
  config: LlmCallConfig
  messages: readonly UserMessage[]
  admitMessages: boolean
  turn: number
  step: number
  signal: AbortSignal
  live: AssistantStreamAttempt
  startsRequestSeries: boolean
  requestHeaderLogged: boolean
  requestSurfaceGeneration: number
  onRequestLogged: (generation: number) => void
}

/**
 * Commit accepted input, then stream one native turn without running its tools again.
 * @param options - Engine, accepted input, and Agent-owned stream and header state.
 * @returns A completed or token-limited step; failed and unfinished streams reject.
 */
export async function runEngineStep(options: EngineStepOptions): Promise<Extract<TurnEndReason, { kind: 'completed' | 'max-tokens' }>> {
  const { agent, engine, config, turn, step, signal, live } = options
  const { session } = agent
  signal.throwIfAborted()
  const messages = deepFreeze(structuredClone([...options.messages]))
  if (options.admitMessages) {
    for (const message of messages) {
      session.append('user/message', message, { surfaceOp: 'append' })
    }
  }
  const generation = session.surface.contentGeneration
  const startsSeries = options.startsRequestSeries || options.requestSurfaceGeneration !== generation
  const header = canonicalHeader({ config })
  const baseline = session.requestHeader()
  if (!options.requestHeaderLogged) {
    session.append('request/header', {
      header,
      reason: baseline === undefined ? 'initial' : 'resume',
      ...startsSeries ? { startsSeries: true } : {},
    })
  } else if (baseline === undefined || !headerEquals(baseline, header)) {
    session.append('request/header', { header, reason: 'change', ...startsSeries ? { startsSeries: true } : {} })
  } else if (startsSeries) {
    session.append('request/header', { header, reason: 'series' })
  }
  options.onRequestLogged(generation)
  const requestContext: RequestContext = { provider: config.provider, model: config.model }
  const previousContext = session.requestContext()
  if (previousContext?.provider !== config.provider
    || previousContext.model !== config.model
    || previousContext.contextWindow !== undefined
    || previousContext.systemPromptUpdate !== undefined) {
    session.append('request/context', requestContext)
  }
  signal.throwIfAborted()

  let started = false
  try {
    const stream = engine.run({ agent, model: config.model, turn, step, messages, signal })
    signal.throwIfAborted()
    live.start()
    started = true
    let finished = false
    for await (const chunk of stream) {
      signal.throwIfAborted()
      if (finished) throw new Error(`Engine "${engine.id}" emitted a chunk after its finish`)
      live.push(chunk)
      if (chunk.type === 'finish') finished = true
    }
    signal.throwIfAborted()
    if (!finished) throw new Error(`Engine "${engine.id}" ended without a finish`)
    const finish = live.finish
    if (finish.kind === 'error' || finish.kind === 'aborted') {
      throw new LlmError(finish.failure.message, finish.failure.code, finish.failure)
    }
    const message = createAssistantMessage({
      content: live.blocks(),
      source: {
        provider: config.provider,
        model: config.model,
        ...live.replayState === undefined ? {} : { replayState: live.replayState },
      },
    })
    live.settle('assistant/message', () => session.append('assistant/message', {
      turn,
      step,
      message,
      ...live.usage === undefined ? {} : { usage: live.usage },
      stream: live.stream,
    }, { surfaceOp: 'append' }).seq)
    return { kind: finish.kind === 'max-tokens' ? 'max-tokens' : 'completed' }
  } catch (error: unknown) {
    if (!started || live.ended) throw error
    try {
      const content = signal.aborted ? live.interruptedBlocks() : []
      if (content.length > 0) {
        live.settle('assistant/message', () => session.append('assistant/message', {
          turn,
          step,
          message: createAssistantMessage({
            content,
            source: {
              provider: config.provider,
              model: config.model,
              ...live.replayState === undefined ? {} : { replayState: live.replayState },
            },
          }),
          interrupted: true,
          ...live.usage === undefined ? {} : { usage: live.usage },
          stream: live.stream,
        }, { surfaceOp: 'append' }).seq)
      } else {
        live.settle('assistant/attempt', () => session.append('assistant/attempt', { turn, step, stream: live.stream }).seq)
      }
    } catch (settlementError: unknown) {
      throw new AggregateError([error, settlementError], 'Engine stream failed and its durable settlement was rejected', { cause: error })
    }
    throw error
  }
}
