/** Evidence-first report of public dependency advisory matches. */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { SupplyChainActions } from './SupplyChainChat.tsx'
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SupplyChainFinding, SupplyChainRun } from '../supply-chain-types.ts'
import type { SecurityKey } from './locales.ts'
import type { SecurityTranslate } from './presentation.tsx'
import css from './TaskExecutiveReport.module.css'
import local from './SupplyChain.module.css'

function sourceUrl(value: string): string | undefined {
  try { const url = new URL(value); return (url.origin === 'https://github.com' && url.pathname.startsWith('/advisories/')
    || url.origin === 'https://www.npmjs.com' && url.pathname.startsWith('/advisories/')) && !url.username && !url.password ? url.href : undefined }
  catch (_error: unknown) { return undefined }
}
function overview(finding: SupplyChainFinding): string | undefined {
  return finding.description?.replace(/```[\s\S]*?```/g, '').split(/\n\s*\n/).find(paragraph => paragraph.trim() && !paragraph.trim().startsWith('#'))?.trim().slice(0, 2000)
}
function date(value: string | undefined, missing: string): string {
  if (value === undefined || !Number.isFinite(Date.parse(value))) return missing
  return new Date(value).toLocaleDateString()
}
function severity(finding: SupplyChainFinding, t: SecurityTranslate): ReactNode {
  const keys: Partial<Record<string, SecurityKey>> = { critical: 'findingSeverityCritical', high: 'findingSeverityHigh', moderate: 'findingSeverityMedium', low: 'findingSeverityLow', info: 'findingSeverityInfo', unknown: 'supplyChainUnknownValue' } as const
  return <Tag tone={finding.severity === 'critical' || finding.severity === 'high' ? 'danger' : finding.severity === 'moderate' ? 'warning' : 'neutral'}>{t(keys[finding.severity] ?? 'supplyChainUnknownValue')}</Tag>
}
/** Render public facts separately from unverified project reachability and deployment conditions.
 * @param props - persisted scanner snapshot and dictionary.
 * @returns vertically scrolling summary, advisory table and evidence details.
 */
