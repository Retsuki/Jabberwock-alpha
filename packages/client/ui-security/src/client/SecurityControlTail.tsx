/** Explicit task links attached to the main chat's completed response. */
import { useState } from 'react'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SecurityControlTarget } from './control-navigation.ts'
import { securityControlTargets } from './control-navigation.ts'

/** Root callback revalidates access and pending edits before changing the selected task. */
export interface SecurityControlNavigation {
  openSecurityTask(this: void, workspaceId: SecurityControlTarget['workspaceId'], taskId: string, view: SecurityControlTarget['view']): Promise<void>
}
/** Render recorded successful open actions; no result triggers navigation automatically. */
export function SecurityControlTail({ turn, seq, t, openSecurityTask }: PropsRuntime<'conversation.chat.turnTail'> & PropsLocale<'security'> & InjectFace<SecurityControlNavigation>) {
  const [opening, setOpening] = useState<string>()
  const [failed, setFailed] = useState<string>()
  const targets = securityControlTargets(turn.data.get('securityControl') ?? [], seq)
  if (!targets.length) return null
  return <div>{targets.map((target) => {
    const id = `${target.workspaceId}:${target.taskId}:${target.view}`
    return <div key={id}><Button variant="outline" disabled={opening !== undefined}
      onClick={() => {
        setOpening(id); setFailed(undefined)
        void openSecurityTask(target.workspaceId, target.taskId, target.view)
          .catch(() => { setFailed(id) }).finally(() => { setOpening(undefined) })
      }}>
      {t(opening === id ? 'controlOpening' : 'controlOpenTask')}: {target.taskId}
    </Button>{failed === id && <p role="alert">{t('controlOpenFailed')}</p>}</div>
  })}</div>
}
