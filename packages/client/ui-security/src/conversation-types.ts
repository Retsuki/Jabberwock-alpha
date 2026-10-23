/** Shared wire types and durable source vocabulary for task conversations. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** Quoted task configuration admitted before the owner's conversation input.
     * @persistenceAttribution
     */
    'security-task-context': { kind: 'security-task-context'; form: 'notice'; summary: string }
  }
}

/** Conversation-only provider identities, preserving distinct DeepSeek credentials. */
export const securityConversationEngines = ['claude', 'codex', 'deepseek-account', 'deepseek-official'] as const
/** Selectable conversation provider identity. */
export type SecurityConversationEngine = typeof securityConversationEngines[number]

/** Task identity checked against its registered Workspace on every operation. */
export interface SecurityConversationRequest { workspaceId: WorkspaceId; taskId: string }
/** Idempotent owner input; the request identity must be stable across retries. */
export interface SecurityConversationSendRequest extends SecurityConversationRequest { text: string; requestId: string }
/** Session identity consumed by the existing Session follow/projection transport. */
export interface SecurityConversationValue { sessionId: SessionId; engine: SecurityConversationEngine; model: string }
/** Task-local subscription selection; model identities come from the safe engine catalog. */
export interface SecurityConversationSelection { engine: SecurityConversationEngine; model: string }
/** An explicit available model selected by an Agent, with a short operational reason. */
export interface SecurityModelDecision extends SecurityConversationSelection { reason: string }
/** Agent role whose next invocation uses the selected model. */
export type SecurityAgentRole = 'main' | 'planner' | 'worker'
/** Catalog lookup defaults to the Main Agent for existing callers. */
export interface SecurityConversationCatalogRequest extends SecurityConversationRequest { role?: SecurityAgentRole }
/** Available conversation-only engines and their current provider-owned model choices. */
export interface SecurityConversationCatalog {
  mode?: 'auto' | 'fixed'
  selection: SecurityConversationSelection
  engines: { id: SecurityConversationEngine; name: string; models: { id: string; name: string }[] }[]
}
/** Select the next role invocation; Main Agent changes preserve its idle Session and transcript. */
export interface SecurityConversationSelectRequest extends SecurityConversationRequest, SecurityConversationSelection {
  role?: SecurityAgentRole
  mode?: 'auto' | 'fixed'
}
