/** Full context and usage details in the ordinary sidebar docking surface. */
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { SessionSummary } from '../../shell/SessionSummary.tsx'
import { QuotaSummary } from './QuotaSummary.tsx'
import css from '../../shell/SidebarRight.module.css'

/** The Session scope supplies projection hooks; the tab owns no subscription. */
export function UsageBody({ useProjection, useResource, refreshQuota, t }: Pick<PropsRuntime<'sidebar.right.pane.tab'>, 'useProjection' | 'useResource'> & PropsLocale<'sidebarRight'> & InjectFace<{ refreshQuota: (engine: 'claude' | 'codex') => Promise<void> }>) {
  const model = useProjection('modelSelection')
  const provider = (model?.next ?? model?.lastUsed)?.provider
  const engine = provider === 'claude-subscription' ? 'claude' : provider === 'codex-subscription' ? 'codex' : undefined
  return <div className={css.usageBody}>
    <SessionSummary useProjection={useProjection} t={t} />
    <QuotaSummary key={engine} engine={engine} refreshQuota={refreshQuota} useResource={useResource} t={t} />
  </div>
}
