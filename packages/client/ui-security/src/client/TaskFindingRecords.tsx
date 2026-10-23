/** Persisted finding management and independent retest history. */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { Button, IconRefreshOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SecurityConversationRequest } from '../conversation-types.ts'
import type { SecurityAsset } from '../security-records.ts'
import type { SecurityFinding, SecurityRetest, FindingStatus } from '../finding-types.ts'
import { projectFindingGroups } from '../finding-groups.ts'
import type { SecurityWorkerEvidence } from '../worker-types.ts'
import type { SecurityTranslate } from './presentation.tsx'
import css from './TaskFindingRecords.module.css'

type Records = { findings: SecurityFinding[]; retests: SecurityRetest[] }
/** Client operations use the same durable service as worker findings. */
export interface FindingRecordsFace {
  openRetestSession(this: void, sessionId: SessionId): void
  readFindings(this: void, target: SecurityConversationRequest): Promise<Records>
  setFindingStatus(this: void, request: SecurityConversationRequest & {
    findingId: string
    status: FindingStatus
  }): Promise<Records>
  linkFindingDuplicate(this: void, request: SecurityConversationRequest & {
    findingId: string
    canonicalFindingId?: string
  }): Promise<Records>
  startFindingRetest(this: void, request: SecurityConversationRequest & {
    findingId: string
    requestId: string
    notes: string
  }): Promise<Records>
  cancelFindingRetest(this: void, request: SecurityConversationRequest & { retestId: string }): Promise<Records>
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Durable findings and retests for a saved task. */
    'security.task.findings': { kind: 'single'; scope: 'root'; owner: SecurityConversationRequest & { assets: SecurityAsset[]; view: 'findings' | 'retests' } }
  }
}
type Props = PropsRuntime<'security.task.findings'> & PropsLocale<'security'> & InjectFace<FindingRecordsFace>
const statuses = { open: 'findingStatusOpen', 'in-progress': 'findingStatusProgress', confirmed: 'findingStatusConfirmed', fixed: 'findingStatusFixed', 'false-positive': 'findingStatusFalse', duplicate: 'findingStatusDuplicate', 'accepted-risk': 'findingStatusAccepted' } as const
const severities = { critical: 'findingSeverityCritical', high: 'findingSeverityHigh', medium: 'findingSeverityMedium', low: 'findingSeverityLow', info: 'findingSeverityInfo' } as const
const runStatuses = { running: 'findingRetestRunning', completed: 'findingRetestCompleted', failed: 'findingRetestFailed', cancelled: 'findingRetestCancelled', interrupted: 'findingRetestInterrupted' } as const
const verdicts = { reproduced: 'findingVerdictReproduced', fixed: 'findingVerdictFixed', inconclusive: 'findingVerdictInconclusive' } as const
/** Reset pending local state when switching task identity.
 * @param props - Saved task and remote operations.
 * @returns Findings or retest view.
 */
