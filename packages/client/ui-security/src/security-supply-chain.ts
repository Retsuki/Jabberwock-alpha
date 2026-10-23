/** Workspace-owned fixed checks; ordinary Session notices own the durable report. */
import { randomUUID } from 'node:crypto'
import { Service, type Context } from '@deepseek-ai/cordis'
import { Remote, RemoteError, TypertRemoteService, principalOf } from '@deepseek-ai/dsh-typert-protocol'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionId, SessionEvent } from '@deepseek-ai/dsh-session'
import type { JobId, JobOutcome } from '@deepseek-ai/dsh-jobs'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { z } from 'zod'
import { readRepairInput, repairDefinitions, RepairRefusal } from './supply-chain-repair.ts'
import { readSupplyChainLock, scanSupplyChain, supplyChainMarkdown } from './supply-chain-scanner.ts'
import type { SupplyChainRun, SupplyChainStartRequest, SupplyChainReadRequest, SupplyChainReadResult, SupplyChainCancelRequest, SupplyChainListRequest, SupplyChainListResult, SupplyChainRepairRequest, SupplyChainRepair, SupplyChainRemoveRequest, SupplyChainRemoveResult } from './supply-chain-types.ts'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-workspace'
import type {} from '@deepseek-ai/dsh-agent'

declare module '@deepseek-ai/dsh-jobs' {
  interface JobKindMap {
    /** Fixed dependency metadata check, with no model invocation. */
    'security-supply-chain': 'security-supply-chain'
  }
}

const identity = z.string().min(1).max(200)
const requestSchema = z.object({ workspaceId: identity, requestId: identity }).strict()
const readSchema = z.object({ workspaceId: identity, runId: identity.optional() }).strict()
const findingSchema = z.object({
  package: z.string().max(300), version: z.string().max(300), title: z.string().max(2000),
  description: z.string().max(10000).optional(),
  severity: z.enum(['critical', 'high', 'moderate', 'low', 'info', 'unknown']),
  vulnerableRange: z.string().max(4000), advisoryUrl: z.string().max(2048), ghsaId: z.string().max(100).optional(),
  cveIds: z.array(z.string().max(100)).max(100), cweIds: z.array(z.string().max(100)).max(100),
  fixStatus: z.enum(['available', 'unavailable', 'unknown']), fixedVersion: z.string().max(300).optional(),
  relationship: z.enum(['direct', 'transitive', 'shared', 'unknown']),
  environment: z.enum(['production', 'development', 'shared', 'unknown']),
  publishedAt: z.string().max(100).optional(), updatedAt: z.string().max(100).optional(),
  cvssScore: z.number().min(0).max(10).optional(), cvssVector: z.string().max(1000).optional(),
})
const repairSchema = z.object({
  requestId: identity, status: z.enum(['running', 'completed', 'incomplete', 'failed', 'cancelled', 'stale', 'unsupported', 'interrupted']),
  phase: z.enum(['preparing', 'updating', 'rechecking', 'applying', 'done']), startedAt: z.number().min(0), updatedAt: z.number().min(0),
  message: z.string().max(2000), packages: z.array(z.string().max(214)).max(100),
  changes: z.array(z.object({ package: z.string().max(214), from: z.string().max(300), to: z.string().max(300) })).max(100),
  files: z.array(z.object({
    path: z.string().max(100), beforeHash: z.string().max(64), afterHash: z.string().max(64),
    diff: z.string().max(100000) })).max(2),
  warnings: z.array(z.string().max(2000)).max(100), resultRunId: identity.optional(), recoveryPath: z.string().max(4096).optional(),
  applied: z.boolean().optional(), definitionOnly: z.literal(true), runtimeTests: z.literal('not-run'),
})
const runSchema = z.object({
  workspaceId: identity, runId: identity, sessionId: identity, requestId: identity,
  status: z.enum(['running', 'completed', 'incomplete', 'failed', 'cancelled', 'interrupted']),
  phase: z.enum(['lockfile', 'advisories', 'formatting', 'done']),
  createdAt: z.number().min(0).max(Number.MAX_SAFE_INTEGER), updatedAt: z.number().min(0).max(Number.MAX_SAFE_INTEGER),
  message: z.string().max(2000), checkedPackages: z.number().int().min(0).max(10000), findings: z.array(findingSchema).max(500),
  warnings: z.array(z.string().max(2000)).max(100),
  lockfile: z.object({ path: z.string().max(4096), packageManager: z.enum(['npm', 'pnpm']), scope: z.enum(['project', 'workspace']) }).optional(),
  inputDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(), repair: repairSchema.optional(),
  markdown: z.string().max(4 * 1024 * 1024).optional(),
  deletedAt: z.number().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
})
const resource = (request: SupplyChainReadRequest) => request.workspaceId

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Deterministic Workspace dependency checks, separate from diagnostic execution. */
    securitySupplyChain: SecuritySupplyChainService
  }
}

