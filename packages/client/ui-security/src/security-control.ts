/** Common security operation owner; chat and screens retain the existing domain admissions. */
import { createHash } from 'node:crypto'
import { Remote, RemoteError, TypertRemoteService, principalOf } from '@deepseek-ai/dsh-typert-protocol'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { securityChatCommandSchema } from './control-types.ts'
import type { SecurityControlRequest, SecurityControlResult } from './control-types.ts'
import { taskSchema } from './security-records.ts'
import { setupChecklist, validateSetupModelPatch, normalizeSecuritySetup } from './security-setup.ts'
import type { SecurityRecords } from './security-records.ts'

declare module '@deepseek-ai/cordis' {
  interface Context { /** Common owner operations without model-selected workspace authority. */ securityControl: SecurityControlService }
}

/** Owner-only commands reuse record revisions, checklist admission and Worker delivery. */
export class SecurityControlService extends TypertRemoteService {
  static inject = ['securityRecords', 'securityExecution', 'securityWorkers', 'securityPlanning', 'securityFindings',
    'securitySetup', 'securityConversations', 'workspaceRegistry']
  /** @param ctx Host containing the existing security domain services. */
  constructor(ctx: import('@deepseek-ai/cordis').Context, private readonly config: { controlModelBytes: number }) { super(ctx, 'securityControl') }

