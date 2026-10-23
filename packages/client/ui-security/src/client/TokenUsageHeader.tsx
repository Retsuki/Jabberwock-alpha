/** Read saved Session usage without retaining or running an Agent. */
import { useEffect, type ReactNode } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionProjectionSnapshot } from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-token-meter/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SecurityConversationEngine } from '../conversation-types.ts'
import css from './TokenUsageHeader.module.css'

/** Captured provider route and durable Session identity. */
export interface UsageSession { sessionId: SessionId; engine: SecurityConversationEngine }
/** Read-only projection access supplied by the existing Session controller. */
export interface TokenUsageFace {
  /** Ensure the shared projection baseline is loaded.
   * @param sessionId - Saved role Session identity.
   * @returns completion of the shared baseline read.
   */
  refreshTokenProjection(this: void, sessionId: SessionId): Promise<void>
}
type Buckets = { input: number | undefined; read: number | undefined; write: number | undefined; output: number | undefined }

/** Sum each distinct Session's current cumulative sample, preserving missing buckets.
 * @param sessions - Captured role Sessions; duplicate identities are ignored.
 * @param projections - Current authoritative Session projection snapshots.
 * @returns disjoint token buckets, unavailable if any included Session lacks that bucket.
 */
export function securityTokenTotals(
  sessions: UsageSession[], projections: Readonly<Record<SessionId, SessionProjectionSnapshot>>,
): Buckets {
  const totals: Buckets = { input: 0, read: 0, write: 0, output: 0 }
  const unique = new Map(sessions.map(session => [session.sessionId, session]))
  if (!unique.size) return { input: undefined, read: undefined, write: undefined, output: undefined }
  for (const { sessionId, engine } of unique.values()) {
    const values = projections[sessionId]?.values
    const native = values?.engineUsage
    const generic = values?.contextPressure?.pressureTokens === undefined ? undefined : values.tokenUsage
    const tokens = engine === 'claude' || engine === 'codex'
      ? native?.engine === engine ? native.tokens : undefined
      : generic ? {
        inputTokens: generic.uncachedInputTokens, outputTokens: generic.outputTokens,
        cacheReadTokens: generic.cacheReadTokens, cacheWriteTokens: generic.cacheWriteTokens,
      } : undefined
    const current: Buckets = {
      input: tokens?.inputTokens, read: tokens?.cacheReadTokens, write: tokens?.cacheWriteTokens, output: tokens?.outputTokens,
    }
    for (const key of ['input', 'read', 'write', 'output'] as const) {
      const next = current[key]
      totals[key] = totals[key] === undefined || next === undefined ? undefined : totals[key] + next
    }
  }
  return totals
}

/** ARTEX-style token counts; cache means reads, with writes retained in the tooltip.
 * @param props - Saved role addresses, shared Session projection hook and locale.
 * @returns read-only token metrics for the selected role.
 */
export function TokenUsageHeader({ sessions, role, useSessions, refreshTokenProjection, t }: PropsRuntime<'security.task.tokens'> & PropsLocale<'security'> & InjectFace<TokenUsageFace>): ReactNode {
  const projections = useSessions(state => state.projectionsBySession)
  const sessionKey = JSON.stringify([...new Set(sessions.map(session => session.sessionId))].sort())
  useEffect(() => {
    // The controller deduplicates baseline reads; subsequent values arrive on its shared push stream.
    for (const sessionId of JSON.parse(sessionKey) as SessionId[]) {
      void refreshTokenProjection(sessionId).catch((_readFailure: unknown) => { /* Missing usage remains visibly unavailable. */ })
    }
  }, [sessionKey, refreshTokenProjection])
  const totals = securityTokenTotals(sessions, projections)
  const exact = (value: number | undefined): string => value === undefined ? t('tokensUnknown') : value.toLocaleString()
  const compact = (value: number | undefined): string => value === undefined ? '—' : value < 1000 ? String(value) : new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
  const title = `${t(role === 'planner' ? 'tokensPlanner' : 'tokensWorker')} · ${t('tokensInput')}: ${exact(totals.input)} · ${t('tokensCache')}: ${exact(totals.read)} · ${t('tokensWrite')}: ${exact(totals.write)} · ${t('tokensOutput')}: ${exact(totals.output)}`
  return <div className={css.usage} title={title} aria-label={title}>
    {([['tokensInput', 'input'], ['tokensCache', 'read'], ['tokensOutput', 'output']] as const).map(([label, bucket]) => <span key={bucket}>{t(label)} <strong>{compact(totals[bucket])}</strong></span>)}
  </div>
}
