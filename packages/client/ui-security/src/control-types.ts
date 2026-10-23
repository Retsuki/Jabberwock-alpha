/** Shared owner operations used by task screens and main-chat tools. */
import { z } from 'zod'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { taskSchema } from './security-records.ts'
import { modelDecisionSchema } from './security-conversations.ts'

const id = z.string().trim().min(1).max(200)
const task = { taskId: id }
const mutation = { requestId: id, expectedRevision: z.number().int().nonnegative() }
/** Editable configuration reuses the durable task owner's field validators. */
export const securityTaskPatchSchema = z.object({
  name: taskSchema.shape.name.optional(), description: taskSchema.shape.description.optional(),
  objective: taskSchema.shape.objective.optional(), assetIds: taskSchema.shape.assetIds.optional(),
  goals: taskSchema.shape.goals, constraints: taskSchema.shape.constraints, scopeRules: taskSchema.shape.scopeRules,
  setup: taskSchema.shape.setup, agentModels: taskSchema.shape.agentModels, agentModelModes: taskSchema.shape.agentModelModes,
}).strict()
/** Model arguments deliberately omit workspace identity: the live Session supplies it. */
export const securityChatCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list'), offset: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(100).optional() }).strict(),
  z.object({ action: z.literal('read'), ...task }).strict(),
  z.object({ action: z.literal('create'), ...mutation, name: taskSchema.shape.name, assetIds: taskSchema.shape.assetIds }).strict(),
  z.object({ action: z.literal('update'), ...task, ...mutation, patch: securityTaskPatchSchema,
    confirmationQuote: z.string().trim().min(1).optional() }).strict(),
  z.object({ action: z.literal('plan'), ...task, ...mutation, modelDecision: modelDecisionSchema.optional() }).strict(),
  z.object({ action: z.literal('start'), ...task, ...mutation, planId: id.optional(), modelDecision: modelDecisionSchema.optional(),
    targets: z.array(z.object({ assetId: id, url: z.string().min(1) }).strict()).optional() }).strict(),
  z.object({ action: z.literal('resume'), ...task, ...mutation, resumeRunId: id, modelDecision: modelDecisionSchema.optional() }).strict(),
  z.object({ action: z.literal('stop'), ...task }).strict(),
  z.object({ action: z.literal('message'), ...task, requestId: id, runId: id, text: z.string().trim().min(1).max(20000) }).strict(),
  z.object({ action: z.literal('open'), ...task, view: z.enum(['sessions', 'overview', 'findings', 'report']).optional() }).strict(),
])
/** Validated main-chat command with owner workspace resolved by the Host. */
export type SecurityChatCommand = z.infer<typeof securityChatCommandSchema>
/** Remote owner command. Chat callers never choose this workspace identity. */
export type SecurityControlRequest = SecurityChatCommand & { workspaceId: WorkspaceId }
/** Bounded tool result and optional explicit navigation destination. */
export interface SecurityControlResult {
  action: SecurityChatCommand['action']
  workspaceId: WorkspaceId
  taskId?: string | undefined
  view?: 'sessions' | 'overview' | 'findings' | 'report' | undefined
  data: string
}
