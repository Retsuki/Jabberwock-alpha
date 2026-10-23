/** Task-scoped findings preview, isolated from stored diagnostic data. */
import { useState, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { FindingDetail, FindingsTable, type SecurityTranslate } from './presentation.tsx'
import type { Finding } from './model/types.ts'
import css from './TaskFindings.module.css'

/** Render empty task findings or explicitly marked sample results.
 * @param props - dictionary and whether this sample task has findings.
 * @returns sortable findings and a read-only local detail screen.
 */
export function TaskFindings({ t, sample = false }: { t: SecurityTranslate; sample?: boolean }): ReactNode {
  const [newest, setNewest] = useState(true)
  const [selectedId, setSelectedId] = useState<string>()
  const findings: Finding[] = sample ? [
    { id: 'sample-auth', title: t('taskFindingsAuthTitle'), description: t('taskFindingsAuthDescription'), severity: 'high', target: 'admin.acme.example', status: 'confirmed', foundAt: '2026-07-26 12:50', vulnType: t('taskFindingsAuthTitle'), evidence: t('taskFindingsAuthEvidence'), impact: [t('taskFindingsAuthImpact')], fixes: [t('taskFindingsAuthFix')] },
    { id: 'sample-api', title: t('taskFindingsApiTitle'), description: t('taskFindingsApiDescription'), severity: 'high', target: 'api.acme.example', status: 'confirmed', foundAt: '2026-07-26 11:44', vulnType: t('taskFindingsApiTitle'), evidence: t('taskFindingsApiEvidence'), impact: [t('taskFindingsApiImpact')], fixes: [t('taskFindingsApiFix')] },
    { id: 'sample-config', title: t('taskFindingsConfigTitle'), description: t('taskFindingsConfigDescription'), severity: 'medium', target: 'www.acme.example', status: 'confirmed', foundAt: '2026-07-26 10:20', vulnType: t('taskFindingsConfigTitle'), evidence: t('taskFindingsConfigEvidence'), impact: [t('taskFindingsConfigImpact')], fixes: [t('taskFindingsConfigFix')] },
  ] : []
  findings.sort((left, right) => newest ? right.foundAt.localeCompare(left.foundAt) : left.foundAt.localeCompare(right.foundAt))
  const selected = findings.find(finding => finding.id === selectedId)
  return <section className={css.root} aria-label={t('taskFindingsTitle')}>
    {selected ? <div className={css.detail}><p className={css.sample} role="note">{t('taskFindingsSample')}</p><FindingDetail finding={selected} back={() => { setSelectedId(undefined) }} t={t} /></div> : <div className={css.frame}>
      <header className={css.header}><span>{t('taskFindingsTitle')}{sample ? ` · ${findings.length}` : ''}</span><Button variant="ghost" size="sm" onClick={() => { setNewest(!newest) }} aria-label={t(newest ? 'taskFindingsNewest' : 'taskFindingsOldest')}>{t('foundAt')}<span aria-hidden="true">{newest ? '↓' : '↑'}</span></Button></header>
      {sample ? <div className={css.results}><p className={css.sample} role="note">{t('taskFindingsSample')}</p><FindingsTable findings={findings} open={setSelectedId} t={t} /></div> : <p className={css.empty}>{t('taskFindingsEmpty')}</p>}
    </div>}
  </section>
}
