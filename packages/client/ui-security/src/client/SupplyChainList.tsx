/** Workspace advisory-check history and retained, shared conversation details. */
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { Button, Modal, Tag, IconChevronLeftOutlineRegular, IconLoadingOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { ConversationViewsProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { InjectFace, PropsLocale, PropsRenderFactories, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SupplyChainRemoveRequest, SupplyChainRun } from '../supply-chain-types.ts'
import type { SecurityTranslate } from './presentation.tsx'
import { repairStatusKeys } from './SupplyChainReport.tsx'
import css from './TaskList.module.css'
import local from './SupplyChain.module.css'

/** Authorized operations for one workspace, never arbitrary package-manager commands. */
export interface SupplyChainFace {
  listSupplyChain(this: void, workspaceId: SupplyChainRun['workspaceId']): Promise<SupplyChainRun[]>
  startSupplyChain(this: void, workspaceId: SupplyChainRun['workspaceId'], requestId: string): Promise<SupplyChainRun>
  retainSupplyChain(this: void, sessionId: SupplyChainRun['sessionId'], signal: AbortSignal): Promise<SessionReference>
  /** Hide one finished run; the Session log keeps its snapshots. */
  removeSupplyChain(this: void, request: SupplyChainRemoveRequest): Promise<void>
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Workspace-owned checks with a scoped session detail. */
    'security.supply-chain': { kind: 'single'; scope: 'root'; owner: { workspaceId: SupplyChainRun['workspaceId'] } }
    /** Shared conversation factory bound to a retained scanner session. */
    'security.supply-chain.conversation': { kind: 'single'; scope: 'session' }
  }
}
/** List persisted checks, keeping request identities across unconfirmed retries. */
export function SupplyChainList({ workspaceId, t, listSupplyChain, startSupplyChain, retainSupplyChain, removeSupplyChain, SessionProvider, renderSlot }: PropsRuntime<'security.supply-chain'> & PropsLocale<'security'> & PropsRenderSlots<'security.supply-chain.conversation'> & InjectFace<SupplyChainFace>): ReactNode {
  const [runs, setRuns] = useState<SupplyChainRun[]>([])
  const [selected, setSelected] = useState<SupplyChainRun>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [starting, setStarting] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [removing, setRemoving] = useState<SupplyChainRun['runId']>()
  const [removeError, setRemoveError] = useState(false)
  const [removeBusy, setRemoveBusy] = useState(false)
  const removed = useRef(new Set<SupplyChainRun['runId']>())
  const removePending = useRef(false)
  const requestId = useRef<string>()
  const startPending = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = async (): Promise<void> => {
      try {
        const rows = await listSupplyChain(workspaceId)
        if (!live) return
        setRuns(rows.filter(row => !removed.current.has(row.runId))); setError(false); setLoading(false)
      } catch (_error: unknown) { if (live) { setError(true); setLoading(false) } }
      if (live) timer = setTimeout(() => { void refresh() }, 2000)
    }
    void refresh()
    return () => { live = false; clearTimeout(timer) }
  }, [workspaceId, listSupplyChain, attempt])
  if (selected) return <SupplyChainDetail key={selected.sessionId} run={selected} t={t} retain={retainSupplyChain}
    back={() => { setSelected(undefined); setAttempt(value => value + 1) }} SessionProvider={SessionProvider} renderSlot={renderSlot} />
  return <section className={css.root}>
    <div className={css.frame}><header className={css.toolbar}><strong>{t('supplyChainHistory')}</strong><span className={css.count}>{runs.length}</span>
      <div className={css.toolbarActions}><Button variant="outline" onClick={() => { setAttempt(value => value + 1) }}>{t('supplyChainRefresh')}</Button><Button variant="primary" disabled={starting} onClick={() => {
        if (startPending.current) return
        startPending.current = true
        requestId.current ??= randomUUID(); setStarting(true); setError(false)
        void startSupplyChain(workspaceId, requestId.current).then((run) => {
          if (!mounted.current) return
          requestId.current = undefined
          setRuns(previous => [run, ...previous.filter(item => item.runId !== run.runId)])
          setAttempt(value => value + 1)
        })
          .catch(() => { if (mounted.current) setError(true) })
          .finally(() => { startPending.current = false; if (mounted.current) setStarting(false) })
      }}>{starting && <IconLoadingOutlineRegular className={local.spinner} />}{t(starting ? 'supplyChainOpening' : 'supplyChainStart')}</Button></div>
    </header>
    {error && <p role="alert" className={local.error}>{t('supplyChainHistoryError')}</p>}
    {loading ? <p role="status" className={local.disclosure}>{t('supplyChainOpening')}</p> : <div className={css.scroll}><table className={`${css.table} ${local.historyTable}`}><thead><tr><th>{t('supplyChainHistory')}</th><th>{t('supplyChainStatus')}</th><th>{t('supplyChainMatches')}</th><th>{t('supplyChainCreated')}</th><th>{t('supplyChainLastUpdated')}</th><th>{t('supplyChainActions')}</th></tr></thead><tbody>
      {runs.map(run => <tr key={run.runId}><td><Button variant="ghost" title={run.runId} onClick={() => { setSelected(run) }}>{t('supplyChainTitle')} · {run.runId.slice(0, 8)}</Button></td><td><Tag tone={statusTone(run)}>{isRunning(run) && <IconLoadingOutlineRegular className={local.spinner} />}{status(run, t)}</Tag></td><td>{run.findings.length}</td><td>{new Date(run.createdAt).toLocaleString()}</td><td>{new Date(run.updatedAt).toLocaleString()}</td>
        <td><div className={local.rowActions}><Button variant="outline" size="sm" onClick={() => { setSelected(run) }}>{t('supplyChainReport')}</Button>
          <Button variant="outline" size="sm" disabled={isRunning(run) || removing !== undefined} title={isRunning(run) ? t('supplyChainDeleteRunning') : undefined} onClick={() => { setRemoveError(false); setRemoving(run.runId) }}>{t('supplyChainDelete')}</Button></div></td></tr>)}
      {runs.length === 0 && <tr><td colSpan={6}>{t('supplyChainHistoryEmpty')}</td></tr>}
    </tbody></table></div>}</div>
    <Modal open={removing !== undefined} title={t('supplyChainDeleteTitle')} closeLabel={t('close')} onClose={() => { if (!removeBusy) setRemoving(undefined) }}
      footer={<><Button variant="outline" disabled={removeBusy} onClick={() => { setRemoving(undefined) }}>{t('cancel')}</Button><Button variant="primary" disabled={removeBusy} onClick={() => {
        if (removePending.current || removing === undefined) return
        const runId = removing
        removePending.current = true; setRemoveBusy(true); setRemoveError(false)
        void removeSupplyChain({ workspaceId, runId }).then(() => {
          removed.current.add(runId)
          if (mounted.current) { setRuns(previous => previous.filter(item => item.runId !== runId)); setRemoving(undefined) }
        }).catch(() => { if (mounted.current) setRemoveError(true) })
          .finally(() => { removePending.current = false; if (mounted.current) { setRemoveBusy(false); setAttempt(value => value + 1) } })
      }}>{t('supplyChainDelete')}</Button></>}>
      <p>{t('supplyChainDeleteNote')}</p>
      {removeError && <p role="alert" className={local.error}>{t('supplyChainDeleteFailed')}</p>}
    </Modal>
  </section>
}
function isRunning(run: SupplyChainRun): boolean { return run.status === 'running' || run.repair?.status === 'running' }
/** Repair status keeps priority; an incomplete or interrupted result never reads as success. */
function statusTone(run: SupplyChainRun): NonNullable<ComponentProps<typeof Tag>['tone']> {
  const state = run.repair?.status ?? run.status
  switch (state) {
    case 'running': return 'info'
    case 'completed': return 'success'
    case 'failed': return 'danger'
    case 'cancelled': case 'unsupported': return 'neutral'
    case 'incomplete': case 'interrupted': case 'stale': return 'warning'
    default: return 'outline'
  }
}
function status(run: SupplyChainRun, t: SecurityTranslate): string {
  if (run.repair) return t(repairStatusKeys[run.repair.status])
  const keys = { running: 'supplyChainRunning', completed: 'supplyChainCompleted', incomplete: 'supplyChainIncomplete', failed: 'supplyChainFailed', cancelled: 'supplyChainCancelled', interrupted: 'supplyChainInterrupted' } as const
  return t(keys[run.status])
}
type DetailProps = Pick<PropsRenderSlots<'security.supply-chain.conversation'>, 'SessionProvider'> & PropsRenderSlots<'security.supply-chain.conversation'> & { run: SupplyChainRun; t: SecurityTranslate; retain: SupplyChainFace['retainSupplyChain']; back: () => void }
function SupplyChainDetail({ run, t, retain, back, SessionProvider, renderSlot }: DetailProps): ReactNode {
  const [reference, setReference] = useState<SessionReference>()
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let held: SessionReference | undefined
    setError(false)
    void retain(run.sessionId, controller.signal).then((value) => {
      if (controller.signal.aborted) { value.release(); return }
      held = value; setReference(value)
    })
      .catch(() => { if (!controller.signal.aborted) setError(true) })
    return () => { controller.abort(); held?.release() }
  }, [run.sessionId, retain, attempt])
  return <section className={local.detail}><header className={css.toolbar}><Button variant="ghost" onClick={back}><IconChevronLeftOutlineRegular />{t('supplyChainHistory')}</Button><strong>{t('supplyChainTitle')}</strong></header>
    {error ? <p role="alert">{t('supplyChainHistoryError')}<Button variant="outline" onClick={() => { setAttempt(value => value + 1) }}>{t('supplyChainRefresh')}</Button></p> : reference ? <SessionProvider session={reference}>{renderSlot('security.supply-chain.conversation', {})}</SessionProvider> : <p role="status">{t('supplyChainOpening')}</p>}
  </section>
}
function ChatView({ renderSlot }: ConversationViewsProps): ReactNode { return renderSlot('conversation.session', { view: 'chat' }) }
/** The owning factory renders chat; the scanner's elected composer seat is inert. */
export function SupplyChainConversation({ renderFactorySlot }: PropsRuntime<'security.supply-chain.conversation'> & PropsRenderFactories): ReactNode {
  return <div className={local.transcript}>{renderFactorySlot('conversation.content', { variant: 'embedded', phase: 'active', hero: false }, { slots: { views: ChatView } })}</div>
}
/** An elected chain element hides the ordinary composer fallback without model input. */
export function SupplyChainReadOnlyComposer(): ReactNode { return <div /> }