export function TaskFindingRecords(props: Props): ReactNode {
  return <RecordsContent key={JSON.stringify([props.workspaceId, props.taskId])} {...props} />
}
function Evidence({ evidence, t }: { evidence: SecurityWorkerEvidence; t: SecurityTranslate }): ReactNode {
  return <details className={css.evidence}><summary>{t('findingRecordsRaw')} · {evidence.status} · {evidence.bytes} B</summary><p>{evidence.url}</p><pre>{JSON.stringify(evidence.headers, null, 2)}</pre><pre>{evidence.body}</pre></details>
}
function RecordsContent({
  workspaceId, taskId, assets, view, t, readFindings, setFindingStatus, linkFindingDuplicate,
  startFindingRetest, cancelFindingRetest, openRetestSession,
}: Props): ReactNode {
  const [records, setRecords] = useState<Records>({ findings: [], retests: [] })
  const [selectedId, setSelectedId] = useState<string>()
  const [detail, setDetail] = useState(false)
  const [newest, setNewest] = useState(true)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState(false)
  const [actionError, setActionError] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const pending = useRef(Promise.resolve())
  const alive = useRef(true)
  const mutation = useRef(false)
  const request = useRef<{ findingId: string; notes: string; id: string }>()
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    const lifecycle = new AbortController()
    const disposed = (): boolean => lifecycle.signal.aborted
    let timer: ReturnType<typeof setTimeout> | undefined
    const read = async (): Promise<void> => {
      if (disposed()) return
      try {
        const result = await readFindings({ workspaceId, taskId })
        if (!disposed()) { setRecords(result); setError(false) }
      } catch (error) { void error; if (!disposed()) setError(true) }
      finally { if (!disposed()) { setLoading(false); timer = setTimeout(() => { pending.current = pending.current.then(read) }, 1500) } }
    }
    pending.current = pending.current.then(read)
    return () => { lifecycle.abort(); clearTimeout(timer) }
  }, [workspaceId, taskId, readFindings, refresh])
  const mutate = (action: () => Promise<Records>): void => {
    if (mutation.current) return
    mutation.current = true; setBusy(true); setActionError(undefined)
    pending.current = pending.current.then(async () => {
      try { const result = await action(); if (alive.current) { setRecords(result); setActionError(undefined) } }
      catch (error) { void error; if (alive.current) setActionError(error instanceof Error ? error.message : t('findingRecordsError')) }
      finally { mutation.current = false; if (alive.current) setBusy(false) }
    })
  }
  const groups = projectFindingGroups(records.findings)
    .sort((a, b) => newest ? b.finding.createdAt - a.finding.createdAt : a.finding.createdAt - b.finding.createdAt)
  const findings = groups.map(group => group.finding)
  const selected = groups.find(group => group.finding.id === selectedId
    || group.related.some(item => item.id === selectedId))?.finding ?? findings[0]
  const selectedIds = new Set(groups.find(group => group.finding.id === selected?.id)?.related.map(item => item.id) ?? [])
  if (selected) selectedIds.add(selected.id)
  const selectedRetests = records.retests.filter(run => selectedIds.has(run.findingId))
  const target = { workspaceId, taskId }
  const severity = (finding: SecurityFinding): ReactNode => <span className={`${css.badge} ${css[finding.severity]}`}>{t(severities[finding.severity])}</span>
  const status = (finding: SecurityFinding): ReactNode => <select aria-label={`${t('findingRecordsStatus')} · ${finding.title}`} value={finding.status} disabled={busy} onChange={(event) => { const next = Object.keys(statuses).find(value => value === event.target.value) as FindingStatus | undefined; if (next) mutate(() => setFindingStatus({ ...target, findingId: finding.id, status: next })) }}>{Object.entries(statuses).filter(([value]) => value !== 'duplicate' || finding.status === 'duplicate').map(([value, key]) => <option key={value} value={value}>{t(key)}</option>)}</select>
  const date = (at: number): string => new Date(at).toLocaleString()
  const asset = (finding: SecurityFinding): string => assets.find(item => item.id === finding.assetId)?.value ?? finding.evidence.url
  const duplicateControl = (finding: SecurityFinding): ReactNode => <label className={css.duplicateControl}>
    {t('findingRecordsDuplicateTarget')}
    <select aria-label={`${t('findingRecordsDuplicateTarget')} · ${finding.title}`} value={finding.duplicateOfFindingId ?? ''} disabled={busy} onChange={(event) => {
      const canonicalFindingId = event.target.value
      mutate(() => linkFindingDuplicate({ ...target, findingId: finding.id, ...(canonicalFindingId ? { canonicalFindingId } : {}) }))
    }}>
      <option value="">{finding.duplicateOfFindingId ? t('findingRecordsDuplicateUnlink') : t('findingRecordsDuplicateNone')}</option>
      {finding.duplicateOfFindingId && !findings.some(candidate => candidate.id === finding.duplicateOfFindingId
        && candidate.assetId === finding.assetId)
        && <option value={finding.duplicateOfFindingId}>{finding.duplicateOfFindingId}</option>}
      {findings.filter(candidate => candidate.id !== finding.id && candidate.assetId === finding.assetId && candidate.workspaceId === finding.workspaceId && candidate.taskId === finding.taskId && candidate.status !== 'duplicate' && !candidate.duplicateOfFindingId).map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}
    </select>
  </label>
  const proof = (finding: SecurityFinding): ReactNode => <div className={css.proof}><h4>{t('findingRecordsEvidence')}</h4><p>{finding.proof}</p><Evidence evidence={finding.evidence} t={t} /><h4>{t('findingRecordsRemediation')}</h4><p>{finding.remediation}</p>{duplicateControl(finding)}</div>
  const related = (finding: SecurityFinding): ReactNode => {
    const sources = groups.find(group => group.finding.id === finding.id)?.related ?? []
    return sources.length > 0 && <details className={css.related}><summary>{t('findingRecordsRelatedEvidence')} · {sources.length}</summary>{sources.map(source => <article key={source.id}>
      <h4>{source.title}</h4><p>{source.summary}</p><div className={css.meta}><span>{t('workerSpeaker')} · {source.workerRunId}</span><time>{date(source.createdAt)}</time></div>{proof(source)}
    </article>)}</details>
  }
  return <section className={css.root} aria-label={t(view)}>
    <header className={css.toolbar}><strong>{t(view)} · {findings.length}</strong><Button variant="ghost" size="sm" disabled={busy} onClick={() => { setRefresh(value => value + 1) }}><IconRefreshOutlineRegular size={14} />{t('findingRecordsRefresh')}</Button></header>
    {(error || actionError) && <p className={css.error} role="alert">{actionError ?? t('findingRecordsError')}</p>}
    {loading && <p role="status">{t('findingRecordsLoading')}</p>}
    {!loading && !findings.length && <p className={css.empty}>{t('findingRecordsEmpty')}</p>}
    {view === 'findings' && findings.length > 0 && <div className={css.findings}>
      {detail && selected ? <article className={css.fullDetail}><Button variant="ghost" size="sm" onClick={() => { setDetail(false) }}>{t('findingRecordsBack')}</Button><h3>{selected.title}</h3><p>{selected.summary}</p><div className={css.meta}>{severity(selected)}{status(selected)}<span>{asset(selected)}</span><time>{date(selected.createdAt)}</time></div>{proof(selected)}{related(selected)}</article> : <><div className={css.sort}><Button variant="ghost" size="sm" onClick={() => { setNewest(value => !value) }}>{t(newest ? 'taskFindingsNewest' : 'taskFindingsOldest')}</Button></div>{findings.map(finding => <article key={finding.id} className={css.finding}><div className={css.row}><details className={css.disclosure}><summary>{severity(finding)}<span><strong>{finding.title}</strong><small>{finding.summary}</small></span></summary>{proof(finding)}{related(finding)}</details><div className={css.rowMeta}><span className={css.asset} title={asset(finding)}>{asset(finding)}</span>{status(finding)}<time>{date(finding.createdAt)}</time><Button variant="ghost" size="sm" onClick={() => { setSelectedId(finding.id); setDetail(true) }}>{t('findingRecordsDetails')}</Button></div></div></article>)}</>}
    </div>}
    {view === 'retests' && selected && <div className={css.retests}><aside className={css.picker} aria-label={t('findingRecordsSelect')}>{findings.map(finding => <button type="button" key={finding.id} className={selected.id === finding.id ? css.selected : undefined} aria-pressed={selected.id === finding.id} onClick={() => { setSelectedId(finding.id); setNotes('') }}><strong>{finding.title}</strong><span>{severity(finding)}<span className={css.badge}>{t(statuses[finding.status])}</span></span></button>)}</aside><section className={css.history} aria-label={t('findingRecordsHistory')}><h3>{selected.title}</h3><p>{selected.summary}</p>{related(selected)}<label className={css.notes}>{t('findingRecordsNotes')}<textarea maxLength={4000} rows={2} value={notes} disabled={busy} onChange={(event) => { setNotes(event.target.value) }} /></label><Button variant="primary" size="sm" disabled={busy || records.retests.some(run => run.findingId === selected.id && run.status === 'running')} onClick={() => { if (!request.current || request.current.findingId !== selected.id || request.current.notes !== notes) request.current = { findingId: selected.id, notes, id: randomUUID() }; const accepted = request.current; mutate(async () => { const result = await startFindingRetest({ ...target, findingId: accepted.findingId, requestId: accepted.id, notes: accepted.notes }); request.current = undefined; return result }) }}>{records.retests.some(run => run.findingId === selected.id && run.status === 'running') ? <><span className={css.spinner} />{t('findingRecordsBusy')}</> : t('findingRecordsRetest')}</Button><h4>{t('findingRecordsHistory')}</h4>{!selectedRetests.length && <p>{t('findingRecordsNoHistory')}</p>}{selectedRetests.sort((a, b) => b.createdAt - a.createdAt).map(run => <article key={run.id} className={css.record}><header><strong>{run.status === 'running' && <span className={css.spinner} />}{t(runStatuses[run.status])}</strong><time>{date(run.createdAt)}</time><Button variant="ghost" size="sm" onClick={() => { openRetestSession(run.sessionId) }}>{t('findingRecordsSession')}</Button>{run.status === 'running' && <Button variant="outline" size="sm" disabled={busy} onClick={() => { mutate(() => cancelFindingRetest({ ...target, retestId: run.id })) }}>{t('findingRecordsCancel')}</Button>}</header>{run.findingId !== selected.id && <p>{records.findings.find(finding => finding.id === run.findingId)?.title}</p>}{run.verdict && <h4>{t(verdicts[run.verdict])}</h4>}{run.notes && <p>{run.notes}</p>}{run.summary && <p>{run.summary}</p>}{run.proof && <p>{run.proof}</p>}{run.error && <p className={css.error}>{run.error}</p>}{run.evidence && <Evidence evidence={run.evidence} t={t} />}</article>)}</section></div>}
  </section>
}
