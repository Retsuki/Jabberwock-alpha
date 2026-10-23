/** Subscription-backed main-chat engines for Jabberwock. @module @deepseek-ai/dsh-subscription-engines */
import { Context, Service, type Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import type { AgentExecutionEngine, EngineRunRequest, SubscriptionConnection, SubscriptionConnectResult, SubscriptionEngine } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-subprocess'
import { CodexConnection, runCodex } from './codex.ts'
import { claudeModels, claudeQuota, claudeStatus, runClaude } from './claude.ts'
import { SubscriptionQuota, parseCodexQuota, type QuotaResult } from './quota.ts'
export { SubscriptionQuota } from './quota.ts'
import { nativeHistorySharingProjection, object, subscriptionEnvironment } from './shared.ts'

/** Native CLI selection and bounded authentication operations. */
export interface Config {
  /** Executable overriding the bundled official Codex binary; omitted selects the bundled one. */
  codexCommand?: string
  /** Official Claude CLI executable used for status, login, model discovery and turns. */
  claudeCommand: string
  /** Deadline in milliseconds for one authentication status or Codex model query. */
  statusTimeoutMs: number
  /** Deadline in milliseconds for one interactive login operation. */
  loginTimeoutMs: number
  /** Bounded wait for the Claude SDK model catalog listed by main chat; on expiry the list falls back to `Claude default`. */
  modelListTimeoutMs: number
  /** Explicit profile-level text-history sharing choices; absent providers retain per-conversation confirmation. */
  historySharing?: {
    /** Claude/Anthropic text-history permission; ask preserves ordinary conversation-level confirmation. */
    claude?: Volatile<'ask' | 'allow'>
    /** Codex/OpenAI text-history permission; ask preserves ordinary conversation-level confirmation. */
    codex?: Volatile<'ask' | 'allow'>
  }
}

const Config = z.object({
  codexCommand: z.string(),
  claudeCommand: z.string().default('claude'),
  statusTimeoutMs: z.number().min(1000).default(15000),
  loginTimeoutMs: z.number().min(1000).default(300000),
  modelListTimeoutMs: z.number().min(1000).default(8000),
  historySharing: z.object({
    claude: z.union(['ask', 'allow']).default('ask').volatile(),
    codex: z.union(['ask', 'allow']).default('ask').volatile(),
  }),
})

const CLAUDE_DEFAULT_MODELS: readonly { id: string; name: string }[] = [{ id: 'default', name: 'Claude default' }]

function codexCommand(config: Config): readonly string[] {
  if (config.codexCommand !== undefined) return [config.codexCommand]
  const packagePath = createRequire(import.meta.url).resolve('@openai/codex/package.json')
  const platform = process.platform === 'darwin' ? 'apple-darwin' : process.platform === 'win32' ? 'pc-windows-msvc' : 'unknown-linux-musl'
  const architecture = process.arch === 'arm64' ? 'aarch64' : 'x86_64'
  const binary = resolve(dirname(packagePath), 'vendor', `${architecture}-${platform}`, 'bin', process.platform === 'win32' ? 'codex.exe' : 'codex')
  if (existsSync(binary)) return [binary]
  return [process.execPath, resolve(dirname(packagePath), 'bin/codex.js')]
}

/** Official native engines with one managed authentication lifecycle. */
export default class SubscriptionEngines extends Service {
  static inject = ['subprocess', 'sessionProjections', 'sessions']
  static Config = Config
  private readonly lifetime = new AbortController()
  private readonly engines: readonly AgentExecutionEngine[]
  private readonly internalEngines = new Map<string, AgentExecutionEngine>()
  private readonly loginOperations = new Map<SubscriptionEngine, Promise<SubscriptionConnectResult>>()
  private readonly background = new Set<Promise<void>>()
  private readonly codexArgv: readonly string[]
  private claudeModelCache: Promise<readonly { id: string; name: string }[]> | undefined
  private readonly quota: SubscriptionQuota

  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'agentEngines')
    ctx.effect(() => ctx.sessionProjections.register(nativeHistorySharingProjection), 'subscription-engines.history-sharing')
    this.codexArgv = codexCommand(config)
    this.quota = new SubscriptionQuota(ctx, (engine, signal) => this.accountQuota(engine, signal), config.statusTimeoutMs)
    this.engines = [
      { id: 'codex-subscription', name: 'Codex', inputModalities: ['text', 'image'], listModels: () => this.codexModels(), run: request => this.runCodexMain(request) },
      { id: 'claude-subscription', name: 'Claude', inputModalities: ['text', 'image'], listModels: () => this.claudeSubscriptionModels(), run: request => this.runClaudeMain(request) },
    ]
    ctx.effect(() => async () => {
      this.internalEngines.clear()
      this.lifetime.abort(new Error('Subscription engine service was unloaded'))
      await Promise.allSettled([...this.background])
    }, 'subscription-engines.lifecycle')
  }

  private historySharing(engine: SubscriptionEngine): 'ask' | 'allow' {
    return this.config.historySharing?.[engine]?.get() ?? 'ask'
  }

  private owned(request: EngineRunRequest): EngineRunRequest {
    return { ...request, signal: AbortSignal.any([request.signal, this.lifetime.signal]) }
  }

  private async accountQuota(engine: SubscriptionEngine, signal: AbortSignal): Promise<QuotaResult> {
    if (engine === 'claude') return claudeQuota(this.ctx, this.config.claudeCommand, this.config.statusTimeoutMs, signal)
    const connection = new CodexConnection(this.ctx, this.codexArgv, signal, process.cwd())
    try {
      await connection.initialize(signal)
      if ((await connection.account(signal)).status !== 'connected') return { status: 'unavailable', windows: [], reason: 'not-connected' }
      return parseCodexQuota(await connection.wire.request('account/rateLimits/read', {}, signal))
    } finally { await connection.close() }
  }

  private async *runCodexMain(request: EngineRunRequest): ReturnType<typeof runCodex> {
    const owned = this.owned(request)
    owned.signal.throwIfAborted()
    const tools = await this.ctx.waterfall('subscription-engines/host-tools', owned, () => Promise.resolve([]))
    owned.signal.throwIfAborted()
    yield* runCodex(this.ctx, this.codexArgv, owned, tools, this.historySharing('codex'))
  }

  private async *runClaudeMain(request: EngineRunRequest): ReturnType<typeof runClaude> {
    const owned = this.owned(request)
    owned.signal.throwIfAborted()
    const tools = await this.ctx.waterfall('subscription-engines/host-tools', owned, () => Promise.resolve([]))
    owned.signal.throwIfAborted()
    yield* runClaude(this.ctx, this.config.claudeCommand, this.config.statusTimeoutMs, owned, false, tools, this.historySharing('claude'))
  }

  private claudeConversationModels(): Promise<readonly { id: string; name: string }[]> {
    const operation = claudeModels(this.ctx, this.config.claudeCommand, this.config.statusTimeoutMs, this.lifetime.signal)
    const settled = operation.then(() => {}, () => {}).finally(() => { this.background.delete(settled) })
    this.background.add(settled)
    return operation
  }

  private claudeSubscriptionModels(): Promise<readonly { id: string; name: string }[]> {
    if (this.claudeModelCache) return this.claudeModelCache
    const { claudeCommand, modelListTimeoutMs } = this.config
    const discovery = claudeModels(this.ctx, claudeCommand, modelListTimeoutMs, this.lifetime.signal)
    const attempt = discovery.catch((error: unknown) => {
      if (this.claudeModelCache === attempt) this.claudeModelCache = undefined
      this.ctx.logger.warn(`Claude model catalog unavailable; listing Claude default only: ${error instanceof Error ? error.message : String(error)}`)
      return CLAUDE_DEFAULT_MODELS
    })
    this.claudeModelCache = attempt
    return attempt
  }

  private async codexModels(): Promise<readonly { id: string; name: string }[]> {
    const signal = AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(this.config.statusTimeoutMs)])
    const connection = new CodexConnection(this.ctx, this.codexArgv, signal, process.cwd())
    try {
      await connection.initialize(signal)
      const models = await connection.models(signal)
      return [{ id: 'default', name: 'Codex default' }, ...models.map(model => ({ id: model.id, name: model.name }))]
    } finally { await connection.close() }
  }

  /**
   * Register an internal engine without adding a model-catalog choice.
   * @param engine Lookup-only engine with an unused identity.
   * @returns Disposer owned by the registering plugin's effect.
   */
  register(engine: AgentExecutionEngine): () => void {
    if (this.lifetime.signal.aborted) throw new Error('Subscription engine service was unloaded')
    const id = engine.id
    if (this.get(id)) throw new Error(`Execution engine already registered: ${id}`)
    this.internalEngines.set(id, engine)
    let registered = true
    return () => {
      if (!registered) return
      registered = false
      if (this.internalEngines.get(id) === engine) this.internalEngines.delete(id)
    }
  }

  /** @param id Native engine identity. @returns Matching engine. */
  get(id: string): AgentExecutionEngine | undefined {
    const internal = this.internalEngines.get(id)
    if (internal) return internal
    if (id === 'claude-host-tools') return { id, name: 'Claude host tools', listModels: () => this.claudeConversationModels(), run: request => runClaude(this.ctx, this.config.claudeCommand, this.config.statusTimeoutMs, this.owned(request), 'host-tools', [], this.historySharing('claude')) }
    if (id === 'claude-conversation') return { id, name: 'Claude conversation', listModels: () => this.claudeConversationModels(), run: request => runClaude(this.ctx, this.config.claudeCommand, this.config.statusTimeoutMs, this.owned(request), true, [], this.historySharing('claude')) }
    return this.engines.find(engine => engine.id === id)
  }
  /** @returns Supported native engines. */
  list(): readonly AgentExecutionEngine[] { return this.engines }

  /** @returns Safe account status without native credentials. */
  async connections(): Promise<readonly SubscriptionConnection[]> {
    return Promise.all((['codex', 'claude'] as const).map(async (engine) => {
      try {
        if (engine === 'claude') {
          const status = await claudeStatus(this.ctx, this.config.claudeCommand, this.config.statusTimeoutMs)
          if (status.status !== 'connected') this.claudeModelCache = undefined
          return status
        }
        const signal = AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(this.config.statusTimeoutMs)])
        const connection = new CodexConnection(this.ctx, this.codexArgv, signal, process.cwd())
        try { await connection.initialize(signal); return await connection.account(signal) }
        finally { await connection.close() }
      } catch (_error: unknown) {
        this.ctx.logger.warn(`Subscription connection status failed (${engine})`)
        return { engine, name: engine === 'codex' ? 'Codex' : 'Claude', status: 'unavailable' as const, message: '公式CLIを起動できないか、認証状態を確認できませんでした。' }
      }
    }))
  }

  /** @param engine Subscription provider. @returns Official login instructions or authorization URL. */
  connect(engine: SubscriptionEngine): Promise<SubscriptionConnectResult> {
    this.quota.invalidate(engine)
    if (engine === 'claude') this.claudeModelCache = undefined
    const existing = this.loginOperations.get(engine)
    if (existing) return existing
    const operation = this.login(engine)
    this.loginOperations.set(engine, operation)
    void operation.catch(() => { this.loginOperations.delete(engine) })
    return operation
  }

  private async login(engine: SubscriptionEngine): Promise<SubscriptionConnectResult> {
    const signal = AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(this.config.loginTimeoutMs)])
    if (engine === 'codex') {
      const connection = new CodexConnection(this.ctx, this.codexArgv, signal, process.cwd())
      try {
        await connection.initialize(signal)
        const completion = Promise.withResolvers<void>()
        connection.wire.onNotification((method) => { if (method === 'account/login/completed') completion.resolve() })
        const onAbort = (): void => { completion.resolve() }
        signal.addEventListener('abort', onAbort, { once: true })
        void connection.child.done.then(() => { completion.resolve() }, () => { completion.resolve() })
        const response = object(await connection.wire.request('account/login/start', { type: 'chatgpt' }, signal))
        if (typeof response.authUrl !== 'string') throw new Error('Codex did not return an official login URL')
        const authorizationUrl = new URL(response.authUrl)
        if (authorizationUrl.protocol !== 'https:' || !['auth.openai.com', 'chatgpt.com'].includes(authorizationUrl.hostname) || authorizationUrl.username !== '' || authorizationUrl.password !== '' || authorizationUrl.port !== '') throw new Error('Codex did not return an official login URL')
        const cleanup = completion.promise.then(async () => {
          signal.removeEventListener('abort', onAbort)
          await connection.close()
        }).finally(() => { this.loginOperations.delete(engine); this.background.delete(cleanup) })
        this.background.add(cleanup)
        void cleanup.catch(() => {})
        return { url: response.authUrl, message: 'ブラウザで ChatGPT アカウントにログインしてください。' }
      } catch (error: unknown) { await connection.close(); throw error }
    }
    const child = this.ctx.subprocess.spawn({ argv: [this.config.claudeCommand, 'auth', 'login', '--claudeai'], cwd: process.cwd(), env: subscriptionEnvironment(), signal, graceMs: 3000, stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' } })
    child.stdout?.resume(); child.stderr?.resume()
    const cleanup = (async () => {
      try { await child.done }
      catch (_error: unknown) {
        // Authentication process failure is exposed by the next account-status refresh.
      } finally {
        child.terminate()
        await child.waitForExit()
      }
    })().finally(() => { this.loginOperations.delete(engine); this.background.delete(cleanup) })
    this.background.add(cleanup)
    void cleanup.catch(() => {})
    return { message: 'Claude の公式ログインを開始しました。開いたブラウザでサブスクリプションのアカウントにログインしてください。ブラウザが開かない場合はターミナルで claude auth login --claudeai を実行してください。' }
  }
}
