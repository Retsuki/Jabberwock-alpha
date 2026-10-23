/** Shared evidence, table and status presentation for security views. */
import type { ReactNode } from 'react'
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { Finding } from './model/types.ts'
import type { SecurityKey } from './locales.ts'
import css from './SecurityPage.module.css'
/** Typed security translation face. */
export type SecurityTranslate = TranslateNS<'security'>

/** Render a localized stored status without treating sample text as a translation key.
 * @param props - persisted status and the owning dictionary.
 * @returns read-only status tag.
 */
export function Status({ value, t }: { value: string; t: SecurityTranslate }): ReactNode {
  const keys: Record<string, SecurityKey> = {
    critical: 'critical', high: 'high', medium: 'medium', low: 'low', open: 'open', confirmed: 'confirmed', resolved: 'resolved',
    pending: 'pending', running: 'running', paused: 'paused', completed: 'completed', stopped: 'stopped', idle: 'idle', done: 'done',
    todo: 'todo', doing: 'doing', review: 'review', untested: 'untested', testing: 'testing', tested: 'tested', approved: 'approved',
    rejected: 'rejected', waiting: 'waiting', failed: 'failed', finished: 'finished', reproduced: 'reproduced', fixed: 'fixed',
    inconclusive: 'inconclusive', allow: 'allow', deny: 'deny', achieved: 'achieved', main: 'main', worker: 'worker',
    url: 'url', domain: 'domain', ip: 'ip', cidr: 'cidr',
  }
  const key = keys[value]
  return <Tag tone={value === 'critical' || value === 'high' ? 'danger' : 'neutral'}>{key ? t(key) : value}</Tag>
}

/** Findings table used by both the project and one diagnostic.
 * @param props - scoped findings and detail navigation.
 * @returns searchable parent-owned table rows.
 */
export function FindingsTable({ findings, open, t }: { findings: Finding[]; open: (id: string) => void; t: SecurityTranslate }): ReactNode {
  return <div className={css.tableWrap}><table className={css.table}>
    <thead><tr><th>{t('name')}</th><th>{t('severity')}</th><th>{t('target')}</th><th>{t('status')}</th></tr></thead>
    <tbody>{findings.map(finding => <tr key={finding.id}>
      <td><Button onClick={() => { open(finding.id) }}>{finding.title}</Button></td>
      <td><Status value={finding.severity} t={t} /></td><td>{finding.target}</td><td><Status value={finding.status} t={t} /></td>
    </tr>)}</tbody>
  </table>{findings.length === 0 && <p className={css.empty}>{t('empty')}</p>}</div>
}

/** Read-only evidence and remediation detail from the migrated prototype.
 * @param props - selected finding and return action.
 * @returns finding detail; no diagnosis is executed.
 */
export function FindingDetail({ finding, back, t }: { finding: Finding; back: () => void; t: SecurityTranslate }): ReactNode {
  return <section className={css.stack}>
    <Button onClick={back}>{t('back')}</Button><h2>{finding.title}</h2>
    <div className={css.toolbar}><Status value={finding.severity} t={t} /><Status value={finding.status} t={t} />
      <span>{finding.target}</span></div>
    <p>{finding.description}</p>
    <div className={css.cards}><article className={css.card}><h3>{t('vulnType')}</h3><p>{finding.vulnType}</p></article>
      <article className={css.card}><h3>{t('foundAt')}</h3><p>{finding.foundAt}</p></article></div>
    <article className={css.card}><h3>{t('evidence')}</h3><pre className={css.pre}>{finding.evidence || t('empty')}</pre></article>
    <div className={css.cards}><article className={css.card}><h3>{t('impact')}</h3><ul>{finding.impact.map(item => <li key={item}>{item}</li>)}</ul></article>
      <article className={css.card}><h3>{t('fixes')}</h3><ul>{finding.fixes.map(item => <li key={item}>{item}</li>)}</ul></article></div>
  </section>
}
