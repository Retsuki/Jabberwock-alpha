/** Task-owned conversation service; native tools are disabled by the dedicated engine route. */
import { deepSeekConversationEngine, type SecurityDeepSeekProvider } from './security-deepseek.ts'
import type { EngineRunRequest } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-user-questions'
import type { Message } from '@deepseek-ai/dsh-llm'
import { securityConversationEngines } from './conversation-types.ts'
import { Service, type Context } from '@deepseek-ai/cordis'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { Remote, RemoteError, TypertRemoteService, principalOf } from '@deepseek-ai/dsh-typert-protocol'
import { defineDomain, domainTable, type KvTable } from '@deepseek-ai/dsh-storage-domain'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { AgentHandle } from '@deepseek-ai/dsh-agent'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { SessionRequestId } from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from './index.ts'
import type { SecurityTask } from './security-records.ts'

import type { SecurityConversationRequest, SecurityConversationSendRequest, SecurityConversationValue, SecurityConversationSelection, SecurityConversationCatalog, SecurityConversationSelectRequest, SecurityConversationCatalogRequest, SecurityAgentRole, SecurityModelDecision } from './conversation-types.ts'

interface Mapping {
  workspaceId: WorkspaceId
  taskId: string
  sessionId: SessionId
  engine?: SecurityConversationSelection['engine'] | undefined
  model?: string | undefined
  historySharing?: Partial<Record<SecurityDeepSeekProvider, boolean | undefined>> | undefined
}
const mappingSchema: z.ZodType<Mapping> = z.object({
  workspaceId: z.string().min(1).transform(value => value as WorkspaceId),
  taskId: z.string().min(1), sessionId: z.string().min(1).transform(SessionId),
  engine: z.enum(securityConversationEngines).optional(), model: z.string().trim().min(1).max(200).optional(),
  historySharing: z.object({ 'deepseek-account': z.boolean().optional(), 'deepseek-official': z.boolean().optional() }).strict().optional(),
}).strict()
const spec = defineDomain({ name: 'jabberwock_security_conversations', version: 1, tables: { tasks: domainTable<string, Mapping>(mappingSchema) } })
const providers = { claude: 'claude-conversation', codex: 'codex-conversation', 'deepseek-account': 'security-deepseek-account', 'deepseek-official': 'security-deepseek-official' } as const
/** Resolve the isolated engine route for a persisted provider choice.
 * @param engine Saved provider.
 * @returns Conversation-only execution route.
 */
export function securityConversationProvider(engine: SecurityConversationSelection['engine']): string { return providers[engine] }

/** Resolve legacy task mappings without modifying their durable contents.
 * @param selection Optional saved choice.
 * @returns Complete task-local selection.
 */
export function resolveConversationSelection(selection: { engine?: SecurityConversationSelection['engine'] | undefined; model?: string | undefined }): SecurityConversationSelection {
  return { engine: selection.engine ?? 'claude', model: selection.model ?? 'default' }
}

/** Resolve task role overrides while retaining legacy Main Agent mappings.
 * @param task Saved task.
 * @param role Requested role.
 * @param legacy Existing Main Agent selection.
 * @returns Complete selection without substituting unavailable models.
 */
export function resolveTaskAgentSelection(task: Pick<SecurityTask, 'agentModels'>, role: SecurityAgentRole, legacy: { engine?: SecurityConversationSelection['engine'] | undefined; model?: string | undefined } = {}): SecurityConversationSelection {
  return task.agentModels?.[role] ?? resolveConversationSelection(role === 'main' ? legacy : {})
}

/** Resolve legacy explicit models as fixed and legacy provider defaults as automatic.
 * @param task Saved task.
 * @param role Delegated role.
 * @returns Effective selection mode.
 */