/** No model calls, arbitrary executable, client directory, or package installation. */
export class SecuritySupplyChainService extends TypertRemoteService {
  static inject = ['workspaceRegistry', 'sessionController', 'sessions', 'sessionPersistence', 'sessionQuery', 'agents', 'jobs']
  private readonly runs = new Map<string, SupplyChainRun>()
  private readonly active = new Map<WorkspaceId, { run: SupplyChainRun; abort: AbortController; job?: JobId; done?: Promise<void> }>()
  private readonly starting = new Map<WorkspaceId, Promise<SupplyChainRun>>()
  private readonly repairRequests = new Map<string, SupplyChainRun>()
  private readonly tombstones = new Map<string, { workspaceId: WorkspaceId; requestId: string; deletedAt: number }>()
  private readonly removing = new Set<string>()
  private stopping = false
  /** @param ctx Existing Workspace, Session and job owners. */
  constructor(ctx: Context) { super(ctx, 'securitySupplyChain') }

  protected async [Service.init](): Promise<void> {
    this.ctx.effect(() => this.ctx.jobs.attachController('security-supply-chain'), 'securitySupplyChain.controller')
    this.ctx.effect(() => async () => {
      this.stopping = true
      for (const value of this.active.values()) value.abort.abort(new Error('Scanner service stopped'))
      await Promise.allSettled([...this.starting.values(), ...[...this.active.values()].map(value => value.done)])
    }, 'securitySupplyChain.lifecycle')
    for (const workspace of this.ctx.workspaceRegistry.list()) for (const sessionId of workspace.sessionIds) {
      using observation = await this.ctx.sessionQuery.observeSession(sessionId, { projectionMode: 'none' }).catch(() => undefined)
      if (!observation) continue
      const events = observation.events
      try { this.ctx.get('sessionProjectionCache')?.coldSnapshot(observation.header, observation.inheritedEventCount, events) }
      catch (_error: unknown) { this.ctx.logger.warn('Supply-chain check: a cached conversation summary could not be refreshed; saved results remain readable.') }
      for (const event of events) this.restore(event, workspace.id, sessionId)
    }
    for (const run of this.runs.values()) if (run.repair?.status === 'running') {
      if (!this.ctx.sessions.get(run.sessionId)) await this.ctx.agents.resume({ resumeSessionId: run.sessionId })
      run.repair.status = 'interrupted'; run.repair.phase = 'done'
      run.repair.message = 'The repair was interrupted. Inspect the private recovery files before changing definitions again.'
      await this.persist(run)
    }
    for (const run of this.runs.values()) if (run.status === 'running') {
      if (!this.ctx.sessions.get(run.sessionId)) await this.ctx.agents.resume({ resumeSessionId: run.sessionId })
      run.status = 'interrupted'; run.phase = 'done'; run.message = 'The application restarted before this check finished. No automatic check was started.'
      run.markdown = supplyChainMarkdown(run)
      await this.persist(run)
    }
  }

