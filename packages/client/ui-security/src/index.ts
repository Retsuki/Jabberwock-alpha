/** Durable security records with separate task conversation, planning and Worker owners. */
import schema from '@deepseek-ai/schemastery'
import { Service, type Context } from '@deepseek-ai/cordis'
import { Remote, RemoteError, TypertRemoteService, principalOf } from '@deepseek-ai/dsh-typert-protocol'
import { defineDomain, domainTable, type KvTable } from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-workspace'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { SecurityFindingsService } from './security-findings.ts'
export { SecurityFindingsService } from './security-findings.ts'
import { SecurityExplorationService } from './security-exploration.ts'
export { SecurityExplorationService } from './security-exploration.ts'
import { SecurityExecutionService } from './security-execution.ts'
export { SecurityExecutionService } from './security-execution.ts'
import { SecurityWorkersService } from './security-workers.ts'
export { SecurityWorkersService } from './security-workers.ts'
import { SecuritySetupService } from './security-setup.ts'
export { SecuritySetupService } from './security-setup.ts'
import { SecurityPlanningService } from './security-planning.ts'
export { SecurityPlanningService } from './security-planning.ts'
import { SecurityConversationsService } from './security-conversations.ts'
import { SecurityControlService } from './security-control.ts'
import { registerSecurityChatTools } from './security-chat-tools.ts'
import { SecuritySupplyChainService } from './security-supply-chain.ts'
export { SecuritySupplyChainService } from './security-supply-chain.ts'
import { registerSecuritySkills } from './security-skills.ts'
export { SecurityControlService } from './security-control.ts'
export { SecurityConversationsService } from './security-conversations.ts'
import { securityRecordsSchema, securitySaveSchema } from './security-records.ts'
import { validateLocalHttpOrigins } from './worker-policy.ts'
import type { SecurityRecords, SecurityReadRequest, SecuritySaveRequest } from './security-records.ts'

const domainSpec = defineDomain({
  name: 'jabberwock_security', version: 1,
  tables: { workspaces: domainTable<WorkspaceId, SecurityRecords>(securityRecordsSchema) },
})
declare module '@deepseek-ai/cordis' {
  interface Events {
    /** Durable security records changed.
     * @mode emit
     * @param records Committed Workspace records.
     */
    'security-records/changed'(records: SecurityRecords): void
  }
  interface Context {
    /** Durable owner-only security records for registered workspaces. */
    securityRecords: SecurityRecordsService
  }
}

/** Validated deployment limits shared by security planning, Workers and execution. */
export interface SecurityRecordsConfig {
  /** Maximum complete main-chat security result bytes, including navigation metadata. */
  controlModelBytes: number
  /** Maximum serialized shared-knowledge bytes supplied by one model read. */
  explorationModelBytes: number
  /** Exact owner-configured IPv4 loopback HTTP origins; empty keeps public-only targets. */
  localHttpOrigins: string[]
  /** Maximum successful Planner review rounds in one investigation. */
  executionMaxRounds: number
  /** Maximum Worker HTTP requests admitted by one investigation. */
  executionMaxRequests: number
  /** Maximum simultaneous investigation Workers for one task execution. */
  executionMaxConcurrentWorkers: number
  /** Elapsed-time limit for one investigation, in milliseconds. */
  executionTimeoutMs: number
  /** Interval between child planning and Worker completion checks, in milliseconds. */
  executionPollMs: number
  /** Shared elapsed-time limit for a Planner response series, in milliseconds. */
  plannerTimeoutMs: number
  /** Maximum responses for correcting malformed Planner output within its deadline. */
  plannerResponseAttempts: number
  /** HTTP request timeout for one Worker, in milliseconds. */
  workerTimeoutMs: number
  /** Maximum responses for correcting malformed Worker reports without another HTTP request. */
  workerResponseAttempts: number
  /** Shared elapsed-time limit for a Worker model response series, in milliseconds. */
  workerModelTimeoutMs: number
  /** Maximum response body bytes retained by one Worker. */
  workerMaxResponseBytes: number
  /** Maximum saved response bytes supplied to the Worker model. */
  workerModelResponseBytes: number
  /** Maximum tool invocations within one Worker investigation. */
  workerMaxToolCalls: number
  /** Enable isolated Worker browser tools. */
  workerBrowserEnabled: boolean
  /** Hide Worker browser windows when enabled. */
  workerBrowserHeadless: boolean
  /** Optional installed Chromium executable; empty uses Playwright discovery. */
  workerBrowserExecutablePath: string
}

