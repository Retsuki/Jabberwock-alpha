/** Official Claude Agent SDK subscription driver. @module @deepseek-ai/dsh-subscription-engines/claude */
import type { Context } from '@deepseek-ai/cordis'
import { query, createSdkMcpServer, tool, type Query, type Options } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { nativePermissionFor, readNativeExecution, type EngineRunRequest, type EngineHostTool, type SubscriptionConnection, type EngineUsageSnapshot } from '@deepseek-ai/dsh-agent'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import type { SubprocessHandle } from '@deepseek-ai/dsh-subprocess'
import { recordUsage, tokenCount } from './usage.ts'
import { parseClaudeQuota, type QuotaResult } from './quota.ts'
import { ManagedClaudeCodeProcess, claudeSpawnSpec } from './process.ts'
import { activity, approve, capture, dispose, nativeSession, nativePrompt, claudePromptContent, object, subscriptionEnvironment } from './shared.ts'

/**
 * @param ctx Host context.
 * @param command Official native CLI.
 * @param timeoutMs Status deadline.
 * @returns Subscription-only authentication facts.
 */
export async function claudeStatus(ctx: Context, command: string, timeoutMs: number): Promise<SubscriptionConnection> {
  const response = object(JSON.parse(await capture(ctx, command, ['auth', 'status', '--json'], timeoutMs)))
  return response.loggedIn === true && response.authMethod === 'claude.ai' && response.apiProvider === 'firstParty'
    ? { engine: 'claude', name: 'Claude', status: 'connected' }
    : { engine: 'claude', name: 'Claude', status: 'signed-out', message: 'Claude サブスクリプションでログインしてください。APIキー認証は利用しません。' }
}

/**
 * Read authenticated SDK model choices without submitting a user prompt.
 * @param ctx Host process owner.
 * @param command Official Claude CLI executable.
 * @param timeoutMs Authentication and catalog operation deadline.
 * @param signal Service lifetime cancellation.
 * @returns Provider default and the native SDK model catalog.
 */
export async function claudeModels(
  ctx: Context, command: string, timeoutMs: number, signal: AbortSignal,
): Promise<readonly { id: string; name: string }[]> {
  if ((await claudeStatus(ctx, command, timeoutMs)).status !== 'connected') {
    throw new Error('Claude subscription login is required; API-key fallback is disabled')
  }
  return claudeControl(ctx, command, timeoutMs, signal, async (run) => {
    const models = await run.supportedModels()
    return [
      { id: 'default', name: 'Claude default' },
      ...models.filter(model => model.value !== 'default').map(model => ({ id: model.value, name: model.displayName })),
    ]
  })
}

/** Read subscription limits without submitting any user message or scanning local transcripts.
 * @param ctx Host process owner. @param command Official Claude CLI. @param timeoutMs Read deadline.
 * @param signal Service lifetime. @returns Safe quota counters, or an explicit unavailable result.
 */
export async function claudeQuota(ctx: Context, command: string, timeoutMs: number, signal: AbortSignal): Promise<QuotaResult> {
  signal.throwIfAborted()
  if ((await claudeStatus(ctx, command, timeoutMs)).status !== 'connected') return { status: 'unavailable', windows: [], reason: 'not-connected' }
  return claudeControl(ctx, command, timeoutMs, signal, async (run) => {
    return parseClaudeQuota(await run.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true }))
  })
}