export function resolveTaskAgentMode(task: Pick<SecurityTask, 'agentModels' | 'agentModelModes'>, role: 'planner' | 'worker'): 'auto' | 'fixed' {
  return task.agentModelModes?.[role] ?? (task.agentModels?.[role]?.model && task.agentModels[role].model !== 'default' ? 'fixed' : 'auto')
}
/** Model-originated choices must identify one actual catalog model and a concise reason. */
export const modelDecisionSchema = z.object({
  engine: z.enum(securityConversationEngines), model: z.string().trim().min(1).max(200), reason: z.string().trim().min(1).max(2000),
}).strict()
/** Resolve a delegated invocation without substituting provider defaults for missing decisions.
 * @param task Saved task.
 * @param role Delegated role.
 * @param catalog Current supported choices.
 * @param decision Agent-selected explicit model.
 * @returns Validated invocation choice and explanation.
 */
export function resolveTaskModelDecision(task: SecurityTask, role: 'planner' | 'worker', catalog: SecurityConversationCatalog, decision?: SecurityModelDecision): SecurityModelDecision {
  if (resolveTaskAgentMode(task, role) === 'fixed') {
    const selection = resolveTaskAgentSelection(task, role)
    validateConversationSelection(catalog, selection)
    return { ...selection, reason: 'Task owner fixed this role model.' }
  }
  if (!decision) throw new Error(`Automatic ${role} model selection is missing; request a new plan with an explicit available model choice`)
  const choice = modelDecisionSchema.parse(decision)
  if (choice.model === 'default') throw new Error('Automatic model selection must name an explicit available model')
  validateConversationSelection(catalog, choice)
  return choice
}

/** Reject choices outside the current tool-free provider catalog.
 * @param catalog Current safe choices.
 * @param selection Requested engine and model.
 */
export function validateConversationSelection(catalog: SecurityConversationCatalog, selection: SecurityConversationSelection): void {
  const engine = catalog.engines.find(engine => engine.id === selection.engine)
  if (engine === undefined || !engine.models.some(model => model.id === selection.model)) throw new Error('Select an available conversation-only engine and model')
}
const keyOf = (request: SecurityConversationRequest): string => JSON.stringify([request.workspaceId, request.taskId])
const workspaceResource = (request: SecurityConversationRequest): WorkspaceId => request.workspaceId

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Owner-only task conversations, isolated from ordinary chat execution. */
    securityConversations: SecurityConversationsService
  }
}

/** Own task-to-Session mapping and Agent lifetime; Session projection owns transcript reads. */
export class SecurityConversationsService extends TypertRemoteService {
  static inject = ['securityRecords', 'storageDomain', 'workspaceRegistry', 'agents', 'sessions', 'sessionPersistence', 'agentEngines']
  private table?: KvTable<string, Mapping>
  private readonly mapped = new Map<SessionId, Mapping>()
  private readonly handles = new Map<SessionId, AgentHandle>()
  private readonly opening = new Map<string, Promise<SecurityConversationValue>>()
  private readonly sending = new Set<string>()
  private readonly selecting = new Set<string>()
  private readonly selections = new Set<Promise<SecurityConversationValue>>()
  private catalogLoading?: Promise<SecurityConversationCatalog['engines']> | undefined
  private stopping = false
  private readonly lifetime = new AbortController()

  /** @param ctx Host services owning task records, Agents and durable Sessions. */
  constructor(ctx: Context) { super(ctx, 'securityConversations') }

