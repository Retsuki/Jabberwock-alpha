/** Task approval history preview without decision or execution services. */
import { useState, type ReactNode } from 'react'
import { Button, IconRefreshOutlineRegular, IconPlanOutlineRegular, IconChevronRightOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SecurityTranslate } from './presentation.tsx'
import css from './TaskApprovals.module.css'
const records = [
  { id: 'approval-1', title: 'taskApprovalsRequestOne', status: 'allowed', source: 'rule', context: 'taskApprovalsContextOne', reason: 'taskApprovalsReasonOne', request: 'workspace.read · config.json', time: '2026-07-28 07:10:00' },
  { id: 'approval-2', title: 'taskApprovalsRequestTwo', status: 'blocked', source: 'model', context: 'taskApprovalsContextTwo', reason: 'taskApprovalsReasonTwo', request: 'workspace.export · outside-scope', time: '2026-07-28 07:11:00' },
] as const
/** Display filters, empty history and optional sample decisions.
 * @param props - Owning localized security dictionary.
 * @returns Locally filtered preview records; no approval operation is exposed.
 */
export function TaskApprovals({ t }: { t: SecurityTranslate }): ReactNode {
  const [sample, setSample] = useState(false)
  const [status, setStatus] = useState('all')
  const [source, setSource] = useState('all')
  const [pageSize, setPageSize] = useState('20')
  const [expanded, setExpanded] = useState<string[]>([])
  const [refreshed, setRefreshed] = useState(false)
  const rows = sample ? records.filter(record => (status === 'all' || record.status === status) && (source === 'all' || record.source === source)) : []
  return <section className={css.root} aria-label={t('taskApprovalsTitle')}>
    <div className={css.heading}><h3><IconPlanOutlineRegular size={19} />{t('taskApprovalsTitle')}</h3><Button size="sm" variant="outline" onClick={() => { setRefreshed(true) }}><IconRefreshOutlineRegular size={14} />{t('taskApprovalsRefresh')}</Button></div>
    <p className={css.intro}>{t('taskApprovalsIntro')}</p>
    <div className={css.filters}><label>{t('taskApprovalsStatus')}<select value={status} onChange={(event) => { setStatus(event.target.value) }}><option value="all">{t('taskApprovalsAllStatus')}</option><option value="allowed">{t('taskApprovalsAllowed')}</option><option value="blocked">{t('taskApprovalsBlocked')}</option></select></label><label>{t('taskApprovalsSource')}<select value={source} onChange={(event) => { setSource(event.target.value) }}><option value="all">{t('taskApprovalsAllSource')}</option><option value="rule">{t('taskApprovalsRule')}</option><option value="model">{t('taskApprovalsModel')}</option></select></label><label className={css.sampleSwitch}><input type="checkbox" checked={sample} onChange={(event) => { setSample(event.target.checked) }} />{t('taskApprovalsSamples')}</label></div>
    {refreshed && <p className={css.notice} role="status">{t('taskApprovalsRefreshed')}</p>}
    <div className={css.card}><header className={css.cardHeader}>{t('taskApprovalsRecords')} ({rows.length})</header>{rows.length === 0 ? <div className={css.empty}><span className={css.emptyIcon}><IconPlanOutlineRegular size={20} /></span><strong>{t('taskApprovalsEmpty')}</strong><p>{t('taskApprovalsEmptyHint')}</p></div> : <div className={css.records}>{rows.map((record) => { const open = expanded.includes(record.id); return <article key={record.id} className={css.record}><button className={css.recordButton} type="button" aria-expanded={open} aria-controls={record.id} onClick={() => { setExpanded(open ? expanded.filter(id => id !== record.id) : [...expanded, record.id]) }}><IconChevronRightOutlineRegular size={14} className={open ? css.rotate : undefined} /><strong>{t(record.title)}</strong><span className={`${css.status} ${css[record.status]}`}>{t(record.status === 'allowed' ? 'taskApprovalsAllowed' : 'taskApprovalsBlocked')}</span><span className={css.source}>{t(record.source === 'rule' ? 'taskApprovalsRule' : 'taskApprovalsModel')}</span><time>{record.time}</time></button><div hidden={!open} id={record.id} className={css.detail}><dl>{([['taskApprovalsRequest', record.request], ['taskApprovalsContext', t(record.context)], ['taskApprovalsReason', t(record.reason)], ['taskApprovalsResult', t('taskApprovalsResultText')]] as const).map(([key, value]) => <div key={key}><dt>{t(key)}</dt><dd>{value}</dd></div>)}</dl></div></article> })}<p className={css.sampleNote}>{t('taskApprovalsSample')}</p></div>}<footer className={css.footer}><select aria-label={t('taskApprovalsPerPage')} value={pageSize} onChange={(event) => { setPageSize(event.target.value) }}>{['20', '50', '100'].map(value => <option key={value}>{value}</option>)}</select><span>{t('taskApprovalsPerPage')} · {t('taskApprovalsTotal')} {rows.length}</span></footer></div>
  </section>
}
