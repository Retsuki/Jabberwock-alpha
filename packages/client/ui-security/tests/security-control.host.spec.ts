import { Context } from '@deepseek-ai/cordis'
import { SessionId, SessionStore } from '@deepseek-ai/dsh-session'
import { createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { Agent, EngineHostTool } from '@deepseek-ai/dsh-agent'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SecurityControlService } from '../src/security-control.ts'
import { securityChatTool, securityChatWorkspace, registerSecurityChatTools } from '../src/security-chat-tools.ts'
import { securitySaveSchema, type SecurityRecords, type SecuritySaveRequest } from '../src/security-records.ts'
import type { SecurityPlanningStartRequest } from '../src/planning-types.ts'
import type { SecurityExecutionStartRequest } from '../src/execution-types.ts'
import { assertSupportedJsonSchema, validateJsonSchemaValue, type ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { PeerId, RemoteInvocation } from '@deepseek-ai/dsh-typert-protocol'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { registerSecuritySkills } from '../src/security-skills.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface PrincipalMap {
    /** Test-only non-owner caller shared by access-control tests. */
    'test-guest': { readonly kind: 'test-guest'; readonly guest: string }
  }
}

const contexts: Context[] = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })
const workspaceId = 'workspace' as WorkspaceId
const executionLimits = { maxRounds: 3, maxRequests: 10, timeoutMs: 600000, maxConcurrentWorkers: 3 }
const task = { id: 'task', name: 'Local test', description: '', objective: 'Inspect', assetIds: ['asset'], status: 'draft' as const,
  archived: false, pinned: false, createdAt: 1, updatedAt: 1 }
async function fixture(options: { bytes?: number; member?: boolean; header?: { origin?: 'subagent'; delegationDepth?: number }; id?: string; loader?: boolean; failures?: boolean } = {}) {
  const ctx = new Context(); contexts.push(ctx)
  let records: SecurityRecords = { workspaceId, revision: 1, tasks: [structuredClone(task)],
    companies: [{ id: 'company', name: 'Synthetic', scope: [], evidence: '' }],
    assets: [{ id: 'asset', companyId: 'company', kind: 'app', value: 'http://127.0.0.1:43188' }] }
  await ctx.plugin(SessionStore)
  const session = ctx.sessions.create(SessionId(options.id ?? 'main'), { meta: { cwd: '/tmp', ...options.header } })
  session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '調査を開始して。操作制約と範囲を確認しました。' }] }), { surfaceOp: 'append' })
  const agent = { id: session.id, session, ctx } as Agent
  let membership = options.member !== false
  ctx.provide('workspaceRegistry', { get: (id: WorkspaceId) => id === workspaceId ? { id } : undefined,
    list: () => membership ? [{ id: workspaceId, sessionIds: [session.id] }] : [] } as never)
  const save = vi.fn(async (input: SecuritySaveRequest) => {
    const parsed = securitySaveSchema.parse(input)
    if (records.revision !== parsed.expectedRevision) throw new Error('revision conflict')
    if (parsed.tasks.some(row => row.assetIds.some(id => !parsed.assets.some(asset => asset.id === id)))) throw new Error('unknown asset')
    records = { workspaceId, revision: records.revision + 1, companies: parsed.companies, assets: parsed.assets, tasks: parsed.tasks }
    return structuredClone(records)
  })
  ctx.provide('securityRecords', { read: () => structuredClone(records), save } as never)
  const start = vi.fn(async (_request: SecurityExecutionStartRequest) => ({ runs: [{ id: 'execution', status: 'running', snapshot: { limits: { ...executionLimits, maxRequests: 4 } } }], limits: executionLimits }))
  const cancel = vi.fn(async () => ({ runs: [], limits: {} }))
  const workerCancel = vi.fn(async () => ({ runs: [] }))
  const planStart = vi.fn(async (_request: SecurityPlanningStartRequest) => ({ plans: [{ id: 'plan', status: 'planning' }] }))
  const plannerCancel = vi.fn(async () => ({ plans: [] }))
  const send = vi.fn(async () => ({ runs: [{ id: 'worker', status: 'completed', conversationStatus: 'running' }] }))
  ctx.provide('securityExecution', { start, cancel, read: () => ({ runs: [{ id: 'saved-execution', status: 'cancelled', snapshot: { limits: { ...executionLimits, maxRequests: 4 } } }], limits: executionLimits }) } as never)
  ctx.provide('securityWorkers', { send, cancel: workerCancel, read: () => ({ runs: options.failures ? [{ id: 'worker', status: 'failed', error: 'Worker request failed', itemId: 'item' }] : [] }) } as never)
  ctx.provide('securityPlanning', { start: planStart, cancel: plannerCancel, read: () => ({ plans: options.failures ? [{ id: 'plan', status: 'failed', error: 'Planner output invalid', items: [] }] : [] }) } as never)
  ctx.provide('securityFindings', { read: async () => ({ findings: [], retests: [] }) } as never)
  ctx.provide('securitySetup', {} as never)
  ctx.provide('securityConversations', { catalog: async () => ({ mode: 'auto', selection: { engine: 'claude', model: 'default' },
    engines: [{ id: 'claude', name: 'Claude', models: [{ id: 'test-model', name: 'Test' }] }] }) } as never)
  if (options.loader) {
    await ctx.plugin(Loader)
    ctx.loader.builtins.securityControl = SecurityControlService
    await ctx.loader.create({ name: 'cordis:securityControl', config: { controlModelBytes: options.bytes ?? 65536 } })
    await ctx.loader.await()
  } else await ctx.plugin(SecurityControlService, { controlModelBytes: options.bytes ?? 65536 })
  return { ctx, agent, session, start, planStart, cancel, workerCancel, plannerCancel, send, save,
    records: () => records, removeMembership: () => { membership = false } }
}

