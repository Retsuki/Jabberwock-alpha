/** Read-only report of saved observations, findings and coverage gaps. */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, MarkdownText, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SecurityConversationRequest } from '../conversation-types.ts'
import type { SecurityAsset, SecurityTask } from '../security-records.ts'
import type { SecurityFindingState } from '../finding-types.ts'
import { projectFindingGroups } from '../finding-groups.ts'
import { buildSecurityReport, type SecurityReport } from '../report-model.ts'
import type { ActivityFace } from './TaskActivity.tsx'
import type { SecurityTranslate } from './presentation.tsx'
import { executionMessageKeys } from './TaskExecution.copy.ts'
import { TaskExecutiveReport } from './TaskExecutiveReport.tsx'
import css from './TaskSavedReport.module.css'
/** Aggregate reads only; opening a report never starts a model or request. */
export interface ReportFace { readSecurityReport(this: void, target: SecurityConversationRequest): Promise<Awaited<ReturnType<ActivityFace['readTaskActivity']>> & SecurityFindingState> }
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * Read-only report panel receiving workspace/task identity, current task, and
     * workspace assets. The registrant owns saved-result reads, report rendering,
     * exports, and loading/error presentation. A lower-priority single contribution
     * replaces the panel; no contribution leaves the report tab empty.
     */
    'security.task.report': { kind: 'single'; scope: 'root'; owner: SecurityConversationRequest & { task: SecurityTask; assets: SecurityAsset[] } }
  }
}
type Props = PropsRuntime<'security.task.report'> & PropsLocale<'security'> & InjectFace<ReportFace>
const statusKeys = { confirmed: 'savedReportConfirmed', partial: 'savedReportPartial', unverified: 'savedReportUnverified', unsupported: 'savedReportUnsupported' } as const
const coverageKeys = { complete: 'savedReportComplete', incomplete: 'savedReportIncomplete', 'not-started': 'savedReportNotStarted', 'in-progress': 'savedReportRunning' } as const
const reasonKeys = { observed: 'reportReasonObserved', 'capture-partial': 'reportReasonCapture', 'analysis-partial': 'reportReasonAnalysis', redirect: 'reportReasonRedirect', 'worker-failed': 'reportReasonFailed', 'worker-running': 'reportReasonRunning', 'not-dispatched': 'reportReasonNotDispatched', unsupported: 'reportReasonUnsupported' } as const
const limitationKeys = { 'bounded-http': 'reportLimitHttp', 'configuration-changed': 'reportLimitChanged', 'coverage-gaps': 'reportLimitGaps', 'legacy-capture': 'reportLimitLegacy' } as const
const findingStatuses = { open: 'findingStatusOpen', 'in-progress': 'findingStatusProgress', confirmed: 'findingStatusConfirmed', fixed: 'findingStatusFixed', 'false-positive': 'findingStatusFalse', duplicate: 'findingStatusDuplicate', 'accepted-risk': 'findingStatusAccepted' } as const
const severities = { critical: 'findingSeverityCritical', high: 'findingSeverityHigh', medium: 'findingSeverityMedium', low: 'findingSeverityLow', info: 'findingSeverityInfo' } as const
const runStatuses = { running: 'findingRetestRunning', completed: 'findingRetestCompleted', failed: 'findingRetestFailed', cancelled: 'findingRetestCancelled', interrupted: 'findingRetestInterrupted' } as const
const executionStatuses = { ...runStatuses, 'needs-input': 'reportExecutionNeedsInput' } as const
const verdicts = { reproduced: 'findingVerdictReproduced', fixed: 'findingVerdictFixed', inconclusive: 'findingVerdictInconclusive' } as const
/** Build the downloadable report from the same records shown on screen. */
export function securityReportMarkdown(report: SecurityReport, t: SecurityTranslate): string {
  const task = report.task
  const operations = report.operations.map((operation) => {
    const evidence = operation.worker?.evidence
    const acquisition = evidence?.acquisition === 'complete' ? 'reportAcquisitionComplete'
      : evidence?.acquisition === 'partial' ? 'reportAcquisitionPartial' : 'reportMetadataUnknown'
    const analysis = evidence?.bodyTruncated ? 'reportAnalysisExcerpt'
      : evidence?.acquisition ? 'reportAnalysisFull' : 'reportMetadataUnknown'
    return `### ${operation.title}\n\n- ${t(statusKeys[operation.status])}: ${t(reasonKeys[operation.reason])}\n- ${operation.url || t('savedReportNone')}\n${evidence ? `- ${t('reportAcquisition')}: ${t(acquisition)}\n- ${t('reportAnalysisRange')}: ${t(analysis)}\n- HTTP ${evidence.status} · ${t('savedReportCaptured')}: ${evidence.bytes}\n${evidence.artifactId ? `- ${t('savedReportArtifact')}: ${evidence.artifactId}\n` : ''}` : ''}${operation.worker ? `- ${t('savedReportModel')}: ${operation.worker.snapshot.model.engine} / ${operation.worker.snapshot.model.model}\n- ${t('reportCaptureLimit')}: ${operation.worker.snapshot.limits.responseBytes}\n` : ''}${operation.worker?.summary ? `\n#### ${t('reportAiSummary')}\n\n${operation.worker.summary}\n` : ''}`
  }).join('\n')
  const groups = projectFindingGroups(report.findings)
  const findings = groups.map(({ finding, related }) => `### ${finding.title}\n\n${t(severities[finding.severity])} · ${t(findingStatuses[finding.status])}\n\n${finding.summary}\n\n${t('findingRecordsEvidence')}: ${finding.proof}\n\n${t('findingRecordsRemediation')}: ${finding.remediation}\n${related.map(source => `\n#### ${t('findingRecordsRelatedEvidence')}: ${source.title}\n\n- ${t('workerSpeaker')}: ${source.workerRunId}\n- ${source.evidence.url}\n- HTTP ${source.evidence.status}\n\n${t('findingRecordsEvidence')}: ${source.proof}\n`).join('\n')}`).join('\n')
  const scopeRules = (task.scopeRules ?? []).map(rule => `- ${t(rule.action === 'allow' ? 'reportAllow' : 'policyExclude')}: ${rule.value}${rule.note ? ` — ${rule.note}` : ''}`)
  const constraints = (task.constraints ?? []).map(rule => `- ${t(rule.action === 'allow' ? 'reportAllow' : 'policyExclude')}: ${rule.text}`)
  const gaps = report.operations.filter(operation => operation.status !== 'confirmed')
    .map(operation => `- ${operation.title}: ${t(statusKeys[operation.status])} — ${t(reasonKeys[operation.reason])}`)
  const execution = report.execution
  const rawStopReason = execution?.error ?? (execution?.status !== 'running' ? execution?.summary : undefined)
  const stopReason = rawStopReason && Object.hasOwn(executionMessageKeys, rawStopReason)
    ? t(executionMessageKeys[rawStopReason as keyof typeof executionMessageKeys]) : rawStopReason
  const codeFence = stopReason ? '`'.repeat(Math.max(3, ...Array.from(stopReason.matchAll(/`+/g), match => match[0].length + 1))) : '```'
  return [
    `# ${t('savedReportTitle')}: ${task.name}`, t(coverageKeys[report.coverage]),
    ...(execution ? [`${t('reportExecutionStatus')}: ${t(executionStatuses[execution.status])}`] : []),
    ...(stopReason ? [`### ${t('reportStopReason')}`, `${codeFence}text\n${stopReason}\n${codeFence}`] : []),
    `> ${t('savedReportCaution')}`,
    `## ${t('savedReportScope')}`, t('savedReportSettings'), task.objective, task.description,
    `### ${t('checklistScope')}`, report.assets.map(asset => `- ${asset.value}`).join('\n') || t('savedReportNone'),
    `### ${t('policyScopeTitle')}`, scopeRules.join('\n') || t('savedReportNone'),
    `### ${t('policyConstraint')}`, constraints.join('\n') || t('savedReportNone'),
    `### ${t('checklistGoal')}`, (task.goals ?? []).map(goal => `- ${goal.text}`).join('\n') || t('savedReportNone'),
    `### ${t('setupCompletion')}`, task.setup?.completionCondition || t('savedReportNone'),
    `### ${t('checklistPermission')}`, task.setup?.permission.confirmed ? t('reportPermissionConfirmed') : t('savedReportUnverified'),
    `### ${t('checklistLimits')}`, task.setup?.limits || t('savedReportNone'),
    `## ${t('savedReportOperations')}`, operations || t('savedReportNone'),
    `## ${t('savedReportGaps')}`, gaps.join('\n') || t('savedReportNone'),
    `## ${t('savedReportFindings')} (${groups.length})`, findings || t('savedReportNone'),
    `## ${t('savedReportRetests')} (${report.retests.length})`,
    report.retests.map(retest => `- ${retest.id}: ${t(runStatuses[retest.status])} ${retest.verdict ? t(verdicts[retest.verdict]) : ''}\n\n  ${retest.summary ?? ''}`).join('\n\n') || t('savedReportNone'),
    `## ${t('savedReportLimitations')}`, report.limitations.map(limit => `- ${t(limitationKeys[limit])}`).join('\n'),
    ...(report.execution ? [`${t('savedReportLimits')}: ${t('reportMaxRounds')} ${report.execution.snapshot.limits.maxRounds} / ${t('reportMaxRequests')} ${report.execution.snapshot.limits.maxRequests} / ${t('reportTimeoutMs')} ${report.execution.snapshot.limits.timeoutMs}`] : []),
    `${t('savedReportTime')}: ${new Date(report.generatedAt).toLocaleString()}`,
  ].join('\n\n') + '\n'
}
/** Keep records from another task out of this report. */
export function TaskSavedReport(props: Props): ReactNode {
  return <ReportContent key={JSON.stringify([props.workspaceId, props.taskId])} {...props} />
}
function ReportContent({ workspaceId, taskId, task, assets, t, readSecurityReport }: Props): ReactNode {
  const [records, setRecords] = useState<Awaited<ReturnType<ReportFace['readSecurityReport']>>>()
  const [refresh, setRefresh] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [copied, setCopied] = useState<'idle' | 'success' | 'failed'>('idle')
  useEffect(() => {
    const lifecycle = new AbortController()
    setLoading(true); setError(false)
    void readSecurityReport({ workspaceId, taskId })
      .then((value) => { if (!lifecycle.signal.aborted) setRecords(value) })
      .catch((failure: unknown) => { void failure; if (!lifecycle.signal.aborted) setError(true) })
      .finally(() => { if (!lifecycle.signal.aborted) setLoading(false) })
    return () => { lifecycle.abort() }
  }, [workspaceId, taskId, readSecurityReport, refresh])
  const report = useMemo(() => records && buildSecurityReport({ task, assets,
    plans: records.planning.plans, workers: records.workers.runs, executions: records.execution.runs,
    findings: records.findings, retests: records.retests }), [records, task, assets])
  const markdown = report ? securityReportMarkdown(report, t) : ''
  const download = (): void => {
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = `security-report-${taskId}.md`; link.click(); URL.revokeObjectURL(url)
  }
  return <section className={css.root} aria-label={t('savedReportTitle')}>
    <header className={css.header}><h2>{t('savedReportTitle')}</h2><div className={css.actions}><Button variant="outline" size="sm" disabled={loading} onClick={() => { setRefresh(value => value + 1) }}>{t('savedReportRefresh')}</Button><Button variant="outline" size="sm" disabled={!report || error} onClick={() => { void writeClipboard(markdown).then((value) => { setCopied(value ? 'success' : 'failed') }) }}>{t('taskReportCopy')}</Button><Button variant="outline" size="sm" disabled={!report || error} onClick={download}>{t('savedReportDownload')}</Button></div></header>
    {loading && <p role="status">{t('savedReportLoading')}</p>}{error && <p role="alert">{t('savedReportError')}</p>}{copied !== 'idle' && <p role="status">{t(copied === 'success' ? 'taskReportCopied' : 'taskReportCopyFailed')}</p>}
    {report && <><TaskExecutiveReport report={report} t={t} /><details className={css.technical}>
      <summary>{t('savedReportTechnicalDetails')}</summary>
      <article className={css.document}><MarkdownText text={markdown} labels={{ code: { copyLabel: t('workerCopy'), copiedLabel: t('workerCopied') }, footnotes: t('workerFootnotes') }} /></article>
      <h3>{t('savedReportEvidence')}</h3>{report.operations.filter(operation => operation.worker?.evidence).map(operation => <details className={css.evidence} key={operation.id}><summary>{operation.title} · {t(statusKeys[operation.status])}</summary><p>{t(reasonKeys[operation.reason])}</p><p>{t('savedReportPreview')}</p><pre>{JSON.stringify(operation.worker?.evidence?.headers, null, 2)}</pre><pre>{operation.worker?.evidence?.body}</pre></details>)}
    </details></>}
  </section>
}
