/** Execution engines that own native tool loops. @module @deepseek-ai/dsh-agent/execution-engines */

import type { StreamChunk, UserMessage } from '@deepseek-ai/dsh-llm'
import type { Agent } from './types.ts'
import type { SubscriptionConnection, SubscriptionConnectResult, SubscriptionEngine } from './engine-types.ts'

/** Explicit host capability bound to a live native execution route. */
export interface EngineHostTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  /** Execute through the owning service, which enforces its scope and budgets.
   * @param input Schema-validated tool arguments.
   * @param signal Turn cancellation.
   * @returns Model-facing result text.
   */
  execute(input: unknown, signal: AbortSignal): Promise<string>
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /** Resolve explicit Host capabilities for one ordinary native main-chat turn.
     * @param request Current Agent, accepted input and cancellation signal.
     * @param next Remaining providers; listeners must delegate before appending capabilities.
     * @mode waterfall
     */
    'subscription-engines/host-tools'(request: EngineRunRequest, next: () => Promise<readonly EngineHostTool[]>): Promise<readonly EngineHostTool[]>
  }
}

/** Accepted durable input for one native engine turn. */
export interface EngineRunRequest {
  agent: Agent
  model: string
  turn: number
  step: number
  messages: readonly UserMessage[]
  signal: AbortSignal
  /** Logged JSON Schema requested by structured-output consumers. Claude conversation-only
   * enforces it natively; other engines retain their existing output mode and callers validate.
   */
  responseSchema?: Record<string, unknown>
  /** Dedicated host-tools routes only; never enables tools on conversation routes. */
  hostTools?: readonly EngineHostTool[]
}

/** Native conversation driver; its tool activity is not reexecuted by the Harness. */
export interface AgentExecutionEngine {
  id: string
  name: string
  /** Accepted prompt modalities; omitted engines retain text-only admission. */
  inputModalities?: readonly ('text' | 'image')[]
  /** @returns Native model choices, including the provider default. */
  listModels(): Promise<readonly { id: string; name: string }[]>
  /** @param request Accepted input and owning Agent. @returns Assistant stream for one native turn. */
  run(request: EngineRunRequest): AsyncIterable<StreamChunk>
}

/** Optional service supplying main-chat execution engines. */
export interface AgentExecutionEngines {
  /**
   * Register a lookup-only engine; list() and the model catalog exclude it.
   * Duplicate built-in or registered identities throw. The caller owns the returned effect.
   * @param engine Internal execution engine.
   * @returns Identity-safe disposer for this registration.
   */
  register(engine: AgentExecutionEngine): () => void
  /** Resolve a built-in or registered execution engine.
   * @param id Engine identity.
   * @returns Registered engine, if present.
   */
  get(id: string): AgentExecutionEngine | undefined
  /** List user-selectable execution engines.
   * @returns Engines in display order, excluding lookup-only registrations.
   */
  list(): readonly AgentExecutionEngine[]
  /** Read native provider authentication without exposing credentials.
   * @returns Safe native authentication status.
   */
  connections(): Promise<readonly SubscriptionConnection[]>
  /** Start the selected official provider login flow.
   * @param engine Subscription provider.
   * @returns Native login instructions.
   */
  connect(engine: SubscriptionEngine): Promise<SubscriptionConnectResult>
}

declare module '@deepseek-ai/cordis' {
  interface Context { agentEngines: AgentExecutionEngines }
}
