import { SupplyChainList, SupplyChainConversation, SupplyChainReadOnlyComposer, type SupplyChainFace } from './SupplyChainList.tsx'
import { TaskCoverageRecords, type CoverageFace } from './TaskCoverageRecords.tsx'
import { TaskSavedReport, type ReportFace } from './TaskSavedReport.tsx'
import { TaskFindingRecords, type FindingRecordsFace } from './TaskFindingRecords.tsx'
import { TaskActivity, type ActivityFace } from './TaskActivity.tsx'
import type { ExecutionFace } from './TaskExecution.tsx'
import { TaskModels, type RoleModelsFace } from './TaskModels.tsx'
import { TaskWorkers, type WorkerFace } from './TaskWorkers.tsx'
import { SecurityEnginePicker } from './SecurityEnginePicker.tsx'
import { createSetupState } from './setup-state.ts'
import { createPlanningState } from './planning-state.ts'
import { TaskPlanning } from './TaskPlanning.tsx'
import type {} from '@deepseek-ai/dsh-client-ui-security/remote'
/** Security workspace plugin: workspace-scoped records and task-owned conversations. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { createRecordsState } from './records-state.ts'
import { SecurityPage } from './SecurityPage.tsx'
import { createSecurityState } from './state.ts'
import { en, ja, zh, type SecurityKey } from './locales.ts'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SecurityNavigation, SecuritySelection } from './navigation.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ComposerChainProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { TokenUsageHeader } from './TokenUsageHeader.tsx'
import { SecurityTaskSessions, SecurityConversationBody, SecurityInvestigationStart, SecurityConversationComposer, type SecurityConversationTarget, type SecurityConversationFace } from './SecurityConversation.tsx'
import { WorkspaceSecurity } from './WorkspaceSecurity.tsx'
import { showInMainSidebar } from './security-session-visibility.ts'
import { SecurityControlTail } from './SecurityControlTail.tsx'
import { SupplyChainChat, type SupplyChainActions } from './SupplyChainChat.tsx'
import { supplyChainDefinition } from './supply-chain-definition.ts'
import { securityControlDefinition } from './control-navigation.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Security workspace dictionaries. */
    security: SecurityKey
  }
}
/** Services needed for panel registration and translated navigation. */
export const inject = ['slots', 'locale', 'layout', 'remote', 'remote.securitySupplyChain', 'remote.securityRecords', 'remote.securityControl', 'remote.securityConversations', 'remote.securityPlanning', 'remote.securitySetup', 'remote.securityWorkers', 'remote.securityExecution', 'remote.securityFindings', 'remote.securityExploration', 'uiWorkspace', 'uiConversation', 'sessions']
/** Register the browser-only security workspace.
 * @param ctx - client plugin lifecycle and registered services.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.uiWorkspace.sidebarSessions.register(showInMainSidebar),
    'ui-security: task conversations stay in task navigation')
  ctx.effect(() => ctx.locale.register('security', { en, zh }), 'ui-security: dictionaries')
  ctx.effect(() => ctx.locale.register('security', 'ja', ja), 'ui-security: Japanese dictionary')
  ctx.effect(() => ctx.locale.addLanguage({ id: 'ja', label: '日本語', fallback: 'en' }), 'ui-security: Japanese language')
  const face = createSecurityState()
  const recordsFace = createRecordsState(ctx.remote.securityRecords)
  const planningFace = createPlanningState(ctx.remote.securityPlanning, workspaceId => recordsFace.flushSecurityTasks(workspaceId))
  ctx.effect(() => () => { planningFace.dispose() }, 'ui-security: planning projections')
  const setupFace = createSetupState(
    ctx.remote.securitySetup, workspaceId => recordsFace.flushSecurityTasks(workspaceId),
    async (workspaceId, revision) => {
      await recordsFace.loadSecurityRecords(workspaceId)
      const records = recordsFace.hooks.securityRecords.getSnapshot()[workspaceId]?.records
      return records !== undefined && records.revision >= revision
    },
    () => { const active = ctx.locale.getLocale().active; return active === 'ja' || active === 'zh' ? active : 'en' })
  ctx.effect(() => () => { setupFace.dispose() }, 'ui-security: setup projections')
  const conversationTargets = new Map<SessionId, SecurityConversationTarget>()
  const conversationFace: SecurityConversationFace = {
    async openSecurityConversation(target, signal) {
      const result = await ctx.remote.securityConversations.open(target)
      if (!result.ok) throw new Error(result.error.message)
      if (signal.aborted) throw new Error('Security conversation opening was cancelled')
      conversationTargets.set(result.value.sessionId, target)
      const reference = ctx.sessions.retain(result.value.sessionId, { source: 'securityConversation', signal })
      try {
        await reference.ready
        return reference
      } catch (error) {
        reference.release()
        throw error
      }
    },
    async sendSecurityConversation(target, text, requestId) {
      if (!await recordsFace.flushSecurityTasks(target.workspaceId)) return 'save-failed'
      const result = await ctx.remote.securityConversations.send({ ...target, text, requestId })
      if (!result.ok) throw new Error(result.error.message)
      return 'sent'
    },
    async cancelSecurityConversation(target) {
      const result = await ctx.remote.securityConversations.cancel(target)
      if (!result.ok) throw new Error(result.error.message)
    },
  }
  const engineFace: RoleModelsFace = {
    async loadSecurityEngine(target, role) {
      const result = await ctx.remote.securityConversations.catalog({ ...target, ...(role === undefined ? {} : { role }) })
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    async selectSecurityEngine(target, selection, role, mode) {
      if (!await recordsFace.flushSecurityTasks(target.workspaceId)) throw new Error('Save task settings before selecting a model')
      const result = await ctx.remote.securityConversations.select({
        ...target, ...selection, ...(role === undefined ? {} : { role }), ...(mode === undefined ? {} : { mode }),
      })
      if (!result.ok) throw new Error(result.error.message)
      await recordsFace.loadSecurityRecords(target.workspaceId)
    },
  }
  const workerFace: WorkerFace = {
    async setSecurityBrowserCredentials(request) {
      const result = await ctx.remote.securityWorkers.setBrowserCredentials(request)
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    async approveSecurityWorkerTool(request) {
      const result = await ctx.remote.securityWorkers.approveTool(request)
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    async readSecurityWorkers(target) {
      const result = await ctx.remote.securityWorkers.read({ workspaceId: target.workspaceId, taskId: target.taskId })
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    async sendSecurityWorker(request) {
      const result = await ctx.remote.securityWorkers.send(request)
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    async startSecurityWorker(request) {
      if (!await recordsFace.flushSecurityTasks(request.workspaceId)) throw new Error('Save task settings before execution')
      const result = await ctx.remote.securityWorkers.start(request)
      if (!result.ok) throw new Error(result.error.message)
    },
    async cancelSecurityWorker(target) {
      const result = await ctx.remote.securityWorkers.cancel(target)
      if (!result.ok) throw new Error(result.error.message)
    },
  }
  const executionFace: ExecutionFace = {
    async readSecurityExecution(target) {
      const result = await ctx.remote.securityExecution.read(target)
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    async startSecurityExecution(request) {
      if (!await recordsFace.flushSecurityTasks(request.workspaceId)) throw new Error('Save task settings before execution')
      const { resumeRunId, targets, ...start } = request
      const result = await ctx.remote.securityControl.execute(resumeRunId === undefined
        ? { ...start, action: 'start', ...(targets === undefined ? {} : { targets }) }
        : { ...start, action: 'resume', resumeRunId })
      if (!result.ok) throw new Error(result.error.message)
    },
    async cancelSecurityExecution(target) {
      const result = await ctx.remote.securityControl.execute({ ...target, action: 'stop' })
      if (!result.ok) throw new Error(result.error.message)
    },
  }
  const findingRecordsFace: FindingRecordsFace = {
    async linkFindingDuplicate(request) {
      const result = await ctx.remote.securityFindings.linkDuplicate(request)
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    openRetestSession(sessionId) { ctx.uiWorkspace.openSession(sessionId) },
    async readFindings(target) {
      const result = await ctx.remote.securityFindings.read(target)
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    async setFindingStatus(request) {
      const result = await ctx.remote.securityFindings.setStatus(request)
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    async startFindingRetest(request) {
      if (!await recordsFace.flushSecurityTasks(request.workspaceId)) throw new Error('Save task settings before retest')
      const result = await ctx.remote.securityFindings.startRetest(request)
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    async cancelFindingRetest(request) {
      const result = await ctx.remote.securityFindings.cancelRetest(request)
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
  }
  const activityFace: ActivityFace = {
    async readTaskActivity(target) {
      const [planning, workers, execution, exploration] = await Promise.all([
        ctx.remote.securityPlanning.read(target), ctx.remote.securityWorkers.read(target), ctx.remote.securityExecution.read(target),
        ctx.remote.securityExploration.read(target),
      ])
      if (!planning.ok) throw new Error(planning.error.message)
      if (!workers.ok) throw new Error(workers.error.message)
      if (!execution.ok) throw new Error(execution.error.message)
      if (!exploration.ok) throw new Error(exploration.error.message)
      return { planning: planning.value, workers: workers.value, execution: execution.value, exploration: exploration.value }
    },
  }
  const reportFace: ReportFace = {
    async readSecurityReport(target) {
      const [activity, findings] = await Promise.all([activityFace.readTaskActivity(target), ctx.remote.securityFindings.read(target)])
      if (!findings.ok) throw new Error(findings.error.message)
      return { ...activity, ...findings.value }
    },
  }
  const coverageFace: CoverageFace = {
    async readTaskCoverage(target) {
      const [records, planning, workers, findings] = await Promise.all([
        ctx.remote.securityRecords.read({ workspaceId: target.workspaceId }), ctx.remote.securityPlanning.read(target),
        ctx.remote.securityWorkers.read(target), ctx.remote.securityFindings.read(target),
      ])
      if (!records.ok) throw new Error(records.error.message)
      if (!planning.ok) throw new Error(planning.error.message)
      if (!workers.ok) throw new Error(workers.error.message)
      if (!findings.ok) throw new Error(findings.error.message)
      return { records: records.value, planning: planning.value, workers: workers.value, findings: findings.value }
    },
  }
  const panelId = 'security' as MainPanelId
  const selection = createSnapshotStore<SecuritySelection | undefined>(undefined)
  const navigation: SecurityNavigation = {
    hooks: { securitySelection: selection },
    openSecurity(workspaceId, title, view) {
      const projectId = view === 'assets' || view === 'tasks' || view === 'supply-chain' ? `workspace:${workspaceId}` : face.ensureWorkspace(workspaceId, title)
      selection.set({ workspaceId, projectId, view })
      ctx.layout.selectPanel(panelId)
    },
  }
  const injected = { ...face, ...recordsFace, ...navigation, hooks: { ...face.hooks, ...recordsFace.hooks, ...navigation.hooks } }
  const scannerReferences = new Map<SessionId, number>()
  const supplyChainFace: SupplyChainFace = {
    async listSupplyChain(workspaceId) {
      const result = await ctx.remote.securitySupplyChain.list({ workspaceId })
      if (!result.ok) throw new Error(result.error.message)
      return result.value.runs
    },
    async startSupplyChain(workspaceId, requestId) {
      const result = await ctx.remote.securitySupplyChain.start({ workspaceId, requestId })
      if (!result.ok) throw new Error(result.error.message)
      await ctx.sessions.refresh()
      return result.value
    },
    async removeSupplyChain(request) {
      const result = await ctx.remote.securitySupplyChain.deleteRun(request)
      if (!result.ok) throw new Error(result.error.message)
      await ctx.sessions.refresh()
    },
    async retainSupplyChain(sessionId, signal) {
      const reference = ctx.sessions.retain(sessionId, { source: 'securityConversation', signal })
      scannerReferences.set(sessionId, (scannerReferences.get(sessionId) ?? 0) + 1)
      let registered = true
      const remove = (): void => {
        if (!registered) return
        registered = false
        const remaining = (scannerReferences.get(sessionId) ?? 1) - 1
        if (remaining > 0) scannerReferences.set(sessionId, remaining)
        else scannerReferences.delete(sessionId)
      }
      signal.addEventListener('abort', remove, { once: true })
      try {
        await reference.ready
        if (signal.aborted) throw new Error('Scanner conversation opening was cancelled')
        return reference
      } catch (error) { remove(); signal.removeEventListener('abort', remove); reference.release(); throw error }
    },
  }
  ctx.uiConversation.events.register(supplyChainDefinition)
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node', key: 'security-supply-chain', locale: 'security',
    inject: (): SupplyChainActions => ({
      async repairSupplyChain(request) {
        const result = await ctx.remote.securitySupplyChain.repair(request)
        if (!result.ok) throw new Error(result.error.message)
        return result.value
      },
      async cancelSupplyChain(request) {
        const result = await ctx.remote.securitySupplyChain.cancel(request)
        if (!result.ok) throw new Error(result.error.message)
      },
    }),
  }, SupplyChainChat))
  ctx.uiConversation.events.register(securityControlDefinition)
  ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
    name: 'conversation.chat.turnTail', id: '@deepseek-ai/dsh-client-ui-security-control', locale: 'security',
    inject: () => ({
      async openSecurityTask(workspaceId: SecuritySelection['workspaceId'], taskId: string, view: NonNullable<SecuritySelection['taskView']>) {
        const current = selection.getSnapshot()
        if (current && !await recordsFace.flushSecurityTasks(current.workspaceId)) throw new Error('Save pending task settings before navigation')
        await recordsFace.loadSecurityRecords(workspaceId)
        const entry = recordsFace.hooks.securityRecords.getSnapshot()[workspaceId]
        if (entry?.error || !entry?.records?.tasks.some(task => task.id === taskId && !task.archived)) throw new Error('Task unavailable')
        selection.set({ workspaceId, projectId: `workspace:${workspaceId}`, view: 'tasks', taskId, taskView: view })
        ctx.layout.selectPanel(panelId)
      },
    }),
  }, SecurityControlTail))
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: panelId, children: { 'security.task.sessions': { kind: 'single', scope: 'root' }, 'security.task.planning': { kind: 'single', scope: 'root' }, 'security.task.models': { kind: 'single', scope: 'root' }, 'security.task.activity': { kind: 'single', scope: 'root' }, 'security.task.findings': { kind: 'single', scope: 'root' }, 'security.task.report': { kind: 'single', scope: 'root' }, 'security.task.coverage': { kind: 'single', scope: 'root' }, 'security.supply-chain': { kind: 'single', scope: 'root' } }, locale: 'security', inject: () => injected }, SecurityPage))
  ctx.slots.inject('security.supply-chain', () => ctx.slots.register({
    name: 'security.supply-chain', locale: 'security', children: { 'security.supply-chain.conversation': { kind: 'single', scope: 'session' } }, inject: () => supplyChainFace,
  }, SupplyChainList))
  ctx.slots.inject('security.supply-chain.conversation', () => ctx.slots.register({
    name: 'security.supply-chain.conversation',
  }, SupplyChainConversation))
  ctx.slots.inject('conversation.composer', () => ctx.slots.register({
    name: 'conversation.composer', priority: 0,
    select: ({ sessionId }: ComposerChainProps) => sessionId !== undefined && scannerReferences.has(sessionId) ? {} : null,
  }, SupplyChainReadOnlyComposer))
  ctx.slots.inject('security.task.coverage', () => ctx.slots.register({ name: 'security.task.coverage', locale: 'security', inject: () => coverageFace }, TaskCoverageRecords))
  ctx.slots.inject('security.task.report', () => ctx.slots.register({ name: 'security.task.report', locale: 'security', inject: () => reportFace }, TaskSavedReport))
  ctx.slots.inject('security.task.findings', () => ctx.slots.register({
    name: 'security.task.findings', locale: 'security', inject: () => findingRecordsFace,
  }, TaskFindingRecords))
  ctx.slots.inject('security.task.activity', () => ctx.slots.register({
    name: 'security.task.activity', locale: 'security', inject: () => activityFace,
  }, TaskActivity))
  ctx.slots.inject('security.task.sessions', () => ctx.slots.register({
    name: 'security.task.sessions', locale: 'security',
    children: { 'security.task.tokens': { kind: 'single', scope: 'root' }, 'security.task.investigation': { kind: 'single', scope: 'session' }, 'security.task.engine': { kind: 'single', scope: 'session' }, 'security.task.conversation': { kind: 'single', scope: 'session' }, 'security.sessions.planning': { kind: 'single', scope: 'root' }, 'security.sessions.workers': { kind: 'single', scope: 'root' } },
    inject: () => ({ ...conversationFace, ...planningFace, ...setupFace, ...workerFace, ...executionFace,
      hooks: { ...planningFace.hooks, ...setupFace.hooks, ...recordsFace.hooks } }),
  }, SecurityTaskSessions))
  ctx.slots.inject('security.task.tokens', () => ctx.slots.register({ name: 'security.task.tokens', locale: 'security', inject: () => ({ refreshTokenProjection: (sessionId: SessionId) => ctx.sessions.refreshProjections(sessionId) }) }, TokenUsageHeader))
  ctx.slots.inject('security.task.planning', () => ctx.slots.register({
    name: 'security.task.planning', locale: 'security',
    inject: () => ({ ...planningFace, ...setupFace, ...workerFace, ...executionFace,
      hooks: { ...planningFace.hooks, ...setupFace.hooks, ...recordsFace.hooks } }),
  }, TaskPlanning))
  ctx.slots.inject('security.sessions.planning', () => ctx.slots.register({
    name: 'security.sessions.planning', locale: 'security',
    inject: () => ({ ...planningFace, ...setupFace, ...workerFace, ...executionFace,
      hooks: { ...planningFace.hooks, ...setupFace.hooks, ...recordsFace.hooks } }),
  }, TaskPlanning))
  ctx.slots.inject('security.task.models', () => ctx.slots.register({
    name: 'security.task.models', locale: 'security', inject: () => engineFace,
  }, TaskModels))
  ctx.slots.inject('security.sessions.workers', () => ctx.slots.register({
    name: 'security.sessions.workers', locale: 'security', inject: () => workerFace,
  }, TaskWorkers))
  ctx.slots.inject('security.task.engine', () => ctx.slots.register({
    name: 'security.task.engine', locale: 'security',
    inject: () => ({ ...engineFace, hooks: { ...setupFace.hooks } }),
  }, SecurityEnginePicker))
  ctx.slots.inject('security.task.conversation', () => ctx.slots.register({
    name: 'security.task.conversation', locale: 'security',
  }, SecurityConversationBody))
  ctx.slots.inject('security.task.investigation', () => ctx.slots.register({
    name: 'security.task.investigation', locale: 'security',
  }, SecurityInvestigationStart))
  ctx.slots.inject('conversation.composer', () => ctx.slots.register({
    name: 'conversation.composer', priority: 10, locale: 'security',
    select: ({ sessionId }: ComposerChainProps) => sessionId === undefined ? null : conversationTargets.get(sessionId) ?? null,
    inject: () => ({
      sendSecurityConversation: conversationFace.sendSecurityConversation,
      cancelSecurityConversation: conversationFace.cancelSecurityConversation,
    }),
  }, SecurityConversationComposer))
  ctx.slots.inject('sidebar.workspaces.project.children', () => ctx.slots.register({
    name: 'sidebar.workspaces.project.children', id: 'security', locale: 'security', inject: () => navigation,
  }, WorkspaceSecurity))
}
