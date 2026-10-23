/** Shared conversational task setup and automatic saving protocol. */
import type { SecurityConversationRequest } from './conversation-types.ts'
import type { SecurityTask } from './security-records.ts'
/** Confirmed setup facts; reference fingerprints invalidate confirmations after edits. */
export interface SecurityTaskSetup {
  completionCondition: string
  permission: { assetIds: string[]; confirmed: boolean }
  scope: { assetIds: string[]; rules: string; confirmed: boolean }
  operations: { constraints: string; confirmed: boolean }
  limits: string
}
/** Validated editable fields saved from clear task-setup answers. */
export type SecuritySetupPatch = {
  [K in 'name' | 'description' | 'objective' | 'goals' | 'constraints' | 'scopeRules' | 'setup' | 'agentModels' | 'agentModelModes']?: SecurityTask[K] | undefined
}
/** Durable proposal bound to the exact aggregate revision shown to the model. */
export interface SecuritySetupProposal {
  id: string
  reply: string
  patch: SecuritySetupPatch
  baseRevision: number
  createdAt: number
  status: 'pending' | 'confirmed' | 'conflict'
}
/** Current derived readiness and latest proposal; readiness never grants execution permission. */
export interface SecuritySetupState {
  active: boolean
  /** Latest durable aggregate revision used to refresh editable task views. */
  recordRevision: number
  proposal?: SecuritySetupProposal | undefined
  /** Saving or continuing a validated answer failed; ordinary reads never retry inference. */
  saveError?: string | undefined
  /** Conversation requested planning, but Host admission failed without starting work. */
  plannerError?: string | undefined
  checklist: { goal: boolean; scope: boolean; permission: boolean; operations: boolean; limits: boolean }
}
/** Explicit idempotent first question; opening an existing task never triggers inference. */
export interface SecuritySetupBeginRequest extends SecurityConversationRequest {
  requestId: string
  locale: 'ja' | 'en' | 'zh'
}
/** Retry saving or continuing one failed proposal without overwriting intervening edits. */
export interface SecuritySetupConfirmRequest extends SecurityConversationRequest {
  proposalId: string
  expectedRevision: number
  requestId: string
}
