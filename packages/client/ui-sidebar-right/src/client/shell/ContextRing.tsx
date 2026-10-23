/** Composer shortcut to the active Session's context details. */
import type { ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { summaryModel } from './summary-model.ts'
import css from './SidebarRight.module.css'

/** The input seat supplies the same Session projections used by the detail panel. */
export type ContextRingProps = PropsRuntime<'conversation.input.right'> & PropsLocale<'sidebarRight'>
  & InjectFace<{ openDetails: () => void }>

/** Missing observations stay visibly unknown; a measured zero remains zero.
 * @param props Session projections, copy and the detail navigation action.
 * @returns Context usage shortcut beside the model selector.
 */
export function ContextRing({ useProjection, t, openDetails }: ContextRingProps): ReactNode {
  const { percent } = summaryModel(useProjection, t)
  const label = `${t('summary.context')}: ${percent === undefined ? '—' : `${Math.round(percent)}%`}`
  return <button type="button" className={css.contextRingButton} aria-label={`${label} · ${t('summary.openDetails')}`}
    title={label} onClick={openDetails} data-context-ring>
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.22" />
      {percent === undefined ? null : <circle cx="12" cy="12" r="9" fill="none" stroke="var(--dsw-alias-brand-primary, #3b82f6)"
        strokeWidth="3" pathLength="100" strokeDasharray={`${Math.min(100, percent)} 100`} transform="rotate(-90 12 12)" />}
    </svg>
    <span>{percent === undefined ? '—' : `${Math.round(percent)}%`}</span>
  </button>
}