  /** Start a fixed check once; concurrent clicks reopen the existing owned run.
   * @param request Registered Workspace and stable click identity.
   * @returns Ordinary conversation and saved scanner state.
   */
  @Remote({ resources: { workspace: resource } })
  async start(request: SupplyChainStartRequest): Promise<SupplyChainRun> {
    requestSchema.parse(request); this.authorize(request.workspaceId)
    if (this.stopping) throw new Error('Scanner is stopping')
    const existing = [...this.runs.values()].find(run => run.workspaceId === request.workspaceId && run.requestId === request.requestId)
    if (existing) return structuredClone(existing)
    for (const gone of this.tombstones.values()) if (gone.workspaceId === request.workspaceId && gone.requestId === request.requestId) throw new Error('This check request was already deleted; start a new check')
    const pending = this.starting.get(request.workspaceId)
    if (pending) return structuredClone(await pending)
    const active = this.active.get(request.workspaceId)
    if (active) return structuredClone(active.run)
    const operation = this.begin(request)
    this.starting.set(request.workspaceId, operation)
    try { return structuredClone(await operation) } finally { this.starting.delete(request.workspaceId) }
  }

  /** Read saved facts without executing inference or another scan.
   * @param request Registered Workspace and optional prior run.
   * @returns Saved result or an explicit absence.
   */
  @Remote({ resources: { workspace: resource } })
  read(request: SupplyChainReadRequest): SupplyChainReadResult {
    readSchema.parse(request); this.authorize(request.workspaceId)
    const candidates = [...this.runs.values()].filter(value => value.workspaceId === request.workspaceId)
    const run = request.runId ? this.runs.get(request.runId) : candidates.sort((a, b) => b.createdAt - a.createdAt)[0]
    if (run && run.workspaceId !== request.workspaceId) throw new Error('Scanner run belongs to another Workspace')
    return run ? { run: structuredClone(run) } : {}
  }

  /** Cancel only the exact owned check; no arbitrary job identity is accepted.
   * @param request Original Workspace and run.
   * @returns Terminal saved state after cancellation settles.
   */
  @Remote({ resources: { workspace: resource } })
  async cancel(request: SupplyChainCancelRequest): Promise<SupplyChainRun> {
    readSchema.extend({ runId: identity }).parse(request); this.authorize(request.workspaceId)
    const run = this.runs.get(request.runId)
    if (!run || run.workspaceId !== request.workspaceId) throw new Error('Scanner run not found')
    const value = this.active.get(request.workspaceId)
    if (value?.run.runId === request.runId) {
      value.abort.abort(new Error('Cancelled by the Workspace owner'))
      if (value.job) this.ctx.jobs.kill(value.job, run.sessionId, 'Cancelled by the Workspace owner')
      await value.done
    }
    return structuredClone(this.runs.get(request.runId) ?? run)
  }

  /** List saved checks without starting a model or another scan.
   * @param request Registered owner Workspace.
   * @returns Newest saved results first.
   */
  @Remote({ resources: { workspace: resource } })
  list(request: SupplyChainListRequest): SupplyChainListResult {
    z.object({ workspaceId: identity }).strict().parse(request); this.authorize(request.workspaceId)
    const runs = [...this.runs.values()].filter(run => run.workspaceId === request.workspaceId)
    return { runs: runs.sort((a, b) => b.createdAt - a.createdAt).map(run => structuredClone(run)) }
  }

  /** Hide one finished check from list, read and repair; the Session log keeps every earlier snapshot as evidence.
   * Project manifests, lockfiles and repair recovery files are never touched.
   * @param request Original Workspace and run.
   * @returns Deletion time. Repeating the request returns the original time only after the Session log flush succeeds again;
   *   a rejected flush leaves the outcome unknown, so retry until it resolves.
   */
  @Remote({ resources: { workspace: resource } })
  async deleteRun(request: SupplyChainRemoveRequest): Promise<SupplyChainRemoveResult> {
    readSchema.extend({ runId: identity }).parse(request); this.authorize(request.workspaceId)
    const gone = this.tombstones.get(request.runId)
    if (gone) {
      if (gone.workspaceId !== request.workspaceId) throw new Error('Scanner run belongs to another Workspace')
      await this.ctx.sessionPersistence.flush()
      return { runId: request.runId, deletedAt: gone.deletedAt }
    }
    const run = this.runs.get(request.runId)
    if (!run || run.workspaceId !== request.workspaceId) throw new Error('Saved check not found')
    if (run.status === 'running' || run.repair?.status === 'running' || this.active.get(run.workspaceId)?.run.runId === run.runId) throw new Error('A running check cannot be deleted; stop it first')
    if (this.removing.has(run.runId)) throw new Error('This check is already being deleted')
    this.removing.add(run.runId)
    const deletedAt = Date.now()
    try {
      if (!this.ctx.sessions.get(run.sessionId)) await this.ctx.agents.resume({ resumeSessionId: run.sessionId })
      await this.persist({ ...structuredClone(run), deletedAt })
    } finally { this.removing.delete(run.runId) }
    return { runId: run.runId, deletedAt }
  }