describe('Common security owner operations', () => {
  it('lists registered assets and tasks without touching execution', async () => {
    const f = await fixture()
    const result = await f.ctx.securityControl.execute({ action: 'list', workspaceId })
    expect(JSON.parse(result.data)).toMatchObject({ revision: 1, assets: [{ id: 'asset' }], tasks: [{ id: 'task' }] })
    expect(f.start).not.toHaveBeenCalled()
  })
  it('creates one task on repeated request and keeps the existing aggregate', async () => {
    const f = await fixture()
    const command = { action: 'create' as const, workspaceId, requestId: 'create-once', expectedRevision: 1, name: 'New', assetIds: ['asset'] }
    const first = await f.ctx.securityControl.execute(command)
    const retry = await f.ctx.securityControl.execute(command)
    expect(first.taskId).toBe(retry.taskId)
    expect(f.records().tasks).toHaveLength(2)
    expect(f.save).toHaveBeenCalledTimes(1)
    expect(f.records().assets).toHaveLength(1)
    await expect(f.ctx.securityControl.execute({ ...command, name: 'Different' })).rejects.toThrow('different task')
  })
  it('reuses task validation and revision checks for updates', async () => {
    const f = await fixture()
    await f.ctx.securityControl.execute({ action: 'update', workspaceId, taskId: 'task', requestId: 'u1', expectedRevision: 1,
      patch: { objective: 'Changed objective' } })
    expect(f.records().tasks[0]!.objective).toBe('Changed objective')
    await expect(f.ctx.securityControl.execute({ action: 'update', workspaceId, taskId: 'task', requestId: 'u2', expectedRevision: 1,
      patch: { objective: 'Stale' } })).rejects.toThrow('revision conflict')
    await expect(f.ctx.securityControl.execute({ action: 'update', workspaceId, taskId: 'task', requestId: 'u3', expectedRevision: 2,
      patch: { constraints: [{ id: 'c', action: 'bad', text: 'No writes' }] } } as never)).rejects.toThrow()
    expect(f.records().tasks[0]!.objective).toBe('Changed objective')
  })
  it('rejects unknown task/workspace and unknown asset references', async () => {
    const f = await fixture()
    await expect(f.ctx.securityControl.execute({ action: 'read', workspaceId, taskId: 'other' })).rejects.toThrow('Task not found')
    await expect(f.ctx.securityControl.execute({ action: 'list', workspaceId: 'other' as WorkspaceId })).rejects.toThrow('registered Workspace owner')
    await expect(f.ctx.securityControl.execute({ action: 'create', workspaceId, requestId: 'bad-asset', expectedRevision: 1, name: 'New', assetIds: ['missing'] })).rejects.toThrow('unknown asset')
  })
  it('retains the non-owner Remote caller instead of escalating to the common owner', async () => {
    const f = await fixture()
    const signal = new AbortController().signal
    const invocation: RemoteInvocation = { request: { namespace: 'securityControl', method: 'execute', args: {} }, service: 'securityControl', signal,
      peer: { id: 'test-peer' as PeerId, ctx: f.ctx, principal: { kind: 'test-guest', guest: 'reader' }, interactions: 'none', signal, dispose: async () => {} },
      uplink: <In>(): AsyncIterable<In> => ({ [Symbol.asyncIterator]: () => ({ next: async () => ({ done: true, value: undefined }) }) }),
    }
    await expect(f.ctx.extend({ invocation }).securityControl.execute({ action: 'list', workspaceId })).rejects.toThrow('registered Workspace owner')
    expect(f.start).not.toHaveBeenCalled(); expect(f.save).not.toHaveBeenCalled()
  })
  it('delegates planning alone with revision and retry identity, preserving admission failures', async () => {
    const f = await fixture()
    const command = { action: 'plan' as const, workspaceId, taskId: 'task', requestId: 'plan-once', expectedRevision: 1,
      modelDecision: { engine: 'claude' as const, model: 'test-model', reason: 'Owner requested a plan' } }
    const result = await f.ctx.securityControl.execute(command)
    expect(f.planStart).toHaveBeenCalledWith({ workspaceId, taskId: 'task', requestId: 'plan-once', expectedRevision: 1,
      modelDecision: command.modelDecision })
    expect(JSON.parse(result.data)).toEqual({ plans: [{ id: 'plan', status: 'planning' }] })
    expect(f.start).not.toHaveBeenCalled()
    expect(f.send).not.toHaveBeenCalled()
    f.planStart.mockRejectedValueOnce(new Error('Task changed after the planning request'))
    await expect(f.ctx.securityControl.execute(command)).rejects.toThrow('Task changed')
  })
  it('delegates start/resume and all stopping to existing admissions', async () => {
    const f = await fixture()
    await f.ctx.securityControl.execute({ action: 'start', workspaceId, taskId: 'task', requestId: 'start', expectedRevision: 1 })
    expect(f.start).toHaveBeenLastCalledWith({ workspaceId, taskId: 'task', requestId: 'start', expectedRevision: 1 })
    const result = await f.ctx.securityControl.execute({ action: 'resume', workspaceId, taskId: 'task', requestId: 'limits', expectedRevision: 1, resumeRunId: 'stopped' })
    expect(JSON.parse(result.data)).toMatchObject({ runs: [{ limits: { ...executionLimits, maxRequests: 4 } }], limits: executionLimits })
    await f.ctx.securityControl.execute({ action: 'resume', workspaceId, taskId: 'task', requestId: 'resume', expectedRevision: 1, resumeRunId: 'stopped' })
    expect(f.start).toHaveBeenLastCalledWith({ workspaceId, taskId: 'task', requestId: 'resume', expectedRevision: 1, resumeRunId: 'stopped' })
    f.start.mockRejectedValueOnce(new Error('Complete task setup before execution'))
    await expect(f.ctx.securityControl.execute({ action: 'start', workspaceId, taskId: 'task', requestId: 'incomplete', expectedRevision: 1 })).rejects.toThrow('Complete task setup')
    await f.ctx.securityControl.execute({ action: 'stop', workspaceId, taskId: 'task' })
    expect(f.cancel).toHaveBeenCalledOnce(); expect(f.workerCancel).toHaveBeenCalledOnce(); expect(f.plannerCancel).toHaveBeenCalledOnce()
  })
  it('sends Worker messages through the existing durable delivery owner', async () => {
    const f = await fixture()
    await f.ctx.securityControl.execute({ action: 'message', workspaceId, taskId: 'task', requestId: 'message', runId: 'worker', text: 'Summarize evidence' })
    expect(f.send).toHaveBeenCalledWith({ workspaceId, taskId: 'task', requestId: 'message', runId: 'worker', text: 'Summarize evidence' })
  })
  it('returns explicit navigation without starting investigation', async () => {
    const f = await fixture()
    expect(await f.ctx.securityControl.execute({ action: 'open', workspaceId, taskId: 'task', view: 'findings' })).toMatchObject({ action: 'open', workspaceId, taskId: 'task', view: 'findings' })
    expect(f.start).not.toHaveBeenCalled()
  })
  it('includes saved Planner and Worker failures without starting another operation', async () => {
    const f = await fixture({ failures: true })
    const result = await f.ctx.securityControl.execute({ action: 'read', workspaceId, taskId: 'task' })
    expect(JSON.parse(result.data)).toMatchObject({
      planners: [{ id: 'plan', status: 'failed', error: 'Planner output invalid' }],
      workers: [{ id: 'worker', status: 'failed', error: 'Worker request failed' }],
    })
    expect(f.planStart).not.toHaveBeenCalled()
    expect(f.start).not.toHaveBeenCalled()
  })
  it('keeps complete JSON and discloses configured output truncation', async () => {
    const f = await fixture({ bytes: 1024 })
    f.records().tasks[0]!.description = '日本語'.repeat(1000)
    const result = await f.ctx.securityControl.execute({ action: 'read', workspaceId, taskId: 'task' })
    expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(1024)
    expect(JSON.parse(result.data)).toMatchObject({ truncated: true })
  })
  it('returns current role catalogs and validates saved model choices through the existing owner', async () => {
    const f = await fixture()
    const read = await f.ctx.securityControl.execute({ action: 'read', workspaceId, taskId: 'task' })
    expect(JSON.parse(read.data)).toMatchObject({ executionLimits, executions: [{ id: 'saved-execution', limits: { ...executionLimits, maxRequests: 4 } }], modelCatalog: { planner: { mode: 'auto' }, worker: { mode: 'auto' } } })
    await expect(f.ctx.securityControl.execute({ action: 'update', workspaceId, taskId: 'task', requestId: 'bad-model', expectedRevision: 1,
      patch: { agentModels: { worker: { engine: 'claude', model: 'missing' } } } })).rejects.toThrow()
    expect(f.save).not.toHaveBeenCalled()
    await f.ctx.securityControl.execute({ action: 'update', workspaceId, taskId: 'task', requestId: 'model', expectedRevision: 1,
      patch: { agentModels: { worker: { engine: 'claude', model: 'test-model' } } } })
    expect(f.records().tasks[0]).toMatchObject({ agentModels: { worker: { engine: 'claude', model: 'test-model' } },
      agentModelModes: { worker: 'fixed' } })
  })
  it('binds explicit setup answers to Host-owned fingerprints rather than model JSON strings', async () => {
    const f = await fixture()
    const result = await f.ctx.securityControl.execute({ action: 'update', workspaceId, taskId: 'task',
      requestId: 'setup', expectedRevision: 1,
      patch: { scopeRules: [{ id: 'scope', action: 'allow', kind: 'url', value: 'http://127.0.0.1:43188/', note: '' }],
        constraints: [{ id: 'constraint', action: 'allow', text: 'GET only' }],
        setup: { completionCondition: 'Summarize evidence', permission: { assetIds: [], confirmed: true },
          scope: { assetIds: [], rules: 'The selected local app only', confirmed: true },
          operations: { constraints: 'GET only', confirmed: true }, limits: 'Ten requests' } } })
    expect(JSON.parse(result.data)).toMatchObject({
      checklist: { goal: true, permission: true, scope: true, operations: true, limits: true } })
    expect(f.records().tasks[0]!.setup).toMatchObject({ permission: { assetIds: ['asset'], confirmed: true },
      scope: { assetIds: ['asset'], rules: JSON.stringify(f.records().tasks[0]!.scopeRules) },
      operations: { constraints: JSON.stringify(f.records().tasks[0]!.constraints) } })
  })
})

