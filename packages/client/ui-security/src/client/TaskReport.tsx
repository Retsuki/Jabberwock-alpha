/** Selectable report preview with an explicit Markdown clipboard action. */
import { useState, type ReactNode } from 'react'
import { Button, IconCopyOutlineRegular, IconPlanOutlineRegular, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SecurityTranslate } from './presentation.tsx'
import css from './TaskReport.module.css'
const overview = ['taskReportScope', 'taskReportSummary', 'taskReportMode'] as const
const findings = ['taskReportFinding1', 'taskReportFinding2', 'taskReportFinding3'] as const
const recommendations = ['taskReportRecommendation1', 'taskReportRecommendation2', 'taskReportRecommendation3'] as const
/** Render a sample report and copy its localized Markdown on request.
 * @param props - Owning security dictionary.
 * @returns Report headings, lists and clipboard status without generating diagnosis data.
 */
export function TaskReport({ t }: { t: SecurityTranslate }): ReactNode {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'failed'>('idle')
  const markdown = `# ${t('taskReportTitle')}\n\n## ${t('taskReportOverview')}\n${overview.map(key => `- ${t(key)}`).join('\n')}\n\n## ${t('taskReportFindings')}\n${findings.map((key, index) => `${index + 1}. ${t(key)}`).join('\n')}\n\n## ${t('taskReportRecommendations')}\n${recommendations.map(key => `- ${t(key)}`).join('\n')}\n\n> ${t('taskReportSample')}\n`
  return <section className={css.root} aria-label={t('report')}><div className={css.card}><header className={css.header}><h3><IconPlanOutlineRegular size={18} />{t('taskReportHeading')}</h3><div className={css.copyRow}><Button variant="outline" size="sm" onClick={() => { void writeClipboard(markdown).then((copied) => { setCopyStatus(copied ? 'success' : 'failed') }) }}><IconCopyOutlineRegular size={14} />{t('taskReportCopy')}</Button><span role="status" className={css.copyStatus}>{copyStatus !== 'idle' && t(copyStatus === 'success' ? 'taskReportCopied' : 'taskReportCopyFailed')}</span></div></header><article className={css.document}><h2>{t('taskReportTitle')}</h2><h3>{t('taskReportOverview')}</h3><ul>{overview.map(key => <li key={key}>{t(key)}</li>)}</ul><h3>{t('taskReportFindings')}</h3><ol>{findings.map(key => <li key={key}>{t(key)}</li>)}</ol><h3>{t('taskReportRecommendations')}</h3><ul>{recommendations.map(key => <li key={key}>{t(key)}</li>)}</ul><blockquote>{t('taskReportSample')}</blockquote></article></div></section>
}