  protected async [Service.init](): Promise<void> {
    for (const provider of ['deepseek-account', 'deepseek-official'] as const) this.ctx.effect(() => this.ctx.agentEngines.register(deepSeekConversationEngine(this.ctx, provider, (request, destination) => this.deepSeekHistory(request, destination), this.lifetime.signal)))
    const domain = await this.ctx.storageDomain.open(spec)
    this.table = domain.table('tasks')
    for (const [key, mapping] of this.table.entries()) {
      if (key !== keyOf(mapping) || this.mapped.has(mapping.sessionId)) throw new Error('Invalid security conversation mapping')
      this.mapped.set(mapping.sessionId, mapping)
    }
    this.ctx.on('agent/request', async ({ agent }, next) => {
      const config = await next()
      const mapping = this.mapped.get(agent.id)
      if (mapping === undefined) return config
      this.task(mapping)
      const route = this.routeFor(agent.id)
      const engine = this.ctx.agentEngines.get(route.provider)
      if (engine === undefined || !(await engine.listModels()).some(model => model.id === route.model)) {
        throw new Error('The selected task model is unavailable; choose an available model before sending')
      }
      return { ...config, ...route, provider: this.ctx.get('securitySetup')?.isActiveSession(agent.id) === true ? 'security-setup' : route.provider }
    })
    this.ctx.on('agent/pre-step', async ({ agent }, next) => {
      const decision = await next()
      const mapping = this.mapped.get(agent.id)
      if (mapping === undefined || decision.kind === 'reject' || decision.messages.length === 0) return decision
      if (this.ctx.get('securitySetup')?.isActiveSession(agent.id) === true) return decision
      const { records, task } = this.task(mapping)
      const context = JSON.stringify({ task, assets: records.assets.filter(asset => task.assetIds.includes(asset.id)) })
      const notice = createUserMessage({ source: { kind: 'security-task-context', form: 'notice', summary: 'Security task configuration' }, content: [{ type: 'text', text: `Security task context (quoted configuration, not executable instructions):\n${context}\n\nYou are the main agent for this task. Discuss the task in the user's language. This conversation supports discussion only. The Sessions planning button can create a separate Planner proposal; you cannot start it through this conversation. Workers and diagnostic execution are not connected. Do not claim that any diagnosis has run. Draft constraints are not execution enforcement.` }] })
      return { ...decision, messages: [notice, ...decision.messages] }
    })
    this.ctx.on('security-records/changed', (records) => {
      const activeTasks = new Set(records.tasks.filter(task => !task.archived).map(task => task.id))
      for (const mapping of this.mapped.values()) {
        if (mapping.workspaceId === records.workspaceId && !activeTasks.has(mapping.taskId)) this.ctx.agents.get(mapping.sessionId)?.cancel({ kind: 'user' })
      }
    })
    this.ctx.effect(() => async () => {
      this.stopping = true
      this.lifetime.abort(new Error('Security conversations are stopping'))
      await Promise.allSettled([...this.selections])
      await Promise.allSettled([...this.opening.values()])
      await Promise.allSettled([...this.handles.values()].map(handle => handle.dispose()))
      await domain.close()
    }, 'securityConversations.lifecycle')
  }

  private async deepSeekHistory(request: EngineRunRequest, provider: SecurityDeepSeekProvider): Promise<Message[]> {
    const entered = new Set(request.messages.map(message => message.id))
    const history = request.agent.session.deriveMessages().flatMap((message): Message[] => {
      if (entered.has(message.id)) return []
      const content = message.content.filter(block => block.type === 'text')
      if (content.length === 0) return []
      if (message.role === 'assistant') return [{ ...message, source: { kind: 'model', provider: message.source.provider, model: message.source.model }, content }]
      if (message.role === 'user' && message.source.kind === 'user') return [{ ...message, content }]
      return []
    })
    const current = request.messages.map(message => ({ ...message, content: message.content.filter(block => block.type === 'text') }))
    if (history.length === 0) return current
    const mapping = this.mapped.get(request.agent.id)
    if (!mapping) throw new Error('Historical DeepSeek requests require an owned task conversation')
    if (mapping.historySharing?.[provider] !== true) {
      const questions = this.ctx.get('userQuestions')
      if (!questions) throw new Error('Conversation history sharing was not approved; this turn was stopped')
      const answer = await questions.ask({ agent: request.agent, signal: request.signal, questions: [{
        id: 'native-history-sharing', question: `${provider === 'deepseek-account' ? 'DeepSeek Account' : 'DeepSeek API'} にこの会話の履歴を共有しますか？`,
        detail: '過去のユーザー本文とアシスタント本文を共有します。システム指示・ツールの結果は共有しません。常に許可は、この会話と送信先だけに適用されます。',
        options: [{ label: '今回だけ許可する' }, { label: 'この会話では常に許可する' }, { label: '拒否する' }],
      }] })
      request.signal.throwIfAborted()
      const responses = answer.answers.filter(item => item.id === 'native-history-sharing')
      const response = responses.length === 1 ? responses[0] : undefined
      const choice = response?.selected.length === 1 && !response.custom?.trim() ? response.selected[0] : undefined
      if (choice !== '今回だけ許可する' && choice !== 'この会話では常に許可する') throw new Error('Conversation history sharing was not approved; this turn was stopped')
      if (choice === 'この会話では常に許可する') {
        const updated = { ...mapping, historySharing: { ...mapping.historySharing, [provider]: true } }
        await this.requireTable().put(keyOf(mapping), updated)
        this.mapped.set(mapping.sessionId, updated)
      }
    }
    request.signal.throwIfAborted()
    return [...history, ...current]
  }