export function SupplyChainReport({ run, t, repairSupplyChain }: { run: SupplyChainRun; t: SecurityTranslate } & Pick<SupplyChainActions, 'repairSupplyChain'>): ReactNode {
  const missing = t('supplyChainUnknownValue')
  const [requesting, setRequesting] = useState(false)
  const [error, setError] = useState(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const pending = useRef(false)
  const request = useRef<{ key: string; id: string }>()
  const repairing = run.repair?.status === 'running'
  const repairableRun = !run.repair?.applied && Boolean(run.inputDigest) && run.status === 'completed' && run.lockfile?.scope === 'project'
  const eligible = (finding: SupplyChainFinding): boolean => repairableRun && finding.relationship === 'direct' && finding.fixStatus === 'available' && Boolean(finding.fixedVersion)
  const repair = (packages?: string[]): void => {
    if (!repairSupplyChain || pending.current || repairing || run.status === 'running') return
    const key = packages?.join(',') ?? '*'
    if (request.current?.key !== key) request.current = { key, id: randomUUID() }
    pending.current = true; setRequesting(true); setError(false)
    void repairSupplyChain({ workspaceId: run.workspaceId, runId: run.runId,
      requestId: request.current.id, ...(packages ? { packages } : {}) })
      .then(() => { request.current = undefined }).catch(() => { if (mounted.current) setError(true) })
      .finally(() => { pending.current = false; if (mounted.current) setRequesting(false) })
  }
  const disabled = requesting || repairing || run.status === 'running'

  return <article className={css.root} aria-label={t('supplyChainReport')}>
    <header className={css.cover}><div><h2>{t('supplyChainTitle')}</h2><p>{t('supplyChainCountNote')}</p></div></header>
    <section className={css.section}><h3>{t('supplyChainSummary')}</h3>
      <dl className={css.stats}><div className={css.card}><dt>{t('supplyChainChecked')}</dt><dd>{run.checkedPackages}</dd></div><div className={css.card}><dt>{t('supplyChainMatches')}</dt><dd>{run.findings.length}</dd></div></dl>
      <p className={css.notice}>{run.status !== 'completed' ? t('supplyChainPartial') : t('supplyChainUnverified')}</p>
    </section>
    <section className={css.section}><h3>{t('supplyChainScope')}</h3><dl className={css.scope}>
      <dt>{t('supplyChainLockfile')}</dt><dd>{run.lockfile?.path ?? missing}</dd>
      <dt>{t('supplyChainScope')}</dt><dd>{run.lockfile === undefined ? missing : t(run.lockfile.scope === 'workspace' ? 'supplyChainWorkspaceScope' : 'supplyChainProjectScope')}</dd>
    </dl></section>
    <section className={css.section}><h3>{t('supplyChainFindings')}</h3>
      {repairSupplyChain && <><p className={css.notice}>{t('supplyChainRepairNote')}</p>{!repairableRun && <p className={css.notice}>{t('supplyChainRepairNeedsScan')}</p>}<div className={local.repairActions}><Button variant="primary" disabled={disabled || !run.findings.some(eligible)} onClick={() => { repair() }}>{t(repairing || requesting ? 'supplyChainRepairRunning' : 'supplyChainRepairAll')}</Button></div></>}
      {error && <p role="alert">{t('supplyChainRepairFailed')}</p>}
      {run.repair && <section className={css.card}><h4>{t('supplyChainRepairResult')}</h4><p role="status">{t(repairStatusKeys[run.repair.status])} · {run.repair.message}</p><p>{t('supplyChainRepairUnverified')}</p>
        {run.repair.changes.map(change => <p key={change.package}>{change.package}: {change.from} → {change.to}</p>)}
        {run.repair.warnings.map((warning, index) => <p key={index}>{warning}</p>)}
        {run.repair.recoveryPath && <p>{run.repair.recoveryPath}</p>}
        {run.repair.resultRunId && <p>{t('supplyChainRepairRecheck')} <code>{run.repair.resultRunId}</code></p>}
        {run.repair.files.map(file => <details className={local.repairFiles} key={file.path}><summary>{t('supplyChainRepairFiles')} · {file.path}</summary><pre>{file.diff}</pre></details>)}
      </section>}

      {run.findings.length === 0 ? <p>{run.status === 'completed' ? t('supplyChainNoMatches') : t('supplyChainPartial')}</p> : <div className={`${css.tableWrap} ${local.table}`}><table><thead><tr>
        <th>{t('supplyChainPackage')}</th><th>{t('supplyChainSeverity')}</th><th>{t('supplyChainFix')}</th><th>{t('supplyChainPublished')}</th><th>{t('supplyChainUpdated')}</th>
      </tr></thead><tbody>{run.findings.map((finding, index) => <tr key={index}><td><strong>{finding.package}</strong><small>{finding.version}</small><small>{finding.title}</small><small>{sourceUrl(finding.advisoryUrl) ? <a href={sourceUrl(finding.advisoryUrl)} target="_blank" rel="noopener noreferrer">{finding.ghsaId ?? t('supplyChainSources')}</a> : finding.cveIds.join(', ')}</small></td><td>{severity(finding, t)}</td><td>{finding.fixStatus === 'available' ? finding.fixedVersion ?? missing : finding.fixStatus === 'unavailable' ? t('supplyChainNoFix') : missing}{repairSupplyChain && (eligible(finding) ? <div className={local.repairActions}><Button variant="outline" size="sm" aria-label={`${t('supplyChainRepair')} · ${finding.package}`} disabled={disabled} onClick={() => { repair([finding.package]) }}>{t('supplyChainRepair')}</Button></div> : <small>{t(run.repair?.applied ? 'supplyChainRepairApplied' : 'supplyChainRepairUnsupported')}</small>)}</td><td>{date(finding.publishedAt, missing)}</td><td>{date(finding.updatedAt, missing)}</td></tr>)}</tbody></table></div>}
      {run.findings.map((finding, index) => {
        const url = sourceUrl(finding.advisoryUrl)
        return <details className={css.scenario} key={index}><summary><strong>{finding.package}@{finding.version}</strong> · {finding.title} · {t('supplyChainDetails')}</summary>
          <h4>{t('supplyChainIssue')}</h4><p className={css.preserve}>{finding.title}</p>
          <h4>{t('supplyChainGeneralImpact')}</h4><p className={css.preserve}>{overview(finding) ?? t('supplyChainGeneralUnknown')}</p>
          <h4>{t('supplyChainProjectImpact')}</h4><p>{t('supplyChainProjectFact', { package: finding.package, version: finding.version })}</p><p>{t('supplyChainUnverified')}</p>
          <dl className={css.scope}><dt>{t('supplyChainAffected')}</dt><dd>{finding.vulnerableRange || missing}</dd><dt>{t('supplyChainRelation')}</dt><dd>{t(relationKeys[finding.relationship] ?? 'supplyChainUnknownValue')} / {t(environmentKeys[finding.environment] ?? 'supplyChainUnknownValue')}</dd>
            <dt>{t('supplyChainCvss')}</dt><dd>{finding.cvssScore ?? missing}<p>{finding.cvssVector ?? missing}</p><p>{finding.cweIds.length ? finding.cweIds.join(', ') : missing}</p></dd>
            <dt>{t('supplyChainSources')}</dt><dd>{url ? <a href={url} target="_blank" rel="noopener noreferrer">{finding.ghsaId ?? finding.advisoryUrl}</a> : missing}<p>{finding.cveIds.join(', ')}</p></dd></dl>
        </details>
      })}
    </section>
    <section className={css.section}><h3>{t('supplyChainLimitations')}</h3><p>{t('supplyChainUnverified')}</p>{run.warnings.map((warning, index) => <p className={css.notice} key={index}>{warning}</p>)}<p className={css.muted}>{t('supplyChainDisclosure')}</p></section>
  </article>
}
const relationKeys: Partial<Record<string, SecurityKey>> = { direct: 'supplyChainDirect', transitive: 'supplyChainTransitive', shared: 'supplyChainShared', unknown: 'supplyChainUnknownValue' } as const
const environmentKeys: Partial<Record<string, SecurityKey>> = { production: 'supplyChainProduction', development: 'supplyChainDevelopment', shared: 'supplyChainShared', unknown: 'supplyChainUnknownValue' } as const

export const repairStatusKeys = { running: 'supplyChainRepairRunning', completed: 'supplyChainRepairCompleted', incomplete: 'supplyChainRepairIncomplete', failed: 'supplyChainRepairFailedState', cancelled: 'supplyChainRepairCancelled', stale: 'supplyChainRepairStale', unsupported: 'supplyChainRepairUnsupportedState', interrupted: 'supplyChainRepairInterrupted' } as const
