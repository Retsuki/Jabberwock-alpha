/** Read-only activity derived from durable task, Planner, and Worker records. */
import type { SecurityAsset, SecurityTask } from '../security-records.ts'
import type { SecurityPlanningState } from '../planning-types.ts'
import type { SecurityWorkerState } from '../worker-types.ts'
import type { SecurityExecutionState } from '../execution-types.ts'
import type { SecurityExplorationState } from '../exploration-types.ts'

/** Recorded entity categories; a fact is an observation, never a confirmed vulnerability. */
export type ActivityKind = 'goal' | 'asset' | 'intent' | 'observation' | 'fact' | 'finding' | 'hint' | 'review' | 'execution' | 'message'
/** Persisted lifecycle states plus current snapshots. */
export type ActivityStatus = 'pending' | 'recorded' | 'planning' | 'ready' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted' | 'needs-input' | 'unverified' | 'supported' | 'contradicted'
/** Author of the recorded activity. */
export type ActivitySource = 'planner' | 'worker' | 'owner' | 'system'
/** Entity displayed in the exploration graph. */
export interface ActivityNode {
  id: string
  kind: ActivityKind
  title: string
  at: number
  status: ActivityStatus
  source: ActivitySource
  sourceId?: string | undefined
  assetIds: string[]
  payload: Record<string, unknown>
}
/** Timestamped public record; nodeId identifies its graph entity. */
export interface ActivityEvent extends ActivityNode { nodeId: string }
/** Relationship supported by persisted identifiers, not inferred from message text. */
export interface ActivityEdge {
  id: string
  source: string
  target: string
  kind: 'contains' | 'dispatches' | 'produces' | 'reviews' | 'replans' | 'targets' | 'derived-from' | 'supports' | 'contradicts'
}
/** Shared projection for timeline and exploration. */
export interface ActivityModel { nodes: ActivityNode[]; edges: ActivityEdge[]; events: ActivityEvent[] }

const key = (prefix: string, ...parts: string[]) => `${prefix}:${parts.map(encodeURIComponent).join(':')}`
const ordered = <T extends { id: string; at: number }>(values: T[]) => values.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))

/** Project only saved relationships and public records without generating investigation results.
 * @param task Current task; goal dates describe this snapshot, not historical goal creation.
 * @param assets Workspace assets, restricted to referenced task records.
 * @param planning Saved planning attempts for the task.
 * @param workers Saved Worker attempts and public conversations.
 * @param execution Saved task execution attempts.
 * @returns Stable entities, existing-reference edges, and chronological lifecycle events.
 */
