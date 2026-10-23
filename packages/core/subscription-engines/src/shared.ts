/** Native engine process and durable state helpers. @module @deepseek-ai/dsh-subscription-engines/shared */
import type { ImageMediaType } from '@deepseek-ai/dsh-attachment'
import type { Context } from '@deepseek-ai/cordis'
import { readNativeExecution, type EngineRunRequest, type SubscriptionEngine } from '@deepseek-ai/dsh-agent'
import { scrubbedParentEnv, type SubprocessHandle } from '@deepseek-ai/dsh-subprocess'
import type {} from '@deepseek-ai/dsh-user-questions'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import { z } from 'zod'

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Records the exact transcript text the user authorized sharing with a new native provider conversation. */
    'engine/bootstrap': { engine: SubscriptionEngine; owner: string; text: string }
  }
}

interface NativeHistorySharingState {
  owner: string
  providers: { codex?: boolean | undefined; claude?: boolean | undefined }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    /** Exact-Session and provider consent; inherited parent decisions never authorize a child. */
    nativeHistorySharing: NativeHistorySharingState
  }
}

const sharingDecision = z.object({
  owner: z.string(), decision: z.enum(['always', 'once', 'deny']),
}).strict()

/** Replay explicit history-sharing decisions without reading arbitrary Session history. */
export const nativeHistorySharingProjection = {
  key: 'nativeHistorySharing',
  stateVersion: 1,
  stateSchema: z.object({
    owner: z.string(), providers: z.object({ codex: z.boolean().optional(), claude: z.boolean().optional() }).strict(),
  }).strict(),
  init: header => ({ owner: header.id, providers: {} }),
  apply: (state, event) => {
    if (event.type !== 'engine/activity' || event.data.kind !== 'history-sharing') return state
    if (event.data.engine !== 'claude' && event.data.engine !== 'codex') return state
    let detail: unknown
    try { detail = JSON.parse(event.data.detail) }
    catch (_error: unknown) { return state } // Other or malformed activity does not grant consent.
    const parsed = sharingDecision.safeParse(detail)
    if (!parsed.success || parsed.data.owner !== state.owner) return state
    return { ...state, providers: { ...state.providers, [event.data.engine]: parsed.data.decision === 'always' } }
  },
} satisfies ProjectionDefinition<'nativeHistorySharing', NativeHistorySharingState>

/** Explicitly remove ambient API credentials and provider routing overrides.
 * @returns Environment overlay with tombstones for removed ambient values.
 */
export function subscriptionEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...scrubbedParentEnv() }
  for (const key of Object.keys(process.env)) {
    if (/^(OPENAI|ANTHROPIC|CLAUDE|CODEX|AWS_|GOOGLE_|AZURE_|VERTEX_)/i.test(key) && !['CODEX_HOME', 'CLAUDE_CONFIG_DIR'].includes(key)) env[key] = undefined
  }
  return env
}

/** @param value Parsed wire JSON. @returns Valid object. */
export function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Native engine returned invalid JSON')
  return value as Record<string, unknown>
}

/** @param value Native identifier. @returns Valid nonempty string. */
export function text(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error('Native engine returned an invalid identifier')
  return value
}

/**
 * @param ctx Host context.
 * @param request Owning turn.
 * @param engine Provider.
 * @returns Native session owned by this exact Harness session.
 */
export function nativeSession(ctx: Context, request: EngineRunRequest, engine: SubscriptionEngine): string | undefined {
  const binding = readNativeExecution(ctx, request.agent.session).sessions[engine]
  return binding?.owner === request.agent.session.id ? binding.nativeId : undefined
}

/** Current accepted input, retaining image order and verified bytes. */
export type NativePromptBlock = { type: 'text'; text: string } | { type: 'image'; mediaType: ImageMediaType; data: string }

/** Native prompt; text-only input retains its original wire representation. */
export type NativePrompt = string | NativePromptBlock[]