async function claudeControl<T>(
  ctx: Context, command: string, timeoutMs: number, signal: AbortSignal, read: (run: Query) => Promise<T>,
): Promise<T> {
  const abort = new AbortController()
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
  const onAbort = (): void => { abort.abort(deadline.reason) }
  deadline.addEventListener('abort', onAbort, { once: true })
  if (deadline.aborted) onAbort()
  const processes: SubprocessHandle[] = []
  let run: Query | undefined
  try {
    deadline.throwIfAborted()
    run = query({
      prompt: (async function* () {
        await new Promise<void>((resolve) => {
          if (abort.signal.aborted) resolve()
          else abort.signal.addEventListener('abort', () => { resolve() }, { once: true })
        })
      })(),
      options: {
        cwd: process.cwd(), pathToClaudeCodeExecutable: command, abortController: abort,
        tools: [], agents: {}, skills: [], plugins: [], mcpServers: {}, strictMcpConfig: true,
        settingSources: [], settings: { forceLoginMethod: 'claudeai', apiKeyHelper: '' },
        env: subscriptionEnvironment(), persistSession: false,
        spawnClaudeCodeProcess: (options) => {
          const child = ctx.subprocess.spawn(claudeSpawnSpec(options, 3000))
          processes.push(child)
          return new ManagedClaudeCodeProcess(child)
        },
      },
    })
    const result = await abortable(read(run), deadline)
    deadline.throwIfAborted()
    return result
  } finally {
    deadline.removeEventListener('abort', onAbort)
    abort.abort()
    try { run?.close() } finally { await Promise.all(processes.map(dispose)) }
  }
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => {
      signal.removeEventListener('abort', abort)
      reject(signal.reason instanceof Error ? signal.reason : new Error('Account control query cancelled'))
    }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    void operation.then(
      (value) => { signal.removeEventListener('abort', abort); resolve(value) },
      (error: unknown) => {
        signal.removeEventListener('abort', abort)
        reject(error instanceof Error ? error : new Error('Account control query failed'))
      },
    )
  })
}

function claudePermission(preset: string): NonNullable<Options['permissionMode']> {
  switch (preset) {
    case 'default':
    case 'acceptEdits':
    case 'plan':
    case 'bypassPermissions':
      return preset
    default:
      throw new Error(`Unsupported Claude permission preset: ${preset}`)
  }
}

/**
 * @param ctx Host context.
 * @param command Official CLI.
 * @param timeoutMs Status deadline.
 * @param request Accepted turn.
 * @param conversationOnly True disables tools; host-tools exposes only explicit capabilities; false preserves native permissions.
 * @param nativeHostTools Explicit provider capabilities added alongside ordinary native tools; isolated routes reject these.
 * @param historySharing Explicit profile text-history policy for the selected provider.
 * @returns Native assistant stream.
 */