/** Owner-only atomic record API; accepted writes settle after storage durability. */
export default class SecurityRecordsService extends TypertRemoteService {
  static inject = ['storageDomain', 'workspaceRegistry']
  static Config = schema.object({
    controlModelBytes: schema.number().step(1).min(1024).max(1048576).default(65536),
    explorationModelBytes: schema.number().step(1).min(1024).max(1048576).default(65536),
    localHttpOrigins: schema.array(schema.string()).max(8).default([]),
    executionMaxRounds: schema.number().step(1).min(1).max(20).default(3),
    executionMaxRequests: schema.number().step(1).min(1).max(100).default(10),
    executionMaxConcurrentWorkers: schema.number().step(1).min(1).max(10).default(3),
    executionTimeoutMs: schema.number().step(1).min(1000).max(2_147_483_647).default(600000),
    executionPollMs: schema.number().step(1).min(10).max(10000).default(250),
    plannerResponseAttempts: schema.number().step(1).min(1).max(3).default(2),
    plannerTimeoutMs: schema.number().step(1).min(1000).max(2_147_483_647).default(180000),
    workerResponseAttempts: schema.number().step(1).min(1).max(3).default(2),
    workerTimeoutMs: schema.number().step(1).min(1000).max(2_147_483_647).default(15000),
    workerModelTimeoutMs: schema.number().step(1).min(1000).max(2_147_483_647).default(180000),
    workerMaxResponseBytes: schema.number().step(1).min(1).max(16777216).default(4194304),
    workerModelResponseBytes: schema.number().step(1).min(1).max(1048576).default(65536),
    workerBrowserEnabled: schema.boolean().default(true),
    workerBrowserHeadless: schema.boolean().default(false),
    workerBrowserExecutablePath: schema.string().default(''),
    workerMaxToolCalls: schema.number().step(1).min(1).max(100).default(24),
  })
  /** Exact owner-configured loopback HTTP origins; empty in the normal public-only configuration. */
  readonly localHttpOrigins: readonly string[]
  private table?: KvTable<WorkspaceId, SecurityRecords>
  private readonly writes = new Map<WorkspaceId, Promise<void>>()

