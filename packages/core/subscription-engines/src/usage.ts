/** Optional native metrics collection; failures never change turn completion. @module @deepseek-ai/dsh-subscription-engines/usage */
import type { Context } from '@deepseek-ai/cordis'
import type { EngineRunRequest, EngineUsageSnapshot } from '@deepseek-ai/dsh-agent'

/** @param value Native token counter. @returns Nonnegative integer token count. */
export function tokenCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Invalid native token counter')
  return value
}

/** @param ctx Host context. @param request Owning turn. @param snapshot Replacement metrics snapshot. */
export function recordUsage(ctx: Context, request: EngineRunRequest, snapshot: EngineUsageSnapshot): void {
  try { request.agent.session.append('engine/usage', snapshot) }
  catch (_error: unknown) {
    // Auxiliary metrics must not turn a completed model request into a failed turn.
    ctx.logger.warn(`Native usage snapshot was not recorded (${snapshot.engine})`)
  }
}
