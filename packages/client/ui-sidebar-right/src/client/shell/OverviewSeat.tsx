/** Persistent context panel beside the conversation, outside the detail dock. */
import type { ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { createSidebarRightStore } from '../stores.ts'
import { UsageBody } from '../tabs/usage/UsageBody.tsx'
import css from './SidebarRight.module.css'

/** Same Session store as the detailed sidebar and its header expand control. */
export type OverviewSeatProps = PropsRuntime<'conversation.overview'>
  & PropsStore<ReturnType<typeof createSidebarRightStore>>
  & PropsLocale<'sidebarRight'>
  & InjectFace<{ refreshQuota: (engine: 'claude' | 'codex') => Promise<void> }>

/** Show the context panel whenever the detailed sidebar is collapsed.
 * @param props Session measurements, display state and account refresh action.
 * @returns The persistent panel or no second panel when the dock is expanded.
 */
export function OverviewSeat({ sessionId, useStore, useProjection, useResource, refreshQuota, t }: OverviewSeatProps): ReactNode {
  const expanded = useStore(state => state.bySession[sessionId]?.layout.expanded ?? false)
  if (expanded) return null
  return <aside className={css.overviewCard} data-sidebar-right-overview aria-label={t('summary.detailsTitle')}>
    <UsageBody useProjection={useProjection} useResource={useResource} refreshQuota={refreshQuota} t={t} />
  </aside>
}
