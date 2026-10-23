/** Investigation identity and explicit continuation lineage shared by Planner and reports. */
import type { SecurityPlan, SecurityPlanItem } from './planning-types.ts'
import type { SecurityWorkerRun } from './worker-types.ts'

/** Compare investigation purpose independently of IDs and model choices.
 * @param item Saved investigation.
 * @returns Stable identity; a URL alone does not identify a completed investigation.
 */
export function planItemKey(item: Pick<SecurityPlanItem, 'title' | 'purpose' | 'approach' | 'targetAssetIds' | 'operation'>): string {
  return JSON.stringify({ title: item.title, purpose: item.purpose, approach: item.approach,
    targetAssetIds: [...item.targetAssetIds].sort(), operation: item.operation === undefined ? undefined : {
      ...item.operation, url: new URL(item.operation.url).href,
    } })
}

/** Find the latest attempt for an item or an explicitly carried unchanged descendant.
 * @param plans Authoritative saved plans.
 * @param workers Saved Worker attempts.
 * @param plan Original owning plan.
 * @param item Original investigation item.
 * @returns Matching latest attempt, never an unrelated item sharing its URL.
 */
export function findPlanItemWorker(
  plans: readonly SecurityPlan[], workers: readonly SecurityWorkerRun[], plan: SecurityPlan, item: SecurityPlanItem,
): SecurityWorkerRun | undefined {
  const identity = planItemKey(item)
  const matches = (candidate: SecurityWorkerRun): boolean => {
    if (candidate.workspaceId !== plan.workspaceId || candidate.taskId !== plan.taskId
      || candidate.snapshot.recordRevision !== plan.snapshot.recordRevision
      || planItemKey(candidate.snapshot.item) !== identity) return false
    let parent = plans.find(value => value.id === candidate.planId)
    let current = parent?.items.find(value => value.id === candidate.itemId)
    const visited = new Set<string>()
    while (parent && current) {
      if (planItemKey(current) !== identity) return false
      if (parent.id === plan.id && current.id === item.id) return true
      const key = JSON.stringify([parent.id, current.id])
      if (visited.has(key) || !current.carriedFrom) return false
      visited.add(key)
      const reference = current.carriedFrom
      parent = plans.find(value => value.id === reference.planId && value.workspaceId === plan.workspaceId
        && value.taskId === plan.taskId && value.snapshot.recordRevision === plan.snapshot.recordRevision)
      current = parent?.items.find(value => value.id === reference.itemId)
    }
    return false
  }
  return workers.filter(matches).sort((a, b) => b.createdAt - a.createdAt || b.updatedAt - a.updatedAt)[0]
}