  /** Open the task's sole conversation, restoring the same persisted Session after restart.
   * @param request Task and Workspace identity.
   * @returns Identity for the existing Session projection/follow renderer.
   */
  @Remote({ resources: { workspace: workspaceResource } })
  open(request: SecurityConversationRequest): Promise<SecurityConversationValue> {
    this.authorize(request)
    const key = keyOf(request)
    const current = this.opening.get(key)
    if (current !== undefined) return current
    const operation = this.openTask(request)
    this.opening.set(key, operation)
    void operation.finally(() => { if (this.opening.get(key) === operation) this.opening.delete(key) }).catch(() => {})
    return operation
  }

  /** Read provider-owned model choices for this task without starting inference.
   * @param request Task and Workspace identity.
   * @returns Current selection and safe engine catalogs.
   */
  @Remote({ resources: { workspace: workspaceResource } })
  async catalog(request: SecurityConversationCatalogRequest): Promise<SecurityConversationCatalog> {
    this.authorize(request)
    if (!this.catalogLoading) {
      const loading = this.loadCatalog()
      this.catalogLoading = loading
      void loading.finally(() => { if (this.catalogLoading === loading) this.catalogLoading = undefined }).catch(() => {})
    }
    const engines = await this.catalogLoading
    this.authorize(request)
    const task = this.task(request).task
    const role = request.role ?? 'main'
    return { selection: resolveTaskAgentSelection(task, role, this.requireTable().get(keyOf(request)) ?? {}), ...(role === 'main' ? {} : { mode: resolveTaskAgentMode(task, role) }), engines }
  }

  private async loadCatalog(): Promise<SecurityConversationCatalog['engines']> {
    const engines: SecurityConversationCatalog['engines'] = []
    for (const id of securityConversationEngines) {
      const engine = this.ctx.agentEngines.get(providers[id])
      if (engine !== undefined) engines.push({ id, name: id === 'claude' ? 'Claude' : id === 'codex' ? 'Codex' : id === 'deepseek-account' ? 'DeepSeek Account' : 'DeepSeek API', models: [...await engine.listModels()] })
    }
    return engines
  }

  /** Save role selections for the next invocation; Main Agent changes require its Session to be idle.
   * @param request Task identity and catalog choice.
   * @returns The unchanged Session with the saved selection.
   */
  @Remote({ resources: { workspace: workspaceResource } })
  select(request: SecurityConversationSelectRequest): Promise<SecurityConversationValue> {
    this.authorize(request)
    const key = keyOf(request)
    if (this.sending.has(key) || this.selecting.has(key)) throw new Error('Wait for the current task conversation operation')
    this.selecting.add(key)
    const operation = this.selectTask(request)
    this.selections.add(operation)
    void operation.finally(() => { this.selecting.delete(key); this.selections.delete(operation) }).catch(() => {})
    return operation
  }

