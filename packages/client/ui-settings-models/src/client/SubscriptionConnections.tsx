/** Subscription authentication controls; transport stays in the plugin adapter. */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SettingsNamespaceView, SubscriptionConnection, SubscriptionConnectResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { ModelsKey } from './locales.ts'
import type { ModelsOperations } from './operations.ts'
import styles from './ModelsSection.module.css'

/** Subscription commands bound by the plugin that owns the Remote namespace. */
export interface SubscriptionOperations {
  list(): Promise<readonly SubscriptionConnection[]>
  connect(engine: 'codex' | 'claude'): Promise<SubscriptionConnectResult>
}

/** Two subscription connections, independent from API-key provider settings. */
export function SubscriptionConnections({ operations, t, namespace, writable = false, writeSettings, reloadSettings }: {
  operations: SubscriptionOperations
  t: (key: ModelsKey) => string
  namespace?: SettingsNamespaceView | undefined
  writable?: boolean
  writeSettings?: ModelsOperations['writeSettings']
  reloadSettings?: () => Promise<void>
}): ReactNode {
  const [connections, setConnections] = useState<readonly SubscriptionConnection[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [sharingBusy, setSharingBusy] = useState(false)
  const [sharingError, setSharingError] = useState<string>()
  const [notice, setNotice] = useState<SubscriptionConnectResult>()
  useEffect(() => {
    let active = true
    setBusy(true)
    void operations.list().then((value) => { if (active) setConnections(value) },
      (reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)) })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [operations])

  async function run(engine?: 'codex' | 'claude'): Promise<void> {
    setBusy(true)
    setError(undefined)
    try {
      if (engine !== undefined) setNotice(await operations.connect(engine))
      setConnections(await operations.list())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setBusy(false) }
  }

  async function saveSharing(engine: 'codex' | 'claude', value: string): Promise<void> {
    if (namespace === undefined || !writable || writeSettings === undefined || reloadSettings === undefined) return
    setSharingBusy(true)
    setSharingError(undefined)
    try {
      const outcome = await writeSettings(namespace.ns, [
        { op: 'set', path: ['historySharing', engine], value },
      ], namespace.revision)
      if (outcome.kind !== 'written') {
        setSharingError(outcome.kind === 'conflict' ? t('subscriptionSharingConflict') : outcome.message)
      }
      await reloadSettings()
    } catch (reason) {
      setSharingError(reason instanceof Error ? reason.message : String(reason))
    } finally { setSharingBusy(false) }
  }

  return <section className={styles['rowCard']} aria-label={t('subscriptionTitle')}>
    <h3 className={styles['title']}>{t('subscriptionTitle')}</h3>
    <p className={styles['intro']}>{t('subscriptionHelp')}</p>
    {(['codex', 'claude'] as const).map((engine) => {
      const connection = connections.find(row => row.engine === engine)
      const status = connection?.status
      const label = status === 'connected' ? t('subscriptionConnected')
        : status === 'signed-out' ? t('subscriptionSignedOut')
          : status === 'unavailable' ? t('subscriptionUnavailable')
            : status === 'error' || error !== undefined ? t('subscriptionError') : t('subscriptionLoading')
      const sharing = namespace?.value
      const policy = typeof sharing === 'object' && sharing !== null && !Array.isArray(sharing) && 'historySharing' in sharing
        && typeof sharing.historySharing === 'object' && sharing.historySharing !== null && !Array.isArray(sharing.historySharing)
        && engine in sharing.historySharing && sharing.historySharing[engine] === 'allow' ? 'allow' : 'ask'
      return <div key={engine} className={styles['rowCard']}>
        <strong>{engine === 'codex' ? 'Codex (subscription)' : 'Claude (subscription)'}</strong>
        <span>{label}</span>
        {connection?.message === undefined ? null : <p className={styles['intro']}>{connection.message}</p>}
        <Button disabled={busy || status === undefined || status === 'unavailable' || status === 'connected'}
          onClick={() => { void run(engine) }}>{t('subscriptionConnect')}</Button>
        <label className={styles['field']}>
          <span>{t('subscriptionSharingTitle')}</span>
          <select className={styles['input']} aria-label={`${engine === 'codex' ? 'Codex / OpenAI' : 'Claude / Anthropic'} ${t('subscriptionSharingTitle')}`}
            value={policy} disabled={sharingBusy || !writable || namespace === undefined || writeSettings === undefined}
            onChange={(event) => { void saveSharing(engine, event.target.value) }}>
            <option value="ask">{t('subscriptionSharingAsk')}</option>
            <option value="allow">{t('subscriptionSharingAllow')}</option>
          </select>
        </label>
        <p className={styles['intro']}>{t(engine === 'codex' ? 'subscriptionSharingCodex' : 'subscriptionSharingClaude')}</p>
      </div>
    })}
    <p className={styles['intro']}>{t('subscriptionSharingHelp')}</p>
    {!writable ? <p className={styles['intro']}>{t('readOnly')}</p> : null}
    {sharingBusy ? <p role="status" className={styles['intro']}>{t('applying')}</p> : null}
    {sharingError === undefined ? null : <p role="alert" className={styles['error']}>{sharingError}</p>}
    <Button disabled={busy || sharingBusy} onClick={() => { void run() }}>{t('subscriptionRefresh')}</Button>
    {notice?.message === undefined ? null : <p role="status" className={styles['intro']}>{notice.message}</p>}
    {notice?.url === undefined ? null : <a href={notice.url} target="_blank" rel="noopener noreferrer">{t('subscriptionOpenSignIn')}</a>}
    {error === undefined ? null : <p role="alert" className={styles['error']}>{error}</p>}
  </section>
}
