/** In-memory task retest selection and history preview. */
import { useState, type ReactNode } from 'react'
import { Button, IconClockOutlineRegular, IconRefreshOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SecurityTranslate } from './presentation.tsx'
import css from './TaskRetests.module.css'

const examples = [
  { id: 'f1', title: 'taskFindingsAuthTitle', severity: 'taskRetestsHigh', target: 'admin.acme.example', time: '2026-07-28 09:30:00' },
  { id: 'f2', title: 'taskFindingsApiTitle', severity: 'taskRetestsHigh', target: 'api.acme.example', time: '2026-07-28 10:15:00' },
  { id: 'f3', title: 'taskFindingsConfigTitle', severity: 'taskRetestsMedium', target: 'www.acme.example', time: '2026-07-28 11:00:00' },
] as const

/** Render an empty retest picker or explicitly marked sample records.
 * @param props - Security dictionary and whether to show sample vulnerabilities.
 * @returns Local-only picker and sample history; no retest is ever started.
 */
export function TaskRetests({ t, sample = false }: { t: SecurityTranslate; sample?: boolean }): ReactNode {
  const [selectedId, setSelectedId] = useState<string>('f1')
  const [notice, setNotice] = useState(false)
  const selected = examples.find(item => item.id === selectedId) ?? examples[0]
  return <section className={css.root} aria-label={t('retests')}>
    <aside className={css.picker}>
      <header className={css.pickerHeader}><h3>{t('taskRetestsSelect')} · {sample ? examples.length : 0}</h3><p>{t('taskRetestsIntro')}</p></header>
      {!sample ? <div className={css.empty}><strong>{t('taskRetestsEmpty')}</strong><p>{t('taskRetestsEmptyHint')}</p></div> : <div className={css.list} role="group" aria-label={t('taskRetestsSelect')}>{examples.map(item => <button key={item.id} type="button" className={`${css.item} ${selectedId === item.id ? css.selected : ''}`} aria-pressed={selectedId === item.id} onClick={() => { setSelectedId(item.id); setNotice(false) }}><span className={css.itemMeta}><code>#{item.id}</code><span className={item.severity === 'taskRetestsHigh' ? css.high : css.medium}>{t(item.severity)}</span></span><strong>{t(item.title)}</strong><span className={css.target}>{item.target}</span></button>)}</div>}
    </aside>
    {sample && <section className={css.detail} aria-label={t('taskRetestsHistory')}>
      <header className={css.detailHeader}><div><h3>{t(selected.title)}</h3><p>{t('taskRetestsPreview')}</p></div><Button variant="outline" size="sm" onClick={() => { setNotice(true) }}><IconRefreshOutlineRegular size={14} />{t('taskRetestsStart')}</Button></header>
      <div className={css.history}>
        {notice && <p className={css.notice} role="status">{t('taskRetestsNotice')}</p>}
        <div className={css.historyHeading}><h4>{t('taskRetestsHistory')}</h4><span>1 {t('taskRetestsCount')}</span></div>
        <article className={css.record}><div className={css.recordHeading}><IconClockOutlineRegular size={16} /><h4>{t('taskRetestsHistoryTitle')}</h4><code>#{selected.id}-r1</code></div><dl><div><dt>{t('taskRetestsTarget')}</dt><dd>{selected.target}</dd></div><div><dt>{t('taskRetestsRecorded')}</dt><dd>{selected.time}</dd></div></dl><div className={css.result}><h4>{t('taskRetestsResult')}</h4><p>{t('taskRetestsResultText')}</p></div></article>
      </div>
    </section>}
  </section>
}