export async function* runClaude(
  ctx: Context, command: string, timeoutMs: number, request: EngineRunRequest, conversationOnly: boolean | 'host-tools' = false,
  nativeHostTools: readonly EngineHostTool[] = [], historySharing: 'ask' | 'allow' = 'ask',
): AsyncGenerator<StreamChunk> {
  const cwd = request.agent.session.header.cwd
  if (!cwd) throw new Error('Select a project directory before using Claude')
  if (conversationOnly !== false && nativeHostTools.length > 0) throw new Error('Main-chat host tools cannot be added to isolated execution routes')
  const hostTools = conversationOnly === 'host-tools' ? request.hostTools : nativeHostTools.length > 0 ? nativeHostTools : undefined
  if (conversationOnly === 'host-tools' && !hostTools?.length) throw new Error('Host-tools execution requires explicit tools')
  if (conversationOnly !== 'host-tools' && request.hostTools !== undefined) throw new Error('Host tools require the dedicated execution route')
  if (request.responseSchema !== undefined && conversationOnly !== true) throw new Error('Structured output requires the conversation-only route')
  const outputValidator = request.responseSchema === undefined ? undefined : z.fromJSONSchema(request.responseSchema)
  const structuredTool = (name: string): boolean => outputValidator !== undefined && name === 'StructuredOutput'
  const names = new Set<string>()
  const hostCatalog: { name: string; description: string; inputSchema: Record<string, unknown> }[] = []
  let toolSequence = 0
  const definitions = hostTools?.map((definition) => {
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(definition.name) || names.has(`mcp__host__${definition.name}`)) throw new Error('Invalid or duplicate host tool name')
    names.add(`mcp__host__${definition.name}`)
    const schema = z.fromJSONSchema(definition.inputSchema)
    if (!(schema instanceof z.ZodObject)) throw new Error('Host tool input schema must be an object')
    hostCatalog.push({ name: `mcp__host__${definition.name}`, description: definition.description, inputSchema: z.toJSONSchema(schema) })
    return tool(definition.name, definition.description, schema.shape, async (input) => {
      request.signal.throwIfAborted()
      const callId = `${request.turn}:${request.step}:${++toolSequence}`
      activity(request, 'claude', 'host-tool-call', JSON.stringify({ callId, name: definition.name, input }))
      await ctx.sessions.flush(request.agent.session)
      try {
        const result = await definition.execute(schema.parse(input), request.signal)
        request.signal.throwIfAborted()
        activity(request, 'claude', 'host-tool-result', JSON.stringify({ callId, name: definition.name, result }))
        await ctx.sessions.flush(request.agent.session)
        return { content: [{ type: 'text' as const, text: result }] }
      } catch (error: unknown) {
        activity(request, 'claude', 'host-tool-result', JSON.stringify({ callId, name: definition.name, error: error instanceof Error ? error.message : String(error) }))
        await ctx.sessions.flush(request.agent.session)
        throw error
      }
    })
  })
  const permissionPreset = conversationOnly ? 'default' : nativePermissionFor(ctx, request.agent.session, 'claude')
  const permissionMode = claudePermission(permissionPreset)
  if ((await claudeStatus(ctx, command, timeoutMs)).status !== 'connected') throw new Error('Claude subscription login is required; API-key fallback is disabled')
  const processes: SubprocessHandle[] = []
  const abort = new AbortController()
  const onAbort = (): void => { abort.abort(request.signal.reason) }
  request.signal.addEventListener('abort', onAbort, { once: true })
  if (request.signal.aborted) onAbort()
  let run: Query | undefined
  let closeInput: (() => void) | undefined
  try {
    const nativeId = nativeSession(ctx, request, 'claude')
    const baseTokens = nativeId === undefined ? undefined : readNativeExecution(ctx, request.agent.session).claudeTokens
    let latestTokens = baseTokens
    const prompt = await nativePrompt(ctx, request, 'claude', nativeId !== undefined, historySharing)
    request.signal.throwIfAborted()
    if (definitions) {
      activity(request, 'claude', 'host-tool-catalog', JSON.stringify(hostCatalog))
      await ctx.sessions.flush(request.agent.session)
    }
    activity(request, 'claude', 'permission', permissionPreset)
    const inputDone = new Promise<void>((resolve) => { closeInput = resolve })
    const sdkPrompt = (async function* () {
      yield { type: 'user' as const, message: { role: 'user' as const, content: claudePromptContent(prompt) }, parent_tool_use_id: null, session_id: nativeId ?? '' }
      await inputDone
    })()
    run = query({ prompt: sdkPrompt, options: {
      cwd, pathToClaudeCodeExecutable: command, abortController: abort,
      permissionMode, allowDangerouslySkipPermissions: permissionMode === 'bypassPermissions', persistSession: true, includePartialMessages: true,
      settingSources: [], settings: { forceLoginMethod: 'claudeai', apiKeyHelper: '' },
      env: subscriptionEnvironment(),
      ...request.responseSchema === undefined ? {} : { outputFormat: { type: 'json_schema', schema: request.responseSchema } },
      ...conversationOnly ? {
        tools: [], agents: {}, skills: [], plugins: [], mcpServers: definitions ? { host: createSdkMcpServer({ name: 'host', tools: definitions }) } : {}, strictMcpConfig: true,
        hooks: { PreToolUse: [{ hooks: [input => Promise.resolve({ hookSpecificOutput: { hookEventName: 'PreToolUse' as const, permissionDecision: input.hook_event_name === 'PreToolUse' && (names.has(input.tool_name) || structuredTool(input.tool_name) && outputValidator?.safeParse(input.tool_input).success) ? 'allow' as const : 'deny' as const, permissionDecisionReason: 'Only explicit host tools or schema-validated structured output are available' } })] }] },
      } : definitions ? { mcpServers: { host: createSdkMcpServer({ name: 'host', tools: definitions }) } } : {},
      ...nativeId === undefined ? {} : { resume: nativeId },
      ...request.model === 'default' ? {} : { model: request.model },
      canUseTool: async (name, input) => {
        if (outputValidator !== undefined && structuredTool(name)) return outputValidator.safeParse(input).success
          ? { behavior: 'allow', updatedInput: input }
          : { behavior: 'deny', message: 'Structured output did not match the requested schema' }
        if (names.has(name)) return { behavior: 'allow', updatedInput: input }
        if (conversationOnly) return { behavior: 'deny', message: 'This session supports conversation only' }
        const detail = JSON.stringify(input)
        activity(request, 'claude', 'approval', name)
        return await approve(ctx, request, `Claude: ${name} を許可しますか？`, detail)
          ? { behavior: 'allow', updatedInput: input }
          : { behavior: 'deny', message: 'The user did not approve this operation' }
      },
      spawnClaudeCodeProcess: (options) => {
        const child = ctx.subprocess.spawn(claudeSpawnSpec(options, 3000))
        processes.push(child)
        return new ManagedClaudeCodeProcess(child)
      },
    } })
    let answer = ''
    let success = false
    let recordedSession = nativeId
    let nativeModel: string | undefined
    let contextUsage: EngineUsageSnapshot['context']
    yield { type: 'block-start', index: 0, blockType: 'text' }
    for await (const message of run) {
      if (recordedSession === undefined && 'session_id' in message && typeof message.session_id === 'string') {
        recordedSession = message.session_id
        request.agent.session.append('engine/session', { engine: 'claude', owner: request.agent.session.id, nativeId: recordedSession })
      }
      if (message.type === 'system' && message.subtype === 'init') {
        if (!['none', 'oauth'].includes(message.apiKeySource)) throw new Error('Claude selected API credentials; subscription execution stopped')
        nativeModel = message.model
        if (conversationOnly) {
          activity(request, 'claude', 'conversation-tools', String(message.tools.length))
          if (message.tools.some(name => !names.has(name) && !structuredTool(name))) throw new Error('Isolated engine advertised unexpected tools; execution stopped')
        }
      }
      if (message.type === 'stream_event' && message.parent_tool_use_id === null) {
        const event = message.event
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          if (!definitions && conversationOnly !== true) {
            answer += event.delta.text
            yield { type: 'text-delta', index: 0, text: event.delta.text }
          }
        }
      }
      if (message.type === 'assistant') {
        if (definitions) {
          const publicBlocks = message.message.content.filter(block => block.type === 'text' || block.type === 'tool_use')
          activity(request, 'claude', 'host-assistant', JSON.stringify(publicBlocks))
          await ctx.sessions.flush(request.agent.session)
        }
        if (message.context_usage !== undefined) {
          try {
            const usage = message.context_usage
            nativeModel = usage.model
            contextUsage = {
              usedTokens: tokenCount(usage.total_tokens), maxTokens: tokenCount(usage.raw_max_tokens), estimated: true,
              categories: usage.categories.map(category => ({
                name: category.name, tokens: tokenCount(category.tokens), kind: category.kind,
              })),
            }
            recordUsage(ctx, request, { engine: 'claude', model: nativeModel, updatedAt: Date.now(), context: contextUsage, ...latestTokens === undefined ? {} : { tokens: latestTokens } })
          } catch (_error: unknown) { ctx.logger.warn('Claude context counters were unavailable') }
        }
        for (const block of message.message.content) if (block.type === 'tool_use') activity(request, 'claude', 'tool', block.name)
      }
      if (message.type === 'result') {
        if (message.subtype !== 'success' || message.is_error) throw new Error(`Claude turn failed: ${message.subtype}`)
        if (definitions || conversationOnly === true) {
          if (outputValidator !== undefined) {
            if (message.structured_output === undefined) throw new Error('Claude structured output is missing')
            answer = JSON.stringify(outputValidator.parse(message.structured_output))
          } else {
            if (!message.result.trim()) throw new Error('Claude isolated execution returned no final report')
            answer = message.result
          }
          yield { type: 'text-delta', index: 0, text: answer }
        } else if (answer.length === 0 && message.result.length > 0) {
          answer = message.result
          yield { type: 'text-delta', index: 0, text: answer }
        }
        try {
          let timeout: ReturnType<typeof setTimeout> | undefined
          try {
            const usage = await Promise.race([
              run.getContextUsage({ detail: 'summary' }),
              new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => { reject(new Error('Claude context summary timed out')) }, timeoutMs) }),
            ])
            nativeModel = usage.model
            const categoryKinds = new Map((contextUsage?.categories ?? []).map(category => [category.name, category.kind]))
            contextUsage = {
              usedTokens: tokenCount(usage.totalTokens), maxTokens: tokenCount(usage.rawMaxTokens), estimated: true,
              categories: usage.categories.map((category) => {
                // The control response omits kind; retain the automatic snapshot's explicit classification.
                const kind = category.isDeferred ? 'deferred' : categoryKinds.get(category.name)
                return { name: category.name, tokens: tokenCount(category.tokens), ...kind === undefined ? {} : { kind } }
              }),
            }
          } catch (_error: unknown) {
            // Preserve any automatic context snapshot when the optional summary is unavailable.
            ctx.logger.warn('Claude context summary was unavailable')
          } finally { if (timeout !== undefined) clearTimeout(timeout) }
          const models = Object.values(message.modelUsage)
          const queryTokens = models.length > 0 ? models.reduce((sum, usage) => ({
            inputTokens: sum.inputTokens + tokenCount(usage.inputTokens),
            outputTokens: sum.outputTokens + tokenCount(usage.outputTokens),
            cacheReadTokens: sum.cacheReadTokens + tokenCount(usage.cacheReadInputTokens),
            cacheWriteTokens: sum.cacheWriteTokens + tokenCount(usage.cacheCreationInputTokens),
          }), { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }) : {
            inputTokens: tokenCount(message.usage.input_tokens), outputTokens: tokenCount(message.usage.output_tokens),
            cacheReadTokens: tokenCount(message.usage.cache_read_input_tokens),
            cacheWriteTokens: tokenCount(message.usage.cache_creation_input_tokens),
          }
          latestTokens = {
            inputTokens: tokenCount(baseTokens?.inputTokens ?? 0) + queryTokens.inputTokens,
            outputTokens: tokenCount(baseTokens?.outputTokens ?? 0) + queryTokens.outputTokens,
            cacheReadTokens: tokenCount(baseTokens?.cacheReadTokens ?? 0) + queryTokens.cacheReadTokens,
            cacheWriteTokens: tokenCount(baseTokens?.cacheWriteTokens ?? 0) + queryTokens.cacheWriteTokens,
          }
          recordUsage(ctx, request, { engine: 'claude', ...nativeModel === undefined ? {} : { model: nativeModel }, updatedAt: Date.now(), ...contextUsage === undefined ? {} : { context: contextUsage }, tokens: latestTokens })
        } catch (_error: unknown) {
          // Result metrics are auxiliary; malformed counters cannot fail a successful native result.
          ctx.logger.warn('Claude result token counters were unavailable')
        }
        success = true
        closeInput?.()
      }
    }
    request.signal.throwIfAborted()
    if (!success) throw new Error('Claude ended without a successful result')
    yield { type: 'block-end', index: 0, block: { type: 'text', text: answer } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  } finally {
    closeInput?.()
    request.signal.removeEventListener('abort', onAbort)
    try { run?.close() } finally { await Promise.all(processes.map(dispose)) }
  }
}
