/** Official Codex app-server subscription driver. @module @deepseek-ai/dsh-subscription-engines/codex */
import type { Context } from '@deepseek-ai/cordis'
import { readNativeExecution, nativePermissionFor, type EngineRunRequest, type EngineHostTool, type SubscriptionConnection } from '@deepseek-ai/dsh-agent'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { JsonRpcLineTransport } from '@deepseek-ai/dsh-sdk-protocol'
import type { SubprocessHandle } from '@deepseek-ai/dsh-subprocess'
import { CodexHostTools } from './codex-host-tools.ts'
import { recordUsage, tokenCount } from './usage.ts'
import { activity, approve, dispose, nativeSession, nativePrompt, codexPromptInput, object, subscriptionEnvironment, text } from './shared.ts'

/** A model advertised by the authenticated official Codex catalog. */
export interface CodexModel {
  id: string
  name: string
  isDefault: boolean
}

function turnFailure(turn: Record<string, unknown>): Error {
  const error = turn.error === null || typeof turn.error !== 'object' ? undefined : object(turn.error)
  let message: unknown = error?.message
  if (typeof message === 'string' && message.includes('{')) {
    try {
      const parsed = object(JSON.parse(message.slice(message.indexOf('{'))))
      message = typeof parsed.error === 'object' && parsed.error !== null ? object(parsed.error).message : undefined
    } catch (_parseError: unknown) {
      // An unparseable response body is not suitable for the product error surface.
      message = undefined
    }
  }
  const detail = typeof message === 'string' && message.length > 0
    ? message.replace(/Bearer\s+\S+|(?:sk-|sess-)[A-Z0-9_-]+/gi, '[redacted]').slice(0, 1000)
    : typeof error?.codexErrorInfo === 'string' ? error.codexErrorInfo : undefined
  return new Error(`Codex turn ended: ${String(turn.status)}${detail === undefined ? '' : `: ${detail}`}`)
}

function codexPermission(preset: string, cwd: string) {
  switch (preset) {
    case 'ask':
    case 'auto-review':
      return {
        sandbox: 'workspace-write', approvalPolicy: 'on-request', approvalsReviewer: preset === 'auto-review' ? 'auto_review' : 'user',
        sandboxPolicy: { type: 'workspaceWrite', writableRoots: [cwd], networkAccess: false, excludeTmpdirEnvVar: false, excludeSlashTmp: false },
      }
    case 'full-access':
      return { sandbox: 'danger-full-access', approvalPolicy: 'never', approvalsReviewer: 'user', sandboxPolicy: { type: 'dangerFullAccess' } }
    default:
      throw new Error(`Unsupported Codex permission preset: ${preset}`)
  }
}

