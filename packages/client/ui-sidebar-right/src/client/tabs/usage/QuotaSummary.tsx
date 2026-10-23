/** Account-wide subscription windows, separate from Session token counts. */
import { useState, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from '../../shell/SidebarRight.module.css'

import type { SubscriptionQuotaSnapshot as QuotaSnapshot, SubscriptionQuotaWindow } from '@deepseek-ai/dsh-subscription-engines/quota'
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface ResourceProtocolMap { 'subscription-quota': QuotaSnapshot }
}
/** Stable account-scoped resource; unrelated providers never share a value.
 * @param engine Native provider identity.
 * @returns Resource address for the provider.
 */
export function quotaAddress(engine: string): string { return `dsh-resource://subscription-quota/${engine}` }

/** Keep provider/model bucket identity while naming known rolling periods. */
function windowLabel(window: SubscriptionQuotaWindow, t: PropsLocale<'sidebarRight'>['t']): string {
  const period = window.windowDurationMins === 300 ? t('quota.fiveHours') : window.windowDurationMins === 10080 ? t('quota.weekly') : undefined
  if (period === undefined) return window.label
  return window.id === 'five_hour' || window.id === 'seven_day' ? period : `${window.label} · ${period}`
}

/** Show only windows actually returned by the connected provider.
 * @param props Provider, resource reader, refresh action and localized copy.
 * @returns Account limits card.
 */
export function QuotaSummary({ engine, useResource, refreshQuota, t }: Pick<PropsRuntime<'sidebar.right.pane.tab'>, 'useResource'> & PropsLocale<'sidebarRight'> & { engine: string | undefined; refreshQuota?: (engine: 'claude' | 'codex') => Promise<void> }): ReactNode {
  const [pending, setPending] = useState(false)
  const [refreshFailed, setRefreshFailed] = useState(false)
  const state = useResource<'subscription-quota'>(quotaAddress(engine ?? 'unsupported'))
  const snapshot = state.value
  const available = snapshot?.status === 'ready' && snapshot.engine === engine
  return <details open className={css.summary} aria-label={t('quota.title')} data-account-quota>
    <summary className={css.summaryRow}><span className={css.summaryHeading}>{t('quota.title')}</span>
      <Button variant="outline" size="sm" disabled={pending || state.status === 'loading' || (engine !== 'claude' && engine !== 'codex')}
        onClick={() => { if ((engine !== 'claude' && engine !== 'codex') || refreshQuota === undefined) return; setPending(true); setRefreshFailed(false); void refreshQuota(engine).catch(() => { setRefreshFailed(true) }).finally(() => { setPending(false) }) }}>{t('quota.refresh')}</Button></summary>
    <div className={css.summaryMuted}>{t('quota.accountScope')}</div>
    {!available ? <div className={css.summaryMuted}>{state.status === 'loading' ? t('quota.loading') : t('quota.unavailable')}</div>
      : snapshot.windows.length === 0 ? <div className={css.summaryMuted}>{t('quota.unavailable')}</div>
        : snapshot.windows.map(window => <div key={window.id} className={css.summarySection}>
          <div className={css.summaryRow}><span>{windowLabel(window, t)}</span>
            <strong>{window.usedPercent === null ? '—' : `${Math.round(window.usedPercent)}%`}</strong></div>
          {window.usedPercent === null ? null : <progress className={css.summaryProgress}
            value={Math.min(100, Math.max(0, window.usedPercent))} max={100} aria-label={window.label} />}
          <div className={css.summaryRow}><span>{t('quota.remaining')}</span>
            <span>{window.usedPercent === null ? '—' : `${Math.round(Math.max(0, 100 - window.usedPercent))}%`}</span></div>
          <div className={css.summaryMuted}>{t('quota.resets')} {window.resetsAt === null ? '—' : new Date(window.resetsAt).toLocaleString()}</div>
        </div>)}
    {(state.status === 'failed' || refreshFailed) && available ? <div role="status" className={css.summaryMuted}>{t('quota.stale')}</div> : null}
    {refreshFailed && !available ? <div role="status" className={css.summaryMuted}>{t('quota.unavailable')}</div> : null}
    {snapshot !== undefined && snapshot.engine === engine ? <div className={css.summaryMuted}>{t('summary.updated')} {new Date(snapshot.fetchedAt).toLocaleTimeString()}</div> : null}
  </details>
}
