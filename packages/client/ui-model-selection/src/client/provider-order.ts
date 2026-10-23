/** Shared provider display order for the composer and command model pickers. */

/** Providers listed ahead of all others, in display order. */
const LEADING_PROVIDERS = ['claude-subscription', 'codex-subscription', 'deepseek-account', 'deepseek-official']

/**
 * Put the Claude subscription, Codex subscription, DeepSeek account, and DeepSeek official
 * providers first, in that order, preserving every other relative order.
 * @param groups - Provider groups in catalog order.
 * @returns a sorted copy; model order within each group is unchanged.
 */
export function orderModelProviders<T extends { readonly id: string }>(groups: readonly T[]): T[] {
  const rank = (id: string): number => {
    const index = LEADING_PROVIDERS.indexOf(id)
    return index === -1 ? LEADING_PROVIDERS.length : index
  }
  return groups.toSorted((left, right) => rank(left.id) - rank(right.id))
}