  /** Repair exact saved package groups with fixed package-manager commands.
   * @param request Saved check and optional package names; versions and commands are never accepted.
   * @returns Durable repair progress on the original run.
   */
  @Remote({ resources: { workspace: resource } })
  async repair(request: SupplyChainRepairRequest): Promise<SupplyChainRun> {
    z.object({ workspaceId: identity, runId: identity, requestId: identity,
      packages: z.array(z.string().min(1).max(214)).min(1).max(100).optional() }).strict().parse(request)
    this.authorize(request.workspaceId)
    const original = this.runs.get(request.runId)
    if (!original || original.workspaceId !== request.workspaceId) throw new Error('Saved check not found')
    if (this.removing.has(original.runId)) throw new Error('This check is being deleted')
    const key = JSON.stringify([request.workspaceId, request.runId, request.requestId])
    const previous = this.repairRequests.get(key)
    if (previous) return structuredClone(previous)
    if (this.stopping || this.active.has(request.workspaceId) || this.starting.has(request.workspaceId)) throw new Error('Another Workspace check or repair is already active')
    if (!original.inputDigest) throw new RepairRefusal('unsupported', 'This older check has no definition fingerprint. Run a new check before automatic repair.')
    if (original.status !== 'completed') throw new RepairRefusal('unsupported', 'A completed check is required before automatic repair.')
    const run = structuredClone(original)
    const groups = [...new Set(run.findings.map(row => row.package))]
    const eligible = groups.filter(name => run.findings.filter(row => row.package === name).every(row => row.relationship === 'direct' && row.fixStatus === 'available'))
    const names = request.packages ?? eligible
    if (!names.length || names.some(name => !run.findings.some(row => row.package === name))) throw new Error('No eligible saved package groups were selected')
    const repair: SupplyChainRepair = { requestId: request.requestId, status: 'running', phase: 'preparing', startedAt: Date.now(), updatedAt: Date.now(), message: 'Preparing a definition-only dependency update.', packages: [...new Set(names)], changes: [], files: [], warnings: [], definitionOnly: true, runtimeTests: 'not-run' }
    if (!request.packages) repair.warnings = groups.filter(name => !eligible.includes(name)).map(name => `${name}: shared, transitive or unknown fix metadata requires manual review.`).slice(0, 100)
    run.repair = repair
    const value: { run: SupplyChainRun; abort: AbortController; job?: JobId; done?: Promise<void> } = { run, abort: new AbortController() }
    this.active.set(request.workspaceId, value)
    try {
      await this.persist(run); this.repairRequests.set(key, structuredClone(run))
      value.job = this.ctx.jobs.start({ kind: 'security-supply-chain', owner: run.sessionId, label: 'Fixed dependency definition repair', run: () => ({ cancel: () => { value.abort.abort(new Error('Repair cancelled')) }, done: Promise.resolve().then(async (): Promise<JobOutcome> => {
        const timer = setTimeout(() => { value.abort.abort(new Error('Repair time limit reached')) }, 240000)
        try {
          const workspace = this.ctx.workspaceRegistry.get(request.workspaceId)
          if (!workspace) throw new RepairRefusal('stale', 'Registered Workspace is unavailable')
          const lock = await readSupplyChainLock(workspace.path, value.abort.signal)
          const input = await readRepairInput(workspace.path, lock)
          const outcome = await repairDefinitions(this.ctx, input, run, repair.packages, value.abort.signal,
            async (phase, message, details) => {
              repair.phase = phase; repair.message = message; repair.updatedAt = Date.now()
              if (details) {
                repair.changes = details.changes; repair.files = details.files
                repair.recoveryPath = details.recoveryPath; repair.applied = details.applied ?? false
              }
              await this.persist(run)
            })
          repair.applied = true; repair.changes = outcome.changes
          repair.files = outcome.files; repair.recoveryPath = outcome.recoveryPath
          const verified: SupplyChainRun = { ...run, runId: randomUUID(), requestId: `repair-${repair.requestId}`, createdAt: Date.now(), updatedAt: Date.now(), status: outcome.result.warnings.length ? 'incomplete' : 'completed', phase: 'done', message: 'Updated dependency definitions were rechecked. node_modules installation and application tests were not performed.', findings: outcome.result.findings, warnings: outcome.result.warnings, checkedPackages: outcome.lock.dependencies.length, lockfile: outcome.lock.lockfile, inputDigest: (await readRepairInput(workspace.path, outcome.lock)).digest }
          delete verified.repair; verified.markdown = supplyChainMarkdown(verified)
          await this.persist(verified); repair.resultRunId = verified.runId
          repair.status = outcome.result.warnings.length || outcome.result.findings.some(row => repair.packages.includes(row.package)) ? 'incomplete' : 'completed'; repair.message = 'Dependency definitions updated and rechecked. Runtime installation and application tests remain unperformed.'
          return { status: 'completed' }
        } catch (error) {
          repair.status = value.abort.signal.aborted ? 'cancelled' : error instanceof RepairRefusal ? error.status : 'failed'
          repair.message = error instanceof Error ? error.message.slice(0, 1800) : 'Repair did not complete.'
          if (repair.recoveryPath && !repair.applied) repair.warnings.push('Definition application may be partial. Original bytes and per-file progress remain in the private recovery directory; no automatic rollback overwrote user changes.')
          return { status: repair.status === 'cancelled' ? 'killed' : 'failed' }
        } finally {
          clearTimeout(timer); repair.phase = 'done'; repair.updatedAt = Date.now()
          try { await this.persist(run); this.repairRequests.set(key, structuredClone(run)) }
          finally { this.active.delete(request.workspaceId) }
        }
      }) }) })
      value.done = this.ctx.jobs.wait(value.job, 300000, run.sessionId).then(() => {})
      return structuredClone(run)
    } catch (error) { this.active.delete(request.workspaceId); throw error }
  }

