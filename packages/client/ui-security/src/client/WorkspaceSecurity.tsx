/** One workspace-scoped security destination; section navigation lives in the page. */
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SecurityNavigation } from './navigation.ts'
import { SecurityIcon } from './SecurityIcon.tsx'
import css from './WorkspaceSecurity.module.css'

type Props = PropsRuntime<'sidebar.workspaces.project.children'> & PropsLocale<'security'> & InjectFace<SecurityNavigation>
/** Open the security page without starting any scan or model. */
export function WorkspaceSecurity({ workspaceId, displayTitle, t, useSecuritySelection, usePanelInfo, openSecurity }: Props) {
  const selected = useSecuritySelection(value => value)
  const active = usePanelInfo(info => info.activePanelId === ('security' as MainPanelId))
  return <div className={css.navigation} onClick={(event) => { event.stopPropagation() }}>
    <Button className={css.toggle} size="sm" aria-current={active && selected?.workspaceId === workspaceId ? 'page' : undefined}
      onClick={() => { openSecurity(workspaceId, displayTitle, 'assets') }}><SecurityIcon size={14} /><span>{t('title')}</span></Button>
  </div>
}