  private async selectTask(request: SecurityConversationSelectRequest): Promise<SecurityConversationValue> {
    const catalog = await this.catalog(request)
    const role = request.role ?? 'main'
    if (role === 'main' && request.mode === 'auto') throw new Error('Main Agent requires a fixed model selection')
    if (request.mode !== 'auto') validateConversationSelection(catalog, request)
    const value = await this.open(request)
    this.authorize(request)
    const agent = this.ctx.agents.get(value.sessionId)
    if ((request.role ?? 'main') === 'main' && (agent === undefined || agent.status !== 'idle' || agent.inbox.nextTurn.length > 0 || agent.inbox.nextStep.length > 0)) {
      throw new Error('Stop or finish the current response before changing the task model')
    }
    const { records, task } = this.task(request)
    const updated: SecurityTask = { ...task,
      ...(request.mode === 'auto' ? {} : { agentModels: { ...task.agentModels, [role]: { engine: request.engine, model: request.model } } }),
      ...(role === 'main' ? {} : { agentModelModes: { ...task.agentModelModes, [role]: request.mode ?? 'fixed' } }),
      updatedAt: Date.now(),
    }
    await this.ctx.securityRecords.save({ workspaceId: request.workspaceId, expectedRevision: records.revision,
      companies: records.companies, assets: records.assets, tasks: records.tasks.map(item => item.id === task.id ? updated : item),
    })
    return { sessionId: value.sessionId, engine: request.engine, model: request.model }
  }

  /** Resolve the tool-free native route used by this task, including its model.
   * @param sessionId Owned task Session.
   * @returns Selected native route for the next request.
   */
  routeFor(sessionId: SessionId): { provider: string; model: string } {
    const mapping = this.mapped.get(sessionId)
    if (mapping === undefined) throw new Error('Session is not a task conversation')
    const selection = resolveTaskAgentSelection(this.task(mapping).task, 'main', mapping)
    return { provider: providers[selection.engine], model: selection.model }
  }

  /** Reject setup followup admission while the task selection is being saved.
   * @param request Task identity.
   */
  assertSelectionSettled(request: SecurityConversationRequest): void {
    if (this.selecting.has(keyOf(request))) throw new Error('Wait for the task model selection to finish')
  }

  /** Submit one owner message; acknowledge only after the accepted inbox is durable.
   * @param request Task identity, text and stable retry identity.
   * @returns The Session identity and durable admission acknowledgement.
   */
  @Remote({ resources: { workspace: workspaceResource } })
  async send(request: SecurityConversationSendRequest): Promise<{ sessionId: SessionId; accepted: true }> {
    this.authorize(request)
    if (!request.text.trim() || request.text.length > 100000 || !request.requestId.trim() || request.requestId.length > 200) throw new Error('Invalid security conversation message')
    const key = keyOf(request)
    if (this.sending.has(key) || this.selecting.has(key)) throw new Error('A security conversation message is already being submitted')
    this.sending.add(key)
    try {
      const value = await this.open(request)
      this.authorize(request)
      const agent = this.ctx.agents.get(value.sessionId)
      if (agent === undefined) throw new Error('Security conversation Agent is not available')
      const duplicate = agent.session.deriveMessages().some(message => message.source.kind === 'user' && 'rpcId' in message.source && message.source.rpcId === request.requestId)
        || [...agent.inbox.nextTurn, ...agent.inbox.nextStep].some(message => 'rpcId' in message.source && message.source.rpcId === request.requestId)
      if (duplicate) return { sessionId: value.sessionId, accepted: true }
      if (agent.status !== 'idle') throw new Error('Wait for the current security conversation response or stop it first')
      const principal = principalOf(this.ctx.invocation)
      const message = createUserMessage({ source: { kind: 'user', rpcId: request.requestId as SessionRequestId, ...principal === undefined ? {} : { principal } }, content: [{ type: 'text', text: request.text.trim() }] })
      agent.followup(message)
      await this.ctx.sessionPersistence.flush()
      return { sessionId: value.sessionId, accepted: true }
    } finally { this.sending.delete(key) }
  }

