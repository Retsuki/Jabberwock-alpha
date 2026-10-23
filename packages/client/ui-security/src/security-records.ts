/** Durable workspace-owned security records; no sample or execution state is stored. */
import { z } from 'zod'
import { securityConversationEngines } from './conversation-types.ts'
import type { SecurityAgentRole, SecurityConversationSelection } from './conversation-types.ts'
import type { SecurityTaskSetup } from './setup-types.ts'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'

/** One company and its explicit diagnostic scope. */
export interface SecurityCompany {
  id: string
  name: string
  scope: { kind: 'domain' | 'ip' | 'cidr'; value: string }[]
  evidence: string
}
/** An asset belonging to a company in the same workspace. */
export interface SecurityAsset {
  id: string
  companyId: string
  kind: 'domain' | 'ip' | 'subdomain' | 'app' | 'service' | 'endpoint'
  value: string
}
/** A saved draft, never an executed diagnostic task. */
export interface SecurityTask {
  id: string
  name: string
  description: string
  objective: string
  status: 'draft'
  assetIds: string[]
  /** Editable goals; omitted by records created before goal editing was available. */
  goals?: { id: string; text: string }[] | undefined
  /** Saved operation constraints; the Worker validates supported descriptions before each request. */
  constraints?: { id: string; action: 'allow' | 'deny'; text: string }[] | undefined
  /** Draft allowed or excluded scope rules; incomplete values remain editable. */
  scopeRules?: { id: string; action: 'allow' | 'deny'; kind: 'domain' | 'ip' | 'cidr' | 'url'; value: string; note: string }[] | undefined
  /** Owner-confirmed setup facts, absent on older draft records. */
  setup?: SecurityTaskSetup | undefined
  /** Role choices apply only to the next invocation; absent roles use their existing default. */
  agentModels?: Partial<Record<SecurityAgentRole, SecurityConversationSelection | undefined>> | undefined
  /** Delegated roles select a model per invocation unless explicitly fixed. */
  agentModelModes?: Partial<Record<'planner' | 'worker', 'auto' | 'fixed' | undefined>> | undefined
  archived: boolean
  pinned: boolean
  createdAt: number
  updatedAt: number
}
/** Atomic security aggregate owned by exactly one registered workspace. */
export interface SecurityRecords {
  workspaceId: WorkspaceId
  revision: number
  companies: SecurityCompany[]
  assets: SecurityAsset[]
  tasks: SecurityTask[]
}
/** Read one workspace without creating a stored record. */
export interface SecurityReadRequest { workspaceId: WorkspaceId }
/** Replace one complete aggregate only when its loaded revision is current. */
export interface SecuritySaveRequest {
  workspaceId: WorkspaceId
  expectedRevision: number
  companies: SecurityCompany[]
  assets: SecurityAsset[]
  tasks: SecurityTask[]
}
const identifier = z.string().trim().min(1)
const companySchema = z.object({
  id: identifier, name: z.string().trim().min(1),
  scope: z.array(z.object({ kind: z.enum(['domain', 'ip', 'cidr']), value: z.string().trim().min(1) }).strict()),
  evidence: z.string(),
}).strict()
/** Asset validation shared by draft and immutable planning storage. */
export const assetSchema = z.object({
  id: identifier, companyId: identifier,
  kind: z.enum(['domain', 'ip', 'subdomain', 'app', 'service', 'endpoint']), value: z.string().trim().min(1),
}).strict()
/** Durable confirmed setup fields; older tasks may omit the entire setup object. */
export const setupSchema = z.object({
  completionCondition: z.string(),
  permission: z.object({ assetIds: z.array(identifier), confirmed: z.boolean() }).strict(),
  scope: z.object({ assetIds: z.array(identifier), rules: z.string(), confirmed: z.boolean() }).strict(),
  operations: z.object({ constraints: z.string(), confirmed: z.boolean() }).strict(),
  limits: z.string(),
}).strict()
const agentModelSchema = z.object({ engine: z.enum(securityConversationEngines), model: z.string().trim().min(1).max(200) }).strict()
/** Task validation shared by draft and immutable planning storage. */
export const taskSchema = z.object({
  id: identifier, name: z.string().trim().min(1), description: z.string(), objective: z.string(),
  status: z.literal('draft'), assetIds: z.array(identifier), archived: z.boolean(), pinned: z.boolean(),
  goals: z.array(z.object({ id: identifier, text: z.string() }).strict()).optional(),
  constraints: z.array(z.object({
    id: identifier, action: z.enum(['allow', 'deny']), text: z.string(),
  }).strict()).optional(),
  scopeRules: z.array(z.object({
    id: identifier, action: z.enum(['allow', 'deny']), kind: z.enum(['domain', 'ip', 'cidr', 'url']),
    value: z.string(), note: z.string(),
  }).strict()).optional(),
  setup: setupSchema.optional(),
  agentModels: z.object({
    main: agentModelSchema.optional(),
    planner: agentModelSchema.optional(),
    worker: agentModelSchema.optional(),
  }).strict().optional(),
  agentModelModes: z.object({ planner: z.enum(['auto', 'fixed']).optional(), worker: z.enum(['auto', 'fixed']).optional() }).strict().optional(),
  createdAt: z.number().int().nonnegative(), updatedAt: z.number().int().nonnegative(),
}).strict().refine(task => task.updatedAt >= task.createdAt, 'Task update time precedes creation')
const workspaceIdSchema = identifier.transform(value => value as WorkspaceId)
/** Wire input validation; callers cannot write revisions or running task state. */
export const securitySaveSchema: z.ZodType<SecuritySaveRequest> = z.object({
  workspaceId: workspaceIdSchema, expectedRevision: z.number().int().nonnegative(),
  companies: z.array(companySchema), assets: z.array(assetSchema), tasks: z.array(taskSchema),
}).strict()
/** Authoritative storage validation; invalid data rejects domain opening. */
export const securityRecordsSchema: z.ZodType<SecurityRecords> = z.object({
  workspaceId: workspaceIdSchema, revision: z.number().int().nonnegative(),
  companies: z.array(companySchema), assets: z.array(assetSchema), tasks: z.array(taskSchema),
}).strict()

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** Security input, workspace ownership, or stored data rejected this operation. */
    'security/rejected': { readonly workspaceId: WorkspaceId }
    /** A different writer committed since the caller read the aggregate. */
    'security/conflict': { readonly workspaceId: WorkspaceId; readonly expected: number; readonly actual: number }
  }
}