/** @param request Owning turn. @returns Text representation for the explicit history bootstrap record. */
export function promptText(request: EngineRunRequest): string {
  return request.messages.map(message => message.content.map((block) => {
    if (block.type === 'image') return '[Image attached to current user input]'
    if (block.type !== 'text') throw new Error('Subscription chat does not support file attachments; send an image or text instead')
    return block.text
  }).join('\n')).join('\n\n')
}

async function currentPrompt(ctx: Context, request: EngineRunRequest): Promise<NativePrompt> {
  request.signal.throwIfAborted()
  if (!request.messages.some(message => message.content.some(block => block.type === 'image'))) return promptText(request)
  const blocks: NativePromptBlock[] = []
  for (const [index, message] of request.messages.entries()) {
    if (index > 0) blocks.push({ type: 'text', text: '\n\n' })
    for (const block of message.content) {
      request.signal.throwIfAborted()
      if (block.type === 'text') blocks.push({ type: 'text', text: block.text })
      else if (block.type === 'image') {
        const attachments = ctx.get('attachments')
        if (attachments === undefined) throw new Error('Image attachment storage is not available; reconnect the application before sending')
        const image = await attachments.readImage(block.attachment, request.signal)
        request.signal.throwIfAborted()
        blocks.push({ type: 'image', mediaType: image.ref.mediaType, data: Buffer.from(image.data).toString('base64') })
      } else throw new Error('Subscription chat does not support file attachments; send an image or text instead')
    }
  }
  return blocks
}

/** @param prompt Accepted current input and authorized text history. @returns Claude SDK content blocks. */
export function claudePromptContent(prompt: NativePrompt): string | ({ type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: ImageMediaType; data: string } })[] {
  return typeof prompt === 'string' ? prompt : prompt.map(block => block.type === 'text' ? block : {
    type: 'image', source: { type: 'base64', media_type: block.mediaType, data: block.data },
  })
}

/** @param prompt Accepted current input and authorized text history. @returns Codex app-server user input. */
export function codexPromptInput(prompt: NativePrompt): ({ type: 'text'; text: string; text_elements: never[] } | { type: 'image'; url: string })[] {
  const blocks = typeof prompt === 'string' ? [{ type: 'text' as const, text: prompt }] : prompt
  return blocks.map(block => block.type === 'text' ? { ...block, text_elements: [] } : {
    type: 'image', url: `data:${block.mediaType};base64,${block.data}`,
  })
}

/** @param request Owning turn. @param engine Provider. @param kind Native activity type. @param detail Safe display detail. */
export function activity(request: EngineRunRequest, engine: SubscriptionEngine, kind: string, detail: string): void {
  request.agent.session.append('engine/activity', { engine, turn: request.turn, step: request.step, kind, detail })
}

/**
 * @param ctx Host service context.
 * @param request Owning turn.
 * @param title Approval question.
 * @param detail Requested operation.
 * @returns True only after explicit human approval.
 */
export async function approve(ctx: Context, request: EngineRunRequest, title: string, detail: string): Promise<boolean> {
  const questions = ctx.get('userQuestions')
  if (questions === undefined) return false
  const answer = await questions.ask({ agent: request.agent, signal: request.signal, questions: [{ id: 'native-approval', question: title, detail, options: [{ label: '許可する' }, { label: '拒否する' }] }] })
  return answer.answers.some(item => item.id === 'native-approval' && item.selected.includes('許可する'))
}

/** @param child Managed child. @returns Complete process-range teardown. */
export async function dispose(child: SubprocessHandle): Promise<void> {
  child.terminate()
  await child.waitForExit()
  await child.done
}

/**
 * @param ctx Host context.
 * @param command CLI executable.
 * @param argv Status arguments.
 * @param timeoutMs Status deadline.
 * @returns Captured stdout after successful CLI exit.
 */