  /** @param ctx - Host services owning storage and registered workspaces.
   * @param config - Validated elapsed-time limit passed to the dedicated Planner.
   */
  constructor(ctx: Context, config: SecurityRecordsConfig) { super(ctx, 'securityRecords'); ctx.inject(['skills'], (scope) => { registerSecuritySkills(scope) }); this.localHttpOrigins = Object.freeze(validateLocalHttpOrigins(config.localHttpOrigins)); ctx.plugin(SecurityExplorationService, config); ctx.plugin(SecurityConversationsService); ctx.plugin(SecuritySetupService); ctx.plugin(SecurityPlanningService, config); ctx.plugin(SecurityWorkersService, config); ctx.plugin(SecurityExecutionService, config); ctx.plugin(SecurityFindingsService); ctx.plugin(SecurityControlService, config); ctx.plugin(SecuritySupplyChainService); ctx.inject(['securityControl', 'sessions'], (scope) =>{  registerSecurityChatTools(scope) }) }

  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(domainSpec)
    this.ctx.effect(() => () => domain.close(), 'securityRecords.domainClose')
    this.table = domain.table('workspaces')
    for (const [id, record] of this.table.entries()) {
      if (record.workspaceId !== id) throw new Error('Security record workspace key mismatch')
      this.validateReferences(record)
    }
  }

  /** Read existing records; a missing record returns an unsaved empty aggregate.
   * @param request - registered workspace identity.
   * @returns a detached aggregate at its current durable revision.
   */
  @Remote
  read(request: SecurityReadRequest): SecurityRecords {
    this.authorize(request.workspaceId)
    return structuredClone(this.requireTable().get(request.workspaceId) ?? {
      workspaceId: request.workspaceId, revision: 0, companies: [], assets: [], tasks: [],
    })
  }

  /** Atomically replace a current aggregate after validating ownership and references.
   * @param request - workspace, expected revision and proposed records.
   * @returns the committed aggregate, with deleted-asset task references removed.
   */
  @Remote
  async save(request: SecuritySaveRequest): Promise<SecurityRecords> {
    this.authorize(request.workspaceId)
    const parsed = securitySaveSchema.safeParse(request)
    if (!parsed.success) throw this.rejected(request.workspaceId, 'Invalid security records')
    const input = parsed.data
    const previousWrite = this.writes.get(input.workspaceId) ?? Promise.resolve()
    const operation = previousWrite.then(async () => {
      this.authorize(input.workspaceId)
      const current = this.read({ workspaceId: input.workspaceId })
      if (current.revision !== input.expectedRevision) {
        throw new RemoteError('security/conflict', 'Security records changed; reload before saving', {
          workspaceId: input.workspaceId, expected: input.expectedRevision, actual: current.revision,
        })
      }
      const companyIds = new Set(input.companies.map(company => company.id))
      const removedCompanies = new Set(current.companies.filter(company => !companyIds.has(company.id)).map(company => company.id))
      const assets = input.assets.filter(asset => !removedCompanies.has(asset.companyId))
      const assetIds = new Set(assets.map(asset => asset.id))
      const removedAssets = new Set(current.assets.filter(asset => !assetIds.has(asset.id)).map(asset => asset.id))
      const next: SecurityRecords = {
        workspaceId: input.workspaceId, revision: current.revision + 1, companies: input.companies, assets,
        tasks: input.tasks.map((task) => {
          const previous = current.tasks.find(item => item.id === task.id)
          const setup = task.setup === undefined ? undefined : structuredClone(task.setup)
          if (setup !== undefined && previous !== undefined && JSON.stringify(setup) === JSON.stringify(previous.setup)) {
            if (task.objective !== previous.objective || JSON.stringify(task.goals) !== JSON.stringify(previous.goals)) setup.completionCondition = ''
            const assetsChanged = task.assetIds.some(id =>
              JSON.stringify(assets.find(asset => asset.id === id)) !== JSON.stringify(current.assets.find(asset => asset.id === id)))
            if (JSON.stringify(task.scopeRules) !== JSON.stringify(previous.scopeRules) || assetsChanged) {
              setup.scope.confirmed = false
              setup.permission.confirmed = false
            }
          }
          return { ...task, ...setup === undefined ? {} : { setup }, assetIds: task.assetIds.filter(id => !removedAssets.has(id)) }
        }),
      }
      this.validateReferences(next)
      await this.requireTable().put(input.workspaceId, next)
      this.ctx.emit('security-records/changed', next)
      return structuredClone(next)
    })
    const settled = operation.then(() => {}, () => {})
    this.writes.set(input.workspaceId, settled)
    try { return await operation } finally {
      if (this.writes.get(input.workspaceId) === settled) this.writes.delete(input.workspaceId)
    }
  }

  private authorize(workspaceId: WorkspaceId): void {
    if (principalOf(this.ctx.invocation) !== undefined) throw this.rejected(workspaceId, 'Security records require the owner')
    if (!this.ctx.workspaceRegistry.get(workspaceId)) throw this.rejected(workspaceId, 'Workspace is not registered')
  }

  private requireTable(): KvTable<WorkspaceId, SecurityRecords> {
    if (!this.table) throw new Error('Security storage is not available')
    return this.table
  }

  private rejected(workspaceId: WorkspaceId, message: string): RemoteError<'security/rejected'> {
    return new RemoteError('security/rejected', message, { workspaceId })
  }

  private validateReferences(record: SecurityRecords): void {
    const unique = (ids: string[]): Set<string> => {
      const values = new Set(ids)
      if (values.size !== ids.length) throw this.rejected(record.workspaceId, 'Duplicate security record identifier')
      return values
    }
    const companyIds = unique(record.companies.map(company => company.id))
    const assetIds = unique(record.assets.map(asset => asset.id))
    unique(record.tasks.map(task => task.id))
    for (const asset of record.assets) {
      if (!companyIds.has(asset.companyId)) throw this.rejected(record.workspaceId, 'Asset references an unknown company')
    }
    for (const task of record.tasks) {
      unique(task.assetIds)
      unique((task.goals ?? []).map(goal => goal.id))
      unique((task.constraints ?? []).map(constraint => constraint.id))
      unique((task.scopeRules ?? []).map(rule => rule.id))
      if (task.assetIds.some(id => !assetIds.has(id))) throw this.rejected(record.workspaceId, 'Task references an unknown asset')
    }
  }
}
