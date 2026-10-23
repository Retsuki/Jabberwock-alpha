/** One projection-derived display model for the context panel and composer ring. */
import type { UseProjection } from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-token-meter/client'
import type { SidebarRightKey } from '../locales.ts'

function deriveSummary(useProjection: UseProjection, t: (key: SidebarRightKey) => string) {
  const model = useProjection('modelSelection')
  const usage = useProjection('tokenUsage')
  const pressure = useProjection('contextPressure')
  const breakdown = useProjection('contextBreakdown')
  const observed = useProjection('engineUsage')
  const selected = model?.next ?? model?.lastUsed
  const native = selected?.provider === 'codex-subscription' || selected?.provider === 'claude-subscription'
  const matched = native && observed != null && selected.provider === `${observed.engine}-subscription`
    && ((selected.model === 'default' && observed.requestedModel === undefined) || selected.model === observed.model || selected.model === observed.requestedModel) ? observed : undefined
  const context = native ? matched?.context : pressure === undefined ? undefined : {
    usedTokens: pressure.projectedTokens ?? pressure.pressureTokens,
    maxTokens: pressure.contextWindow,
    estimated: pressure.projectedTokens !== undefined,
  }
  const used = context?.usedTokens
  const capacity = context?.maxTokens
  const maximum = capacity !== undefined && capacity > 0 ? capacity : undefined
  const percent = used !== undefined && maximum !== undefined && maximum > 0
    ? Math.max(0, used / maximum * 100) : undefined
  const tokens = native ? matched?.tokens : usage === undefined ? undefined : {
    inputTokens: usage.uncachedInputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
  }
  const rows: readonly { name: string; tokens: number; kind?: string | undefined }[] | undefined =
    native ? matched?.context?.categories : breakdown === undefined ? undefined : [
      { name: t('summary.system'), tokens: breakdown.systemTokens },
      { name: t('summary.tools'), tokens: breakdown.toolsTokens },
      { name: t('summary.messages'), tokens: breakdown.messageTokens },
    ]
  return { selected, native, matched, context, used, capacity, maximum, percent, tokens, rows }
}

/** Read the active Session's existing measurements without a second cache.
 * @param useProjection Framework-bound Session projection reader.
 * @param t Context dictionary.
 * @returns One shared model for the ring and detailed context card.
 */
export function summaryModel(useProjection: UseProjection, t: (key: SidebarRightKey) => string): ReturnType<typeof deriveSummary> {
  return deriveSummary(useProjection, t)
}