describe('Session-bound main-chat adapter', () => {
  it('binds workspace on the Host and rechecks membership for each call', async () => {
    const f = await fixture()
    const tool = securityChatTool(f.ctx, f.agent)
    expect(tool.inputSchema.type).toBe('object')
    const signal = new AbortController().signal
    expect(JSON.parse(await tool.execute({ command: { action: 'list' } }, signal))).toMatchObject({ workspaceId })
    await expect(tool.execute({ command: { action: 'list', workspaceId: 'other' } }, signal)).rejects.toThrow()
    f.removeMembership()
    await expect(tool.execute({ command: { action: 'list' } }, signal)).rejects.toThrow('exactly one')
  })
  it.each([{ member: false }, { header: { origin: 'subagent' as const } }, { header: { delegationDepth: 1 } }, { id: 'security-worker-internal' }])('rejects unowned or internal Sessions: %j', async (options) => {
    const f = await fixture(options)
    expect(() => securityChatWorkspace(f.ctx, f.agent)).toThrow()
  })
  it('rejects nonowner input and does not elevate it into trusted service calls', async () => {
    const f = await fixture()
    f.session.append('user/message', createUserMessage({ source: { kind: 'user', principal: { kind: 'test-guest', guest: 'reader' } }, content: [{ type: 'text', text: '調査開始して' }] }), { surfaceOp: 'append' })
    expect(() => securityChatTool(f.ctx, f.agent)).toThrow('current owner')
    expect(f.start).not.toHaveBeenCalled()
  })
  it('requires current explicit start and rejects capability questions', async () => {
    const f = await fixture()
    const tool = securityChatTool(f.ctx, f.agent)
    f.session.append('user/message', createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '調査を開始できますか？' }] }), { surfaceOp: 'append' })
    await expect(tool.execute({ command: { action: 'start', taskId: 'task', requestId: 's', expectedRevision: 1 } }, new AbortController().signal)).rejects.toThrow('explicit current')
    expect(f.start).not.toHaveBeenCalled()
  })
  it('routes a planning-only owner request through the native tool with a stable Session retry ID', async () => {
    const f = await fixture()
    f.session.append('user/message', createUserMessage({ source: { kind: 'user' },
      content: [{ type: 'text', text: 'プランナーに計画だけ依頼して。調査は開始しないで。' }] }), { surfaceOp: 'append' })
    const tool = securityChatTool(f.ctx, f.agent)
    const input = { command: { action: 'plan', taskId: 'task', requestId: 'plan-only', expectedRevision: 1 } }
    const signal = new AbortController().signal
    expect(JSON.parse(await tool.execute(input, signal))).toMatchObject({ action: 'plan', taskId: 'task' })
    await tool.execute(input, signal)
    expect(f.planStart.mock.calls[0]![0].requestId).toHaveLength(64)
    expect(f.planStart.mock.calls[1]![0].requestId).toBe(f.planStart.mock.calls[0]![0].requestId)
    expect(f.start).not.toHaveBeenCalled()
  })
  it('requires confirmation quotes from the current owner message', async () => {
    const f = await fixture()
    const tool = securityChatTool(f.ctx, f.agent)
    const command = { action: 'update', taskId: 'task', requestId: 'setup', expectedRevision: 1, patch: { setup: {
      completionCondition: 'Summary', permission: { confirmed: true, assetIds: ['asset'] }, scope: { confirmed: true, assetIds: ['asset'], rules: '[]' },
      operations: { confirmed: true, constraints: '[]' }, limits: 'Ten requests' } } }
    await expect(tool.execute({ command }, new AbortController().signal)).rejects.toThrow('exact quote')
    await expect(tool.execute({ command: { ...command, confirmationQuote: 'not in message' } }, new AbortController().signal)).rejects.toThrow('exact quote')
    await tool.execute({ command: { ...command, confirmationQuote: '操作制約と範囲を確認しました。' } }, new AbortController().signal)
    expect(f.records().tasks[0]!.setup?.permission.confirmed).toBe(true)
  })
  it('namespaces stable retry IDs per owning Session without exceeding domain limits', async () => {
    const f = await fixture()
    const tool = securityChatTool(f.ctx, f.agent)
    await tool.execute({ command: { action: 'start', taskId: 'task', expectedRevision: 1, requestId: 'x'.repeat(200) } }, new AbortController().signal)
    const sent = f.start.mock.calls[0]![0]
    expect(sent.requestId).toHaveLength(64)
    expect(f.start).toHaveBeenCalledOnce()
  })
  it('composes with upstream native tools through the waterfall', async () => {
    const f = await fixture()
    registerSecurityChatTools(f.ctx)
    const base = { name: 'base', description: '', inputSchema: {}, execute: async () => '' }
    const result = await f.ctx.waterfall('subscription-engines/host-tools', { agent: f.agent, model: 'test', turn: 1, step: 1, messages: [], signal: new AbortController().signal }, async () => [base])
    expect(result.map((tool: EngineHostTool) => tool.name)).toEqual(['base', 'security_control'])
    expect(JSON.parse(await result[1]!.execute({ command: { action: 'list' } }, new AbortController().signal))).toMatchObject({ workspaceId })
  })
  it('registers a Harness-compatible presentation of the same validated commands', async () => {
    const f = await fixture()
    let definition: ToolDefinition | undefined
    f.ctx.provide('tools', { register: (tool: ToolDefinition) => { definition = tool; return () => {} } } as never)
    registerSecurityChatTools(f.ctx)
    await vi.waitFor(() => { expect(definition).toBeDefined() })
    const tool = definition!
    expect(() => { assertSupportedJsonSchema(tool.parameters) }).not.toThrow()
    expect(validateJsonSchemaValue(tool.parameters, { command: { action: 'list' } })).toEqual([])
    expect(validateJsonSchemaValue(tool.parameters, { command: { action: 'read', taskId: 'task' } })).toEqual([])
    expect(validateJsonSchemaValue(tool.parameters, { command: { action: 'unknown' } }).length).toBeGreaterThan(0)
  })
  it('loads bundled workflows and the common owner through Loader outside the source project', async () => {
    const f = await fixture({ loader: true })
    await f.ctx.plugin(SystemPrompt)
    await f.ctx.plugin(ToolRuntime)
    f.ctx.loader.builtins.skills = SkillRegistry
    f.ctx.loader.builtins.securitySkills = { inject: ['skills'], apply: registerSecuritySkills }
    await f.ctx.loader.create({ name: 'cordis:skills' })
    await f.ctx.loader.create({ name: 'cordis:securitySkills' })
    await f.ctx.loader.await()
    const workflows = await f.ctx.skills.list({ cwd: '/tmp/unrelated-owner-project' })
    expect(workflows.map(skill => skill.name)).toContain('security-report')
    expect(workflows).toHaveLength(5)
    expect((await f.ctx.skills.get('security-report', { cwd: '/tmp/unrelated-owner-project' }))?.content).toContain('report')
    f.ctx.loader.builtins.securityChat = { inject: ['securityControl', 'sessions', 'workspaceRegistry', 'tools'], apply: registerSecurityChatTools }
    const id = await f.ctx.loader.create({ name: 'cordis:securityChat' })
    await f.ctx.loader.await()
    expect(f.ctx.tools.schemas().map(tool => tool.name)).toContain('security_control')
    const result = await f.ctx.tools.execute({ callId: ToolCallId('security-list'), name: 'security_control',
      arguments: { command: { action: 'list' } }, agent: f.agent, signal: new AbortController().signal })
    expect(result.isError).toBe(false)
    expect(result.content).toHaveLength(1)
    const content = result.content[0]
    expect(content?.type).toBe('text')
    if (content?.type === 'text') expect(content.text).toContain('workspace')
    const report = await f.ctx.tools.execute({ callId: ToolCallId('security-report'), name: 'security_control',
      arguments: { command: { action: 'open', taskId: 'task', view: 'report' } }, agent: f.agent, signal: new AbortController().signal })
    expect(report.isError).toBe(false)
    expect(report.content).toHaveLength(1)
    const reportText = report.content[0]
    expect(reportText?.type).toBe('text')
    if (reportText?.type === 'text') expect(reportText.text).toContain('\"view\":\"report\"')
    expect(f.start).not.toHaveBeenCalled()
    await f.ctx.loader.resolve(id).fiber?.dispose()
    f.ctx.loader.remove(id)
    await f.ctx.loader.await()
    expect(f.ctx.tools.schemas().map(tool => tool.name)).not.toContain('security_control')
  })
})