  private authorize(workspaceId: WorkspaceId): void {
    if (principalOf(this.ctx.invocation) !== undefined) throw new RemoteError('security/rejected', 'Supply-chain checks require the Workspace owner', { workspaceId })
    if (!this.ctx.workspaceRegistry.get(workspaceId)) throw new Error('Registered Workspace not found')
  }

  private async begin(request: SupplyChainStartRequest): Promise<SupplyChainRun> {
    const workspace = this.ctx.workspaceRegistry.get(request.workspaceId)
    if (!workspace) throw new Error('Registered Workspace not found')
    const { sessionId } = await this.ctx.sessionController.create({ workspaceId: request.workspaceId })
    await this.ctx.sessionController.rename({ sessionId, title: 'Supply-chain check' })
    const run: SupplyChainRun = { ...request, runId: randomUUID(), sessionId, status: 'running', phase: 'lockfile', createdAt: Date.now(), updatedAt: Date.now(), message: 'Reading bounded npm/pnpm lock metadata from the registered Workspace.', checkedPackages: 0, findings: [], warnings: [] }
    await this.persist(run)
    const value: { run: SupplyChainRun; abort: AbortController; job?: JobId; done?: Promise<void> } = { run, abort: new AbortController() }
    this.active.set(request.workspaceId, value)
    try {
      value.job = this.ctx.jobs.start({ kind: 'security-supply-chain', owner: sessionId, label: 'Fixed public dependency advisory check', run: job => ({ cancel: () => { value.abort.abort(new Error('Check cancelled')) }, done: Promise.resolve().then(async (): Promise<JobOutcome> => {
        const timer = setTimeout(() => { value.abort.abort(new Error('Scanner time limit reached')) }, 120000)
        try {
          const lock = await readSupplyChainLock(workspace.path, value.abort.signal)
          run.lockfile = lock.lockfile
          try { run.inputDigest = (await readRepairInput(workspace.path, lock)).digest }
          catch { /* Unsupported repair scope does not prevent read-only checks. */ }
          run.checkedPackages = lock.dependencies.length; run.warnings = lock.warnings
          const result = await scanSupplyChain(lock, { signal: value.abort.signal, finding: finding => run.findings.push(finding), progress: async (phase, message) => { run.phase = phase; run.message = message; job.append(message, { channel: 'log' }); await this.persist(run) } })
          run.findings = result.findings; run.warnings = result.warnings
          run.phase = 'formatting'; run.message = 'Formatting the saved factual advisory report.'; await this.persist(run)
          run.status = result.warnings.some(warning => !warning.startsWith('Optional ')) ? 'incomplete' : 'completed'
          run.message = 'Public advisory comparison finished. Matches describe dependencies, not confirmed application exploitability.'
          return { status: 'completed' }
        } catch (error) {
          run.status = value.abort.signal.aborted ? 'cancelled' : 'failed'
          run.message = value.abort.signal.aborted ? (value.abort.signal.reason instanceof Error ? value.abort.signal.reason.message : 'Check stopped before complete coverage was established.') : error instanceof Error ? error.message.slice(0, 1000) : 'Check failed before complete coverage was established.'
          return { status: run.status === 'cancelled' ? 'killed' : 'failed' }
        } finally {
          clearTimeout(timer); run.phase = 'done'; run.markdown = supplyChainMarkdown(run)
          await this.persist(run)
          this.active.delete(request.workspaceId)
        }
      }) }) })
      // Register a real owner waiter before the deferred producer can settle. This
      // collects completion without tool-jobs waking the conversation's model.
      value.done = this.ctx.jobs.wait(value.job, 180000, sessionId).then(() => {})
    } catch (error) {
      this.active.delete(request.workspaceId); run.status = 'failed'; run.phase = 'done'; run.message = 'The background check could not be started.'; await this.persist(run); throw error
    }
    return run
  }