export async function capture(ctx: Context, command: string, argv: string[], timeoutMs: number): Promise<string> {
  const child = ctx.subprocess.spawn({ argv: [command, ...argv], cwd: process.cwd(), stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' }, graceMs: 3000, env: subscriptionEnvironment(), signal: AbortSignal.timeout(timeoutMs) })
  let output = ''
  child.stdout?.setEncoding('utf8')
  child.stdout?.on('data', (chunk: string) => { output += chunk; if (output.length > 65536) child.terminate() })
  child.stderr?.resume()
  try {
    const outcome = await child.done
    if (outcome.exitCode !== 0 && output.trim().length === 0) throw new Error('Official CLI authentication status could not be read')
    return output
  } finally { await dispose(child) }
}

/** Ask before sharing an existing transcript with a newly selected provider.
 * @param ctx Host context.
 * @param request Owning turn.
 * @param engine Destination provider.
 * @param resuming Whether the provider already owns the native conversation.
 * @param historySharing Explicit profile policy for this destination; absent choices require confirmation.
 * @returns Current input, with explicitly authorized text history for a new conversation.
 */
export async function nativePrompt(
  ctx: Context,
  request: EngineRunRequest,
  engine: SubscriptionEngine,
  resuming: boolean,
  historySharing: 'ask' | 'allow' = 'ask',
): Promise<NativePrompt> {
  const current = await currentPrompt(ctx, request)
  if (resuming) return current
  const entered = new Set(request.messages.map(message => message.id))
  const messages = request.agent.session.deriveMessages()
  const hasHistory = messages.some(message => (message.role === 'user' || message.role === 'assistant') && !entered.has(message.id))
  if (!hasHistory) return current
  const destination = engine === 'codex' ? 'Codex / OpenAI' : 'Claude / Anthropic'
  const sharing = ctx.get('sessionProjections')?.stateOf(request.agent.session, 'nativeHistorySharing')
  if (sharing === undefined) throw new Error('Native history-sharing projection is not registered')
  if (historySharing === 'allow') {
    activity(request, engine, 'history-sharing-policy', JSON.stringify({ owner: request.agent.session.id, decision: 'allow', scope: 'profile' }))
  } else if (sharing.owner !== request.agent.session.id || sharing.providers[engine] !== true) {
    const questions = ctx.get('userQuestions')
    if (questions === undefined) throw new Error('Conversation history sharing was not approved; this turn was stopped')
    const answer = await questions.ask({
      agent: request.agent, signal: request.signal,
      questions: [{
        id: 'native-history-sharing', question: `${destination} にこの会話の履歴を共有しますか？`,
        detail: '対象は、この会話の過去のユーザー本文とアシスタント本文です。システム指示・ツールの結果・認証情報ファイルは取り込みません。本文に機密情報が含まれる場合は、その本文も送信対象になります。「この会話では常に許可する」は、この会話と送信先だけに適用されます。許可しない場合、この送信を停止します。',
        options: [{ label: '今回だけ許可する' }, { label: 'この会話では常に許可する' }, { label: '拒否する' }],
      }],
    })
    request.signal.throwIfAborted()
    const responses = answer.answers.filter(item => item.id === 'native-history-sharing')
    const response = responses.length === 1 ? responses[0] : undefined
    const choice = response?.selected.length === 1 && !response.custom?.trim() ? response.selected[0] : undefined
    const decision = choice === 'この会話では常に許可する' ? 'always' : choice === '今回だけ許可する' ? 'once' : 'deny'
    activity(request, engine, 'history-sharing', JSON.stringify({ owner: request.agent.session.id, decision }))
    if (decision === 'deny') throw new Error('Conversation history sharing was not approved; this turn was stopped')
  }
  request.signal.throwIfAborted()
  const history = messages.filter(message => (message.role === 'user' || message.role === 'assistant') && !entered.has(message.id))
    .map(message => ({ role: message.role, text: message.content.filter(block => block.type === 'text').map(block => block.text).join('\n') }))
    .filter(message => message.text.length > 0)
  const prefix = `Conversation history (quoted context):\n${JSON.stringify(history)}\n\nCurrent user input:\n`
  const bootstrap = prefix + promptText(request)
  request.agent.session.append('engine/bootstrap', { engine, owner: request.agent.session.id, text: bootstrap })
  return typeof current === 'string' ? bootstrap : [{ type: 'text', text: prefix }, ...current]
}
