/** Durable Worker transcript and owner follow-up composer. */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, IconLoadingOutlineRegular, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { TaskWorkers } from './TaskWorkers.tsx'
import css from './TaskWorkers.module.css'
type Props = Parameters<typeof TaskWorkers>[0]
/** Render public instructions, observations and reports for a selected Worker.
 * @param props - selected task run and owner commands.
 * @returns persistent transcript and a composer for retained observations.
 */
export function WorkerChat({
  workspaceId, taskId, runId, state, readError, refresh, t,
  cancelSecurityWorker, sendSecurityWorker, approveSecurityWorkerTool, setSecurityBrowserCredentials,
}: Props): ReactNode {
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState('')
  const [origin, setOrigin] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [credentialError, setCredentialError] = useState(false)
  const pending = useRef(false)
  const request = useRef({ text: '', id: randomUUID() })
  const active = useRef(true)
  const transcript = useRef<HTMLDivElement>(null)
  const nearBottom = useRef(true)
  const answeredApproval = useRef<string>()
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const run = state?.runs.find(value => value.id === runId)
  const replying = run?.conversationStatus === 'running'
  const running = run?.status === 'running' || replying
  const observations = run?.observations ?? (run?.evidence ? [run.evidence] : [])
  const approval = run?.pendingApproval
  useEffect(() => {
    const element = transcript.current
    if (element && nearBottom.current) element.scrollTop = element.scrollHeight
  }, [run?.transcript?.length, running])
  const send = async (): Promise<void> => {
    const text = draft.trim()
    if (pending.current || readError || !run || replying || !text) return
    if (request.current.text !== text) request.current = { text, id: randomUUID() }
    pending.current = true; setBusy(true); setError(false)
    try {
      await sendSecurityWorker({ workspaceId, taskId, runId: run.id, requestId: request.current.id, text })
      if (active.current) { setDraft(''); request.current = { text: '', id: randomUUID() } }
      await refresh()
    }
    catch (_sendFailure) { if (active.current) setError(true) }
    finally { pending.current = false; if (active.current) setBusy(false) }
  }
  const stop = async (): Promise<void> => {
    if (pending.current || !runId) return
    pending.current = true; setBusy(true); setError(false)
    try { await cancelSecurityWorker({ workspaceId, taskId, runId }); await refresh() }
    catch (_stopFailure) { if (active.current) setError(true) }
    finally { pending.current = false; if (active.current) setBusy(false) }
  }
  const decide = async (allow: boolean): Promise<void> => {
    if (pending.current || readError || !run || !approval || answeredApproval.current === approval.id) return
    pending.current = true; setBusy(true); setError(false)
    try {
      await approveSecurityWorkerTool({ workspaceId, taskId, runId: run.id, approvalId: approval.id, allow })
      answeredApproval.current = approval.id
      await refresh()
    }
    catch (_approvalFailure) { if (active.current) setError(true) }
    finally { pending.current = false; if (active.current) setBusy(false) }
  }
  const configureLogin = async (clear: boolean): Promise<void> => {
    if (pending.current || readError) return
    pending.current = true; setBusy(true); setCredentialError(false)
    try {
      await setSecurityBrowserCredentials({ workspaceId, taskId,
        ...(clear ? {} : { credentials: { origin: origin.trim(), username, password } }),
      })
      if (active.current) { setPassword(''); if (clear) { setOrigin(''); setUsername('') } }
      await refresh()
    } catch (_invalidLoginSettings) { if (active.current) setCredentialError(true) }
    finally { pending.current = false; if (active.current) setBusy(false) }
  }
  const labels = { running: 'workerRunning', completed: 'workerCompleted', failed: 'workerFailed', cancelled: 'workerCancelled', interrupted: 'workerInterrupted' } as const
  const actors = { instruction: 'workerPlanner', log: 'workerExecutionLog', report: 'workerSpeaker', user: 'workerYou', error: 'workerExecutionLog' } as const
  return <section className={css.root} aria-label={t('workerChat')}>
    <header className={css.header}>
      <strong>{run?.snapshot.item.title}</strong><span className={css.activity} aria-busy={running}>{running && <IconLoadingOutlineRegular size={14} className={css.spinner} aria-hidden="true" />}{run && t(labels[running ? 'running' : run.status])}</span>
      <Button size="sm" variant="outline" onClick={() => { void refresh() }}>{t('workerRefresh')}</Button>
      {running && <Button size="sm" variant="outline" disabled={busy} onClick={() => { void stop() }}>{t('workerCancel')}</Button>}
    </header>
    {state?.browser?.enabled && <details className={css.login}>
      <summary>{t('workerBrowserLogin')} · {t(state.browser.credentialsConfigured ? 'workerBrowserConfigured' : 'workerBrowserNotConfigured')}</summary>
      <p className={css.notice}>{t('workerBrowserCredentialNotice')}</p>
      <form onSubmit={(event) => { event.preventDefault(); void configureLogin(false) }} autoComplete="off">
        <label>{t('workerBrowserOrigin')}<input type="url" required maxLength={2048} value={origin} onChange={(event) => { setOrigin(event.target.value) }} disabled={busy} /></label>
        <label>{t('workerBrowserUsername')}<input type="text" required maxLength={4096} value={username} onChange={(event) => { setUsername(event.target.value) }} disabled={busy} autoComplete="off" /></label>
        <label>{t('workerBrowserPassword')}<input type="password" required maxLength={4096} value={password} onChange={(event) => { setPassword(event.target.value) }} disabled={busy} autoComplete="new-password" /></label>
        <div className={css.tools}>
          <Button size="sm" type="submit" disabled={busy || readError || !origin.trim() || !username || !password}>{t('workerBrowserSave')}</Button>
          <Button size="sm" type="button" variant="outline" disabled={busy || readError || !state.browser.credentialsConfigured} onClick={() => { void configureLogin(true) }}>{t('workerBrowserClear')}</Button>
        </div>
      </form>
      {credentialError && <p role="alert" className={css.notice}>{t('workerBrowserCredentialError')}</p>}
    </details>}
    {observations.some(evidence => evidence.acquisition === 'partial') && <p role="status" className={css.notice}>{t('reportReasonCapture')}</p>}
    {observations.some(evidence => evidence.bodyTruncated) && <p className={css.notice}>{t('reportReasonAnalysis')}</p>}
    {approval && <section className={css.approval} aria-label={t('workerToolApproval')}>
      <strong>{t('workerToolApproval')}</strong><p>{approval.description}</p>
      <div className={css.tools}>
        <Button size="sm" disabled={busy || readError || answeredApproval.current === approval.id} onClick={() => { void decide(true) }}>{t('workerToolAllow')}</Button>
        <Button size="sm" variant="outline" disabled={busy || readError || answeredApproval.current === approval.id} onClick={() => { void decide(false) }}>{t('workerToolDeny')}</Button>
      </div>
    </section>}
    {(error || readError) && <p role="alert" className={css.notice}>{t('workerError')}</p>}
    {!state && !readError && <p role="status">{t('workerLoading')}</p>}
    <div ref={transcript} onScroll={(event) => { const element = event.currentTarget; nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80 }} className={css.transcript} role="log" aria-label={t('workerChatHistory')}>
      {!run && state && <p className={css.notice}>{t('workerEmpty')}</p>}
      {run?.transcript?.map(message => <article key={message.id} className={`${css.message} ${message.kind === 'instruction' || message.kind === 'user' ? css.outgoing : ''}`}>
        <div className={css.meta}><span>{t(actors[message.kind])}</span>
          <time dateTime={new Date(message.createdAt).toISOString()}>{new Date(message.createdAt).toLocaleString()}</time>
        </div>
        {message.kind === 'log' || message.kind === 'error' ? <details className={css.execution}><summary><span>{message.kind === 'error' ? t('workerErrorDetails') : message.text.split('\n', 1)[0]?.trim() || t('workerExecutionLog')}</span></summary><pre>{message.text}</pre></details> : <div className={css.bubble}>{message.kind === 'report' ? <MarkdownText text={message.text} labels={{ code: { copyLabel: t('workerCopy'), copiedLabel: t('workerCopied') }, footnotes: t('workerFootnotes') }} /> : <p>{message.text}</p>}</div>}
      </article>)}
      {running && <p role="status" className={`${css.notice} ${css.activity}`}><IconLoadingOutlineRegular size={16} className={css.spinner} aria-hidden="true" />{t('workerRunning')}</p>}
    </div>
    <form className={css.composer} onSubmit={(event) => { event.preventDefault(); void send() }}>
      <textarea maxLength={20000} aria-label={t('workerMessage')} placeholder={t('workerMessage')} value={draft} disabled={busy} onChange={(event) => { setDraft(event.target.value) }} onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) { event.preventDefault(); void send() } }} />
      <div className={css.tools}><p className={css.notice}>{t(run?.status === 'running' ? 'workerQueueNotice' : 'workerChatNotice')}</p><Button size="sm" type="submit" disabled={!run || readError || busy || replying || !draft.trim()}>{t('workerSend')}</Button></div>
    </form>
  </section>
}