  private async persist(run: SupplyChainRun): Promise<void> {
    run.updatedAt = Date.now()
    const session = this.ctx.sessions.get(run.sessionId)
    if (!session) throw new Error('Scanner Session is unavailable')
    const message = createUserMessage({ source: { kind: 'security-supply-chain', form: 'notice', visibleInHistory: true, summary: 'Supply-chain check', owner: run.sessionId, run: structuredClone(run) }, content: [{ type: 'text', text: run.markdown ?? run.message }] })
    session.append('user/message', message, { surfaceOp: 'append' })
    // The appended tombstone is already in the live log, so a failed flush leaves the deletion outcome unknown:
    // hide the run now and let a repeated remove re-flush. Ordinary snapshots stay unretained until the flush succeeds.
    if (run.deletedAt !== undefined) this.retain(run)
    await this.ctx.sessionPersistence.flush()
    if (run.deletedAt === undefined) this.retain(run)
  }

  private retain(run: SupplyChainRun): void {
    if (run.deletedAt === undefined) { this.runs.set(run.runId, structuredClone(run)); return }
    this.runs.delete(run.runId)
    this.tombstones.set(run.runId, { workspaceId: run.workspaceId, requestId: run.requestId, deletedAt: run.deletedAt })
    for (const [key, value] of this.repairRequests) if (value.runId === run.runId) this.repairRequests.delete(key)
  }

  private restore(event: SessionEvent, workspaceId: WorkspaceId, sessionId: SessionId): void {
    if (event.type !== 'user/message' || event.data.source.kind !== 'security-supply-chain') return
    const source = event.data.source
    const parsed = runSchema.safeParse(source.run)
    if (!parsed.success || source.owner !== sessionId) return
    if (parsed.data.sessionId !== sessionId || parsed.data.workspaceId !== workspaceId) return
    const restored: SupplyChainRun = { ...parsed.data, workspaceId, sessionId }
    if (this.tombstones.has(restored.runId)) return
    if (restored.deletedAt !== undefined) { this.retain(restored); return }
    this.runs.set(parsed.data.runId, restored)
    if (restored.repair) this.repairRequests.set(JSON.stringify([workspaceId, restored.runId, restored.repair.requestId]), restored)
  }
}
