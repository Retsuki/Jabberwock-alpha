/** Scanner progress and saved results render inside an ordinary chat without model text. */
import { useState, type ReactNode } from 'react'
import { Button, Tag, IconLoadingOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SupplyChainCancelRequest, SupplyChainRepairRequest, SupplyChainRun } from '../supply-chain-types.ts'
import type { SecurityKey } from './locales.ts'
import type { SecurityTranslate } from './presentation.tsx'
import { SupplyChainReport, repairStatusKeys } from './SupplyChainReport.tsx'
import css from './TaskExecutiveReport.module.css'
import local from './SupplyChain.module.css'

/** Authorized owner commands; cancellation does not imply a new scan or retry. */
export interface SupplyChainActions {
  repairSupplyChain?: ((request: SupplyChainRepairRequest) => Promise<SupplyChainRun>) | undefined
  cancelSupplyChain(this: void, request: SupplyChainCancelRequest): Promise<void>
}
/** Render the keyed persisted event using the ordinary conversation's identity. */
export function SupplyChainChat({ node, sessionId, t, cancelSupplyChain, repairSupplyChain }:
PropsRuntime<'conversation.chat.node', 'security-supply-chain'> & PropsLocale<'security'> & InjectFace<SupplyChainActions>): ReactNode {
  return <SupplyChainCard run={node.data} t={t} canCancel={node.data.sessionId === sessionId}
    cancelSupplyChain={cancelSupplyChain} repairSupplyChain={repairSupplyChain} />
}
/** Present live scanner facts and a locally expandable saved report.
 * @param props - recorded state, dictionary and authorized cancellation callback.
 * @returns progress, terminal explanation and evidence report.
 */
export function SupplyChainCard({ run, t, cancelSupplyChain, repairSupplyChain, canCancel }: {
  run: SupplyChainRun
  t: SecurityTranslate
  canCancel: boolean
} & SupplyChainActions): ReactNode {
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState(false)
  const running = run.status === 'running' || run.repair?.status === 'running'
  return <section className={`${css.root} ${local.root}`} aria-label={t('supplyChainTitle')} id={`supply-chain-${encodeURIComponent(run.runId)}`} data-supply-chain-run={run.runId}>
    <header className={css.cover}><div><h2>{t('supplyChainTitle')}</h2><p>{t('supplyChainDisclosure')}</p></div>
      <Tag tone={run.status === 'failed' ? 'danger' : running ? 'outline' : 'neutral'}>{t(run.repair ? repairStatusKeys[run.repair.status] : statusKeys[run.status] ?? 'supplyChainUnknown')}</Tag>
      {running && canCancel && <Button variant="outline" size="sm" disabled={stopping} onClick={() => {
        setStopping(true); setError(false)
        void cancelSupplyChain({ workspaceId: run.workspaceId, runId: run.runId })
          .catch(() => { setError(true) }).finally(() => { setStopping(false) })
      }}>{t(stopping ? 'supplyChainStopping' : run.repair?.status === 'running' ? 'supplyChainRepairStop' : 'supplyChainStop')}</Button>}
    </header>
    <p role="status" className={local.progress}>{running && <IconLoadingOutlineRegular className={local.spinner} />}<span>{t(run.repair?.status === 'running' ? 'supplyChainRepairRunning' : phaseKeys[run.phase] ?? 'supplyChainUnknown')} · {run.repair?.status === 'running' ? run.repair.message : run.message}</span></p>
    {error && <p role="alert" className={css.notice}>{t('supplyChainStopFailed')}</p>}
    {!running && <p className={css.notice}>{t(run.status === 'completed' ? 'supplyChainCountNote' : 'supplyChainPartial')}</p>}
    <details className={css.card} open={run.status !== 'running'}><summary>{t('supplyChainReport')} · {run.findings.length}</summary><SupplyChainReport run={run} t={t} repairSupplyChain={canCancel ? repairSupplyChain : undefined} /></details>
  </section>
}
const statusKeys: Partial<Record<string, SecurityKey>> = { running: 'supplyChainRunning', completed: 'supplyChainCompleted', incomplete: 'supplyChainIncomplete', failed: 'supplyChainFailed', cancelled: 'supplyChainCancelled', interrupted: 'supplyChainInterrupted' } as const
const phaseKeys: Partial<Record<string, SecurityKey>> = { lockfile: 'supplyChainPhaseLockfile', advisories: 'supplyChainPhaseAdvisories', formatting: 'supplyChainPhaseFormatting', done: 'supplyChainPhaseDone' } as const