/** One managed app-server connection. */
export class CodexConnection {
  readonly child: SubprocessHandle
  readonly wire: JsonRpcLineTransport
  constructor(ctx: Context, command: readonly string[], signal: AbortSignal, cwd: string) {
    this.child = ctx.subprocess.spawn({ argv: [...command, '-c', 'forced_login_method="chatgpt"', '-c', 'model_provider="openai"', '-c', 'model_providers={}', '-c', 'chatgpt_base_url="https://chatgpt.com/backend-api/codex"', 'app-server', '--listen', 'stdio://'], cwd, stdio: { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' }, graceMs: 3000, signal, env: subscriptionEnvironment() })
    this.wire = new JsonRpcLineTransport(this.child.stdout as NonNullable<SubprocessHandle['stdout']>,
      this.child.stdin as NonNullable<SubprocessHandle['stdin']>)
    this.child.stderr?.resume()
    this.child.stdin?.on('error', () => { this.wire.close() })
    void this.child.done.then(() => { this.wire.close() }, () => { this.wire.close() })
    this.wire.start()
  }
  /** @param signal Startup lifetime. @returns Completed initialization. */
  async initialize(signal: AbortSignal, experimentalApi = false): Promise<void> {
    await this.wire.request('initialize', { clientInfo: { name: 'jabberwock', title: 'Jabberwock', version: '0.2.1-alpha.5' }, capabilities: { experimentalApi } }, signal)
    this.wire.notify('initialized')
  }
  /** @param signal Authentication lifetime. @returns Safe account status. */
  async account(signal: AbortSignal): Promise<SubscriptionConnection> {
    const response = object(await this.wire.request('account/read', { refreshToken: true }, signal))
    const account = response.account === null ? undefined : object(response.account)
    return account?.type === 'chatgpt'
      ? { engine: 'codex', name: 'Codex', status: 'connected' }
      : { engine: 'codex', name: 'Codex', status: 'signed-out', message: 'ChatGPT サブスクリプションでログインしてください。APIキー認証は利用しません。' }
  }
  /** @param signal Catalog lookup lifetime. @returns Models available to the authenticated Codex account. */
  async models(signal: AbortSignal): Promise<readonly CodexModel[]> {
    const models: CodexModel[] = []
    let cursor: string | undefined
    do {
      const response = object(await this.wire.request('model/list', { ...cursor === undefined ? {} : { cursor } }, signal))
      if (!Array.isArray(response.data)) throw new Error('Codex returned an invalid model catalog')
      for (const value of response.data) {
        const model = object(value)
        models.push({ id: text(model.model ?? model.id), name: text(model.displayName), isDefault: model.isDefault === true })
      }
      cursor = response.nextCursor === null || response.nextCursor === undefined ? undefined : text(response.nextCursor)
    } while (cursor !== undefined)
    return models
  }
  /** @returns Complete process teardown. */
  async close(): Promise<void> { this.wire.close(); await dispose(this.child) }
}

/**
 * @param ctx Host context.
 * @param command Official CLI command.
 * @param request Accepted turn.
 * @param nativeHostTools Live provider-bound main-chat capabilities.
 * @param historySharing Explicit profile text-history policy for the selected provider.
 * @returns Native assistant stream.
 */
export async function* runCodex(
  ctx: Context, command: readonly string[], request: EngineRunRequest, nativeHostTools: readonly EngineHostTool[] = [], historySharing: 'ask' | 'allow' = 'ask',
): AsyncGenerator<StreamChunk> {
  const cwd = request.agent.session.header.cwd
  if (cwd === undefined) throw new Error('Select a project directory before using Codex')
  if (request.hostTools !== undefined) throw new Error('Codex main-chat Host tools require provider-bound capabilities')
  const toolLifetime = new AbortController()
  const hostTools = new CodexHostTools(ctx, { ...request, signal: AbortSignal.any([request.signal, toolLifetime.signal]) }, nativeHostTools)
  const permissionPreset = nativePermissionFor(ctx, request.agent.session, 'codex')
  const permission = codexPermission(permissionPreset, cwd)
  const connection = new CodexConnection(ctx, command, request.signal, cwd)
  const queue: StreamChunk[] = []
  let wake = Promise.withResolvers<void>()
  const completion: { finished: boolean; failure?: Error } = { finished: false }
  let threadId: string | undefined
  let turnId: string | undefined
  let answer = ''
  let selectedModel: string | undefined
  const emit = (chunk: StreamChunk): void => { queue.push(chunk); wake.resolve() }
  const fail = (error: unknown): void => { completion.failure = error instanceof Error ? error : new Error('Codex connection failed'); completion.finished = true; wake.resolve() }
  const onAbort = (): void => {
    if (threadId && turnId) void connection.wire.request('turn/interrupt', { threadId, turnId }).catch(() => {})
    fail(request.signal.reason)
  }
  request.signal.addEventListener('abort', onAbort, { once: true })
  void connection.child.done.then(() => { if (!completion.finished) fail(new Error('Codex exited before turn completion')) }, fail)
  connection.wire.onRequest(async (method, params) => {
    if (threadId !== undefined && params.threadId !== undefined && params.threadId !== threadId) throw new Error('Codex approval referenced another conversation')
    if (method === 'item/tool/call') {
      if (completion.finished) throw new Error('Codex Host tool arrived after turn completion')
      return hostTools.execute(params, threadId, turnId)
    }
    if (method === 'item/commandExecution/requestApproval' || method === 'item/fileChange/requestApproval') {
      const detail = typeof params.command === 'string' ? params.command : typeof params.reason === 'string' ? params.reason : method
      activity(request, 'codex', 'approval', detail)
      return { decision: await approve(ctx, request, 'Codex の操作を許可しますか？', detail) ? 'accept' : 'decline' }
    }
    if (method === 'item/permissions/requestApproval') return { permissions: {}, scope: 'turn' }
    if (method === 'item/tool/requestUserInput') {
      const service = ctx.get('userQuestions')
      if (!service || !Array.isArray(params.questions)) return { answers: {} }
      const questions = params.questions.map((value) => {
        const item = object(value)
        const options = Array.isArray(item.options)
          ? item.options.map(optionValue => ({ label: text(object(optionValue).label) }))
          : []
        return { id: text(item.id), question: text(item.question), options }
      })
      const response = await service.ask({ agent: request.agent, signal: request.signal, questions })
      return {
        answers: Object.fromEntries(response.answers.map(item => [
          item.id, { answers: [...item.selected, ...item.custom ? [item.custom] : []] },
        ])),
      }
    }
    if (method === 'mcpServer/elicitation/request') return { action: 'decline', content: null, _meta: null }
    throw new Error('Unsupported Codex approval request; operation denied')
  })
  connection.wire.onNotification((method, params) => {
    try {
      if (threadId !== undefined && params.threadId !== undefined && params.threadId !== threadId) return
      if (method === 'turn/started') {
        turnId = text(object(params.turn).id)
        return
      }
      if (method === 'thread/tokenUsage/updated') {
        try {
          const usage = object(params.tokenUsage)
          const total = object(usage.total)
          const last = object(usage.last)
          const cachedInputTokens = tokenCount(total.cachedInputTokens)
          const inputTokens = tokenCount(total.inputTokens)
          if (cachedInputTokens > inputTokens) throw new Error('Cached input exceeds native input counter')
          recordUsage(ctx, request, {
            engine: 'codex', ...selectedModel === undefined ? {} : { model: selectedModel }, updatedAt: Date.now(),
            context: {
              usedTokens: tokenCount(last.totalTokens),
              ...usage.modelContextWindow === null || usage.modelContextWindow === undefined
                ? {} : { maxTokens: tokenCount(usage.modelContextWindow) },
            },
            tokens: {
              inputTokens: inputTokens - cachedInputTokens,
              outputTokens: tokenCount(total.outputTokens), cacheReadTokens: cachedInputTokens,
            },
          })
        } catch (_error: unknown) {
          // Optional wire metrics cannot fail the assistant stream.
          ctx.logger.warn('Codex usage counters were unavailable')
        }
        return
      }
      if (method === 'item/agentMessage/delta') { const delta = text(params.delta); answer += delta; emit({ type: 'text-delta', index: 0, text: delta }) }
      if (method === 'item/started' || method === 'item/completed') {
        const item = object(params.item)
        if (item.type !== 'agentMessage') activity(request, 'codex', method, String(item.type))
        if (method === 'item/completed' && item.type === 'agentMessage' && answer.length === 0 && typeof item.text === 'string') { answer += item.text; emit({ type: 'text-delta', index: 0, text: item.text }) }
      }
      if (method === 'turn/completed') {
        const turn = object(params.turn)
        if (turnId !== undefined && turn.id !== turnId) return
        if (turn.status !== 'completed') completion.failure = turnFailure(turn)
        completion.finished = true; wake.resolve()
        toolLifetime.abort(new Error('Codex turn completed'))
      }
    } catch (error: unknown) { fail(error) }
  })
  try {
    request.signal.throwIfAborted()
    await connection.initialize(request.signal, hostTools.catalog.length > 0)
    if ((await connection.account(request.signal)).status !== 'connected') throw new Error('Codex requires ChatGPT subscription login; API-key fallback is disabled')
    const catalog = await connection.models(request.signal)
    const selected = request.model === 'default' ? catalog.find(model => model.isDefault) : catalog.find(model => model.id === request.model)
    if (selected === undefined) throw new Error(request.model === 'default' ? 'Codex did not advertise a default subscription model' : `Codex model is not available to this subscription: ${request.model}`)
    selectedModel = selected.id
    activity(request, 'codex', 'model', selected.id)
    activity(request, 'codex', 'permission', permissionPreset)
    const boundId = nativeSession(ctx, request, 'codex')
    const previousCatalog = readNativeExecution(ctx, request.agent.session).codexToolCatalog
    const toolCatalog = JSON.stringify(hostTools.catalog)
    const nativeId = hostTools.canResume(boundId, previousCatalog) ? boundId : undefined
    const prompt = await nativePrompt(ctx, request, 'codex', nativeId !== undefined, historySharing)
    const response = object(await connection.wire.request(nativeId ? 'thread/resume' : 'thread/start', { ...nativeId ? { threadId: nativeId } : { ephemeral: false }, ...nativeId === undefined && hostTools.catalog.length > 0 ? { dynamicTools: hostTools.catalog } : {}, cwd, modelProvider: 'openai', approvalPolicy: permission.approvalPolicy, approvalsReviewer: permission.approvalsReviewer, sandbox: permission.sandbox, model: selected.id }, request.signal))
    threadId = text(object(response.thread).id)
    activity(request, 'codex', 'host-tool-catalog', JSON.stringify({ nativeId: threadId, catalog: toolCatalog }))
    await ctx.sessions.flush(request.agent.session)
    yield { type: 'block-start', index: 0, blockType: 'text' }
    const started = object(await connection.wire.request('turn/start', { threadId, model: selected.id, approvalPolicy: permission.approvalPolicy, approvalsReviewer: permission.approvalsReviewer, sandboxPolicy: permission.sandboxPolicy, input: codexPromptInput(prompt) }, request.signal))
    turnId = text(object(started.turn).id)
    if (!nativeId) request.agent.session.append('engine/session', { engine: 'codex', owner: request.agent.session.id, nativeId: threadId })
    while (!completion.finished || queue.length > 0) {
      for (let chunk = queue.shift(); chunk !== undefined; chunk = queue.shift()) yield chunk
      if (completion.finished) break
      await wake.promise; wake = Promise.withResolvers<void>()
    }
    if (completion.failure) throw completion.failure
    yield { type: 'block-end', index: 0, block: { type: 'text', text: answer } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  } finally {
    toolLifetime.abort(new Error('Codex turn was closed'))
    request.signal.removeEventListener('abort', onAbort)
    await connection.close()
  }
}