export function buildTaskActivity(
  task: SecurityTask, assets: SecurityAsset[], planning: SecurityPlanningState,
  workers: SecurityWorkerState, execution: SecurityExecutionState, shared?: SecurityExplorationState,
): ActivityModel {
  const nodes = new Map<string, ActivityNode>()
  const events: ActivityEvent[] = []
  const edges = new Map<string, ActivityEdge>()
  const plans = planning.plans.filter(plan => plan.taskId === task.id && plan.snapshot.task.id === task.id)
  const runs = workers.runs.filter(run => run.taskId === task.id && run.snapshot.task.id === task.id)
  const executions = execution.runs.filter(run => run.taskId === task.id && run.snapshot.task.id === task.id)
  const add = (node: ActivityNode) => { nodes.set(node.id, node); return node }
  const event = (node: ActivityNode, suffix: string, at = node.at, payload = node.payload, status = node.status, title = node.title) => {
    events.push({ ...node, id: key('event', node.id, suffix), nodeId: node.id, at, payload, status, title })
  }
  const edge = (source: string, target: string, kind: ActivityEdge['kind']) => {
    if (!nodes.has(source) || !nodes.has(target)) return
    const id = key('edge', source, target, kind)
    edges.set(id, { id, source, target, kind })
  }
  const referenced = new Set([
    ...task.assetIds, ...plans.flatMap(plan => plan.snapshot.assets.map(asset => asset.id)), ...runs.map(run => run.assetId),
  ])
  const knownAssets = new Map(assets.filter(asset => referenced.has(asset.id)).map(asset => [asset.id, asset]))
  for (const plan of [...plans].sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))) {
    for (const asset of plan.snapshot.assets) if (!knownAssets.has(asset.id)) knownAssets.set(asset.id, asset)
  }
  for (const run of [...runs].sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))) {
    if (!knownAssets.has(run.assetId)) knownAssets.set(run.assetId, run.snapshot.asset)
  }
  for (const asset of knownAssets.values()) add({ id: key('asset', asset.id), kind: 'asset', title: asset.value, at: task.updatedAt, status: 'recorded', source: 'owner', assetIds: [asset.id], payload: { recordType: 'asset-snapshot', ...asset } })
  const goals = task.goals?.filter(goal => goal.text.trim()) ?? []
  for (const goal of goals) add({ id: key('goal', task.id, goal.id), kind: 'goal', title: goal.text, at: task.updatedAt, status: 'recorded', source: 'owner', assetIds: task.assetIds, payload: { recordType: 'goal-snapshot', snapshot: true } })
  if (task.objective.trim()) add({ id: key('objective', task.id), kind: 'goal', title: task.objective, at: task.updatedAt, status: 'recorded', source: 'owner', assetIds: task.assetIds, payload: { recordType: 'objective-snapshot', snapshot: true } })
  for (const plan of plans) {
    const node = add({ id: key('plan', plan.id), kind: 'review', title: plan.reviewSummary ?? plan.snapshot.observations ?? plan.snapshot.task.name, at: plan.createdAt, status: plan.status, source: 'planner', sourceId: plan.id, assetIds: plan.snapshot.assets.map(asset => asset.id), payload: { recordType: 'plan', planId: plan.id, reviewDecision: plan.reviewDecision, error: plan.error } })
    event(node, 'started', plan.createdAt, { recordType: 'plan-started', planId: plan.id }, 'planning', plan.snapshot.task.name)
    if (plan.status !== 'planning') event(node, 'settled', plan.updatedAt, node.payload)
    for (const item of plan.items) {
      const itemNode = add({ id: key('intent', plan.id, item.id), kind: 'intent', title: item.title, at: plan.updatedAt, status: item.status, source: 'planner', sourceId: plan.id, assetIds: item.targetAssetIds, payload: { recordType: 'plan-item', planId: plan.id, ...item } })
      event(itemNode, 'recorded')
    }
  }
  for (const run of runs) {
    const node = add({ id: key('worker', run.id), kind: 'execution', title: run.snapshot.item.title, at: run.createdAt, status: run.status, source: 'worker', sourceId: run.id, assetIds: [run.assetId], payload: { recordType: 'worker', runId: run.id, planId: run.planId, itemId: run.itemId, url: run.snapshot.url, error: run.error, model: run.snapshot.model } })
    event(node, 'started', run.createdAt, { ...node.payload, recordType: 'worker-started' }, 'running')
    const initialTerminal = run.transcript?.find(message => message.id === `${run.id}-report` || message.id === `${run.id}-error`)
    if (run.status !== 'running') event(node, 'settled', initialTerminal?.createdAt ?? run.updatedAt,
      { ...node.payload, timestampUnavailable: !initialTerminal })
    if (run.evidence) {
      const observation = add({ id: key('fact', run.id), kind: 'fact', title: `${run.evidence.status} ${run.evidence.url}`, at: run.createdAt, status: 'recorded', source: 'worker', sourceId: run.id, assetIds: [run.assetId], payload: { recordType: 'http-observation', ...run.evidence, timestampUnavailable: true } })
      // Older records have no observation timestamp; keep it in the graph without inventing a timeline instant.
      edge(node.id, observation.id, 'produces')
    }
    for (const message of run.transcript ?? []) {
      const messageNode = add({ id: key('message', run.id, message.id), kind: 'message', title: message.text.slice(0, 160), at: message.createdAt, status: message.kind === 'error' ? 'failed' : 'recorded', source: message.kind === 'user' ? 'owner' : message.kind === 'instruction' ? 'planner' : 'worker', sourceId: run.id, assetIds: [run.assetId], payload: { recordType: 'worker-message', messageKind: message.kind, runId: run.id, text: message.text } })
      event(messageNode, 'recorded')
      edge(node.id, messageNode.id, 'contains')
    }
    if (run.summary && !(run.transcript ?? []).some(message => message.kind === 'report' && message.text === run.summary)) {
      const report = add({ id: key('message', run.id, 'legacy-report'), kind: 'message', title: run.summary.slice(0, 160), at: run.updatedAt, status: 'recorded', source: 'worker', sourceId: run.id, assetIds: [run.assetId], payload: { recordType: 'worker-message', messageKind: 'report', legacy: true, text: run.summary, timestampUnavailable: true } })
      event(report, 'recorded'); edge(node.id, report.id, 'contains')
    }
  }
  for (const run of executions) {
    const node = add({ id: key('execution', run.id), kind: 'execution', title: run.summary ?? run.snapshot.task.name, at: run.createdAt, status: run.status, source: 'system', sourceId: run.id, assetIds: run.snapshot.assets.map(asset => asset.id), payload: { recordType: 'execution', round: run.round, error: run.error, limits: run.snapshot.limits } })
    for (const [index, activity] of run.events.entries()) event(node, `activity-${index}`, activity.at, { recordType: 'execution-event', ...activity }, activity.kind === 'started' ? 'running' : 'recorded', activity.message)
    if (run.status !== 'running') event(node, 'settled', run.updatedAt)
  }
  for (const plan of plans) {
    for (const item of plan.items) edge(key('plan', plan.id), key('intent', plan.id, item.id), 'contains')
    if (plan.snapshot.previousPlanId) edge(key('plan', plan.snapshot.previousPlanId), key('plan', plan.id), 'replans')
    for (const id of plan.snapshot.workerRunIds ?? []) edge(key('worker', id), key('plan', plan.id), 'reviews')
  }
  for (const run of [...runs].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))) {
    const intentId = key('intent', run.planId, run.itemId)
    edge(intentId, key('worker', run.id), 'dispatches')
    const intent = nodes.get(intentId)
    if (intent) nodes.set(intentId, { ...intent, status: run.status, payload: { ...intent.payload, workerRunId: run.id } })
  }
  for (const run of executions) {
    for (const id of run.planIds) edge(key('execution', run.id), key('plan', id), 'contains')
    for (const id of run.workerRunIds) edge(key('execution', run.id), key('worker', id), 'dispatches')
  }
  for (const node of nodes.values()) if (node.kind === 'intent' || node.payload.recordType === 'worker') for (const id of node.assetIds) edge(node.id, key('asset', id), 'targets')
  if (shared) {
    // Shared knowledge replaces legacy knowledge projections, while lifecycle and conversations remain intact.
    const intentIds = new Map(shared.nodes.filter(node => node.kind === 'investigation').map(node =>
      [key('intent', node.source?.planId ?? '', node.source?.itemId ?? ''), node.id]))
    for (const node of nodes.values()) if (node.kind === 'goal' || node.kind === 'intent' || node.kind === 'fact') nodes.delete(node.id)
    for (const [id, relation] of edges) if (!nodes.has(relation.source) || !nodes.has(relation.target)) edges.delete(id)
    for (const knowledge of shared.nodes) {
      const run = runs.find(value => value.id === knowledge.source?.workerRunId)
      const plan = plans.find(value => value.id === knowledge.source?.planId)
      const status: ActivityStatus = knowledge.state === 'unknown' ? 'unverified'
        : knowledge.assessment ?? (knowledge.kind === 'hint' ? 'unverified'
          : ['pending', 'running', 'completed', 'failed', 'cancelled'].includes(knowledge.state)
            ? knowledge.state as ActivityStatus : 'recorded')
      const knowledgeNode = add({ id: knowledge.id, kind: knowledge.kind === 'investigation' ? 'intent' : knowledge.kind,
        title: knowledge.summary, at: knowledge.at ?? run?.updatedAt ?? plan?.updatedAt ?? task.updatedAt, status,
        source: run ? 'worker' : plan || knowledge.kind === 'hint' ? 'planner' : knowledge.kind === 'goal' ? 'owner' : 'system',
        sourceId: run?.id ?? plan?.id, assetIds: knowledge.assetIds,
        payload: { recordType: 'shared-knowledge', ...knowledge, timestampUnavailable: knowledge.at === undefined } })
      if (knowledge.at !== undefined) event(knowledgeNode, 'published', knowledge.at)
      if (run) edge(key('worker', run.id), knowledge.id, 'produces')
      if (plan && knowledge.kind === 'investigation') edge(key('plan', plan.id), knowledge.id, 'contains')
      for (const id of knowledge.assetIds) edge(knowledge.id, key('asset', id), 'targets')
    }
    for (const relation of shared.edges) edge(relation.from, relation.to, relation.relation)
    for (const run of runs) edge(`investigation:${run.planId}:${run.itemId}`, key('worker', run.id), 'dispatches')
    for (let index = events.length - 1; index >= 0; index--) {
      const recorded = events[index]
      if (!recorded) continue
      const replacement = intentIds.get(recorded.nodeId)
      if (replacement) events[index] = { ...recorded, nodeId: replacement }
      else if (!nodes.has(recorded.nodeId)) events.splice(index, 1)
    }
  }
  return {
    nodes: ordered([...nodes.values()]), events: ordered(events),
    edges: [...edges.values()].sort((a, b) => a.id.localeCompare(b.id)),
  }
}