  /** Execute one owner command; execution acceptance never implies completed investigation.
   * @param request Workspace-scoped command with current revision for mutable settings or execution.
   * @returns Compact current state and an explicit destination for open commands.
   */
  @Remote({ resources: { workspace: (request: SecurityControlRequest) => request.workspaceId } })
  async execute(request: SecurityControlRequest): Promise<SecurityControlResult> {
    this.authorize(request.workspaceId)
    const { workspaceId, ...input } = request
    const command = securityChatCommandSchema.parse(input)
    let records = this.ctx.securityRecords.read({ workspaceId })
    const result = (data: unknown, destination?: { taskId: string; view?: SecurityControlResult['view'] }): SecurityControlResult => {
      const value: SecurityControlResult = { action: command.action, workspaceId, ...destination, data: JSON.stringify(data) }
      if (Buffer.byteLength(JSON.stringify(value)) <= this.config.controlModelBytes) return value
      value.data = JSON.stringify({ truncated: true, originalBytes: Buffer.byteLength(value.data),
        message: 'Result exceeds the configured output limit. Use list pagination or open the task for the full saved details.' })
      if (Buffer.byteLength(JSON.stringify(value)) > this.config.controlModelBytes) throw new Error('Security control output limit is too small for result metadata')
      return value
    }
    const save = (tasks: SecurityRecords['tasks'], expectedRevision: number) => this.ctx.securityRecords.save({
      workspaceId, expectedRevision, companies: records.companies, assets: records.assets, tasks,
    })
    if (command.action === 'list') {
      const offset = command.offset ?? 0; const limit = command.limit ?? 20
      const tasks = records.tasks.filter(task => !task.archived)
      return result({ revision: records.revision, offset, limit,
        totals: { companies: records.companies.length, assets: records.assets.length, tasks: tasks.length },
        companies: records.companies.slice(offset, offset + limit).map(({ id, name }) => ({ id, name })),
        assets: records.assets.slice(offset, offset + limit),
        tasks: tasks.slice(offset, offset + limit).map(({ id, name, assetIds }) => ({ id, name, assetIds })) })
    }
    if (command.action === 'create') {
      const digest = createHash('sha256').update(JSON.stringify([workspaceId, command.requestId])).digest('hex')
      const taskId = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`
      const previous = records.tasks.find(task => task.id === taskId)
      if (previous) {
        if (previous.name !== command.name || JSON.stringify(previous.assetIds) !== JSON.stringify(command.assetIds)) throw new Error('Request identifier already belongs to a different task creation')
        return result({ revision: records.revision, task: previous, checklist: setupChecklist(previous) }, { taskId })
      }
      const now = Date.now()
      const task = taskSchema.parse({ id: taskId, name: command.name, assetIds: command.assetIds,
        description: '', objective: '', status: 'draft', archived: false, pinned: false, createdAt: now, updatedAt: now })
      records = await save([...records.tasks, task], command.expectedRevision)
      return result({ revision: records.revision, task, checklist: setupChecklist(task) }, { taskId })
    }
    const task = records.tasks.find(task => task.id === command.taskId && !task.archived)
    if (!task) throw new Error('Task not found in this workspace')
    const identity = { workspaceId, taskId: task.id }
    if (command.action === 'open') return result({ name: task.name }, { taskId: task.id, view: command.view ?? 'sessions' })
    if (command.action === 'update') {
      const patch = command.patch.agentModels === undefined && command.patch.agentModelModes === undefined ? command.patch
        : { ...command.patch, ...validateSetupModelPatch(command.patch, task,
          await this.ctx.securityConversations.catalog({ ...identity, role: 'planner' })) }
      if (patch.setup !== undefined) patch.setup = normalizeSecuritySetup(patch.setup, {
        assetIds: patch.assetIds ?? task.assetIds, scopeRules: patch.scopeRules ?? task.scopeRules,
        constraints: patch.constraints ?? task.constraints,
      })
      const next = taskSchema.parse({ ...task, ...patch, updatedAt: Math.max(Date.now(), task.updatedAt) })
      const checks = setupChecklist(next)
      if (command.patch.setup !== undefined && (next.setup?.permission.confirmed && !checks.permission
        || next.setup?.scope.confirmed && !checks.scope
        || next.setup?.operations.confirmed && !checks.operations)) throw new Error('Confirmed setup must match the proposed assets, scope and operation constraints')
      records = await save(records.tasks.map(row => row.id === task.id ? next : row), command.expectedRevision)
      const saved = records.tasks.find(row => row.id === task.id)
      if (saved === undefined) throw new Error('Committed task is missing from security records')
      return result({ revision: records.revision, task: saved, checklist: setupChecklist(saved) }, identity)
    }
    if (command.action === 'plan') {
      const state = await this.ctx.securityPlanning.start({ ...identity, requestId: command.requestId,
        expectedRevision: command.expectedRevision,
        ...command.modelDecision === undefined ? {} : { modelDecision: command.modelDecision },
      })
      return result({ plans: state.plans.map(({ id, status, error }) => ({ id, status, error })) }, identity)
    }
    if (command.action === 'start' || command.action === 'resume') {
      const { action: _action, ...start } = command
      const state = await this.ctx.securityExecution.start({ workspaceId, taskId: start.taskId,
        requestId: start.requestId, expectedRevision: start.expectedRevision,
        ...start.modelDecision === undefined ? {} : { modelDecision: start.modelDecision },
        ...command.action === 'resume' ? { resumeRunId: command.resumeRunId }
          : { ...command.planId === undefined ? {} : { planId: command.planId },
            ...command.targets === undefined ? {} : { targets: command.targets } },
      })
      const runs = state.runs.map(({ id, status, summary, error, snapshot }) =>
        ({ id, status, summary, error, limits: snapshot.limits }))
      return result({ runs, limits: state.limits }, identity)
    }
    if (command.action === 'stop') {
      await this.ctx.securityExecution.cancel(identity)
      await this.ctx.securityPlanning.cancel(identity)
      await this.ctx.securityWorkers.cancel(identity)
      return result({ stopped: true }, identity)
    }
    if (command.action === 'message') {
      const state = await this.ctx.securityWorkers.send({ ...identity,
        requestId: command.requestId, runId: command.runId, text: command.text })
      return result({ accepted: true, worker: state.runs.filter(run => run.id === command.runId)
        .map(({ id, status, conversationStatus }) => ({ id, status, conversationStatus })) }, identity)
    }
    const findings = await this.ctx.securityFindings.read(identity)
    const plannerModels = await this.ctx.securityConversations.catalog({ ...identity, role: 'planner' })
    const workerModels = await this.ctx.securityConversations.catalog({ ...identity, role: 'worker' })
    const execution = this.ctx.securityExecution.read(identity)
    return result({ revision: records.revision, task, assets: records.assets.filter(asset => task.assetIds.includes(asset.id)),
      checklist: setupChecklist(task),
      modelCatalog: { planner: plannerModels, worker: workerModels },
      executionLimits: execution.limits,
      executions: execution.runs
        .map(({ id, status, summary, error, round, snapshot }) => ({ id, status, summary, error, round, limits: snapshot.limits })),
      planners: this.ctx.securityPlanning.read(identity).plans.map(({ id, status, error, items }) => ({ id, status, error,
        items: items.map(({ id, title, status }) => ({ id, title, status })) })),
      workers: this.ctx.securityWorkers.read(identity).runs
        .map(({ id, status, itemId, summary, error, conversationStatus }) => ({ id, status, itemId, summary, error, conversationStatus })),
      findings: findings.findings.map(({ id, title, severity, status, assetId, summary, remediation }) => ({
        id, title, severity, status, assetId, summary, remediation })),
      retests: findings.retests.map(({ id, findingId, status, verdict, summary }) => ({ id, findingId, status, verdict, summary })),
    }, identity)
  }

  private authorize(workspaceId: WorkspaceId): void {
    if (principalOf(this.ctx.invocation) !== undefined || !this.ctx.workspaceRegistry.get(workspaceId)) {
      throw new RemoteError('security/rejected', 'Security control requires the registered Workspace owner', { workspaceId })
    }
  }
}
