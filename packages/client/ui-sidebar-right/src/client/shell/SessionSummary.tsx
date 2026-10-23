/** Session-local context and usage, independent from preview tabs. */
import type { ReactNode } from 'react'
import type { UseProjection } from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-token-meter/client'
import type { SidebarRightKey } from '../locales.ts'
import { summaryModel } from './summary-model.ts'
import css from './SidebarRight.module.css'

/** Compact counter; zero remains distinct from an unavailable measurement. */
function count(value: number): string {
  return value >= 1_000_000 ? `${Math.round(value / 100_000) / 10}M`
    : value >= 1_000 ? `${Math.round(value / 100) / 10}K` : String(value)
}

/** Render only native observations belonging to the currently selected route. */
export function SessionSummary({ useProjection, t, variant = 'full' }: {
  useProjection: UseProjection
  variant?: 'compact' | 'full'
  t: (key: SidebarRightKey) => string
}): ReactNode {
  const { selected, native, matched, context, used, maximum, percent, tokens, rows } = summaryModel(useProjection, t)
  const supplementalKinds = ['free', 'buffer', 'deferred']
  const usedRows = rows?.filter(row => !supplementalKinds.includes(row.kind ?? ''))
  const supplementalRows = rows?.filter(row => supplementalKinds.includes(row.kind ?? ''))
  const remaining = used === undefined || maximum === undefined ? undefined : Math.max(0, maximum - used)
  const providerName = selected?.provider === 'codex-subscription' ? 'Codex' : selected?.provider === 'claude-subscription' ? 'Claude' : selected?.provider
  const modelName = selected?.model === 'default' ? matched?.model ?? selected.model : selected?.model
  const reading = used === undefined ? t('summary.waiting')
    : `${context?.estimated ? '~' : ''}${count(used)}${maximum === undefined ? '' : ` / ${count(maximum)}`}`
  if (variant === 'compact') return <span className={css.summaryCompact}>
    <span className={css.summaryHeading}>{t('summary.title')}</span>
    <span className={css.summaryModel}>{providerName ?? t('summary.noModel')}{modelName === undefined ? '' : ` / ${modelName}`}</span>
    <span className={css.summarySection}>
      <span className={css.summaryRow}><span>{t('summary.context')}</span><strong>{percent === undefined ? reading : `${Math.round(percent)}%`}</strong></span>
      {percent === undefined ? null : <span className={css.summaryMuted}>{reading}</span>}
    </span>
    <span className={css.summarySection}>
      <span className={css.summaryHeading}>{t('summary.compactUsage')}</span>
      {tokens === undefined ? <span className={css.summaryMuted}>{t('summary.waiting')}</span> : <>
        <span className={css.summaryRow}><span>{t('summary.input')}</span><span>{count(tokens.inputTokens)}</span></span>
        <span className={css.summaryRow}><span>{t('summary.output')}</span><span>{count(tokens.outputTokens)}</span></span>
      </>}
    </span>
  </span>
  return <details open className={css.summary} aria-label={t('summary.title')}>
    <summary className={css.summaryHeading}>{t('summary.title')}</summary>
    <div className={css.summaryModel}>{selected === undefined || selected === null ? t('summary.noModel') : `${providerName} / ${modelName}`}</div>
    <div className={css.summarySection}>
      <div className={css.summaryRow}><span>{t('summary.context')}</span><strong>{percent === undefined ? reading : `${Math.round(percent)}%`}</strong></div>
      {percent === undefined ? null : <progress className={css.summaryProgress} value={Math.min(100, percent)} max={100} aria-label={t('summary.context')} />}
      {percent === undefined ? null : <div className={css.summaryMuted}>{reading}</div>}
      {remaining === undefined ? null : <div className={css.summaryRow}><span>{t('summary.remaining')}</span><span>{count(remaining)}</span></div>}
      {context?.estimated || (!native && rows !== undefined) ? <div className={css.summaryMuted}>{t('summary.estimated')}</div> : null}
      {usedRows === undefined ? null : <dl className={css.summaryRows}>{usedRows.map(row => <div key={row.name} className={css.summaryRow}>
        <dt>{row.name}</dt><dd>{native && context?.estimated !== true ? '' : '~'}{count(row.tokens)}</dd>
      </div>)}</dl>}
      {supplementalRows === undefined || supplementalRows.length === 0 ? null : <details className={css.summaryDetails}>
        <summary className={css.summaryMuted}>{t('summary.supplemental')}</summary>
        <dl className={css.summaryRows}>{supplementalRows.map(row => <div key={row.name} className={css.summaryRow}>
          <dt>{row.name} <span className={css.summaryMuted}>({row.kind === 'free' ? t('summary.free') : row.kind === 'buffer' ? t('summary.buffer') : t('summary.deferred')})</span></dt>
          <dd>{context?.estimated ? '~' : ''}{count(row.tokens)}</dd>
        </div>)}</dl>
      </details>}
    </div>
    <details className={`${css.summarySection} ${css.summaryDetails}`}>
      <summary className={css.summaryHeading}>{t(native ? 'summary.latestUsage' : 'summary.totalUsage')}</summary>
      {tokens === undefined ? <div className={css.summaryMuted}>{t('summary.waiting')}</div> : <dl className={css.summaryRows}>
        <div className={css.summaryRow}><dt>{t('summary.input')}</dt><dd>{count(tokens.inputTokens)}</dd></div>
        <div className={css.summaryRow}><dt>{t('summary.output')}</dt><dd>{count(tokens.outputTokens)}</dd></div>
        {tokens.cacheReadTokens === undefined ? null : <div className={css.summaryRow}><dt>{t('summary.cacheRead')}</dt><dd>{count(tokens.cacheReadTokens)}</dd></div>}
        {tokens.cacheWriteTokens === undefined ? null : <div className={css.summaryRow}><dt>{t('summary.cacheWrite')}</dt><dd>{count(tokens.cacheWriteTokens)}</dd></div>}
      </dl>}
    </details>
    {matched === undefined ? null : <div className={css.summaryMuted}>{t('summary.updated')} {new Date(matched.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>}
  </details>
}