  /** Stop only this task's current conversation and await durable turn settlement.
   * @param request Task and Workspace identity.
   * @returns After cancellation and persistence have settled.
   */
  @Remote({ resources: { workspace: workspaceResource } })
  async cancel(request: SecurityConversationRequest): Promise<void> {
    if (principalOf(this.ctx.invocation) !== undefined || this.ctx.workspaceRegistry.get(request.workspaceId) === undefined) throw new RemoteError('security/rejected', 'Security conversations require the Workspace owner', { workspaceId: request.workspaceId })
    const mapping = this.requireTable().get(keyOf(request))
    if (mapping === undefined) return
    const agent = this.ctx.agents.get(mapping.sessionId)
    if (agent === undefined) return
    agent.cancel({ kind: 'user' })
    await agent.whenIdle()
    await this.ctx.sessionPersistence.flush()
  }

  private async openTask(request: SecurityConversationRequest): Promise<SecurityConversationValue> {
    this.authorize(request)
    const key = keyOf(request)
    let mapping = this.requireTable().get(key)
    const selection = resolveTaskAgentSelection(this.task(request).task, 'main', mapping ?? {})
    const route = { provider: providers[selection.engine], model: selection.model }
    if (this.ctx.agentEngines.get(route.provider) === undefined) throw new Error('The selected conversation-only engine is unavailable')
    if (mapping === undefined) {
      mapping = { workspaceId: request.workspaceId, taskId: request.taskId, sessionId: SessionId(`security-${randomUUID()}`) }
      this.mapped.set(mapping.sessionId, mapping)
      try {
        const workspace = this.ctx.workspaceRegistry.get(request.workspaceId)
        if (workspace === undefined) throw new Error('Workspace is not registered')
        const handle = await this.ctx.agents.create({ sessionId: mapping.sessionId, meta: { cwd: workspace.path }, agentOptions: route })
        this.handles.set(mapping.sessionId, handle)
        await this.ctx.sessionPersistence.flush()
        await this.requireTable().put(key, mapping)
      } catch (error) {
        this.mapped.delete(mapping.sessionId)
        const handle = this.handles.get(mapping.sessionId)
        this.handles.delete(mapping.sessionId)
        await handle?.dispose()
        throw error
      }
    } else if (this.ctx.agents.get(mapping.sessionId) === undefined) {
      const handle = await this.ctx.agents.resume({ resumeSessionId: mapping.sessionId, agentOptions: route })
      this.handles.set(mapping.sessionId, handle)
    }
    return { sessionId: mapping.sessionId, ...resolveTaskAgentSelection(this.task(request).task, 'main', mapping) }
  }

  private authorize(request: SecurityConversationRequest): void {
    if (this.stopping) throw new Error('Task conversations are stopping')
    if (principalOf(this.ctx.invocation) !== undefined) throw new RemoteError('security/rejected', 'Security conversations require the owner', { workspaceId: request.workspaceId })
    this.task(request)
  }

  private task(request: SecurityConversationRequest) {
    const records = this.ctx.securityRecords.read({ workspaceId: request.workspaceId })
    const task = records.tasks.find(item => item.id === request.taskId)
    if (task === undefined || task.archived) throw new RemoteError('security/rejected', 'Security task is missing or archived', { workspaceId: request.workspaceId })
    return { records, task }
  }

  private requireTable(): KvTable<string, Mapping> {
    if (this.table === undefined) throw new Error('Security conversation storage is not available')
    return this.table
  }
}
