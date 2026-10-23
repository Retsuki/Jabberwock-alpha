/** Deterministic coverage of saved operations; findings do not imply complete testing. */
import type { SecurityTask, SecurityAsset } from './security-records.ts'
import type { SecurityPlan } from './planning-types.ts'
import type { SecurityWorkerRun } from './worker-types.ts'
import { findPlanItemWorker } from './planning-coverage.ts'
import type { SecurityExecutionRun } from './execution-types.ts'
import type { SecurityFinding, SecurityRetest } from './finding-types.ts'

/** Saved records consumed without executing or inferring new findings. */
export interface SecurityReportInput {
  task: SecurityTask
  assets: SecurityAsset[]
  plans: SecurityPlan[]
  workers: SecurityWorkerRun[]
  executions: SecurityExecutionRun[]
  findings: SecurityFinding[]
  retests: SecurityRetest[]
}
/** Acquisition and analysis coverage of one proposed operation. */
export interface SecurityReportOperation {
  id: string
  title: string
  url: string
  assetId: string
  status: 'confirmed' | 'partial' | 'unverified' | 'unsupported'
  reason: 'observed' | 'capture-partial' | 'analysis-partial' | 'redirect' | 'worker-failed' | 'worker-running' | 'not-dispatched' | 'unsupported'
  worker?: SecurityWorkerRun | undefined
  planId: string
  itemId: string
}
/** Latest execution snapshot and explicitly classified evidence gaps. */
export interface SecurityReport { task: SecurityTask; assets: SecurityAsset[]; execution?: SecurityExecutionRun | undefined; generatedAt: number; coverage: 'not-started' | 'in-progress' | 'complete' | 'incomplete'; operations: SecurityReportOperation[]; counts: Record<SecurityReportOperation['status'], number>; findings: SecurityFinding[]; retests: SecurityRetest[]; limitations: ('bounded-http' | 'configuration-changed' | 'coverage-gaps' | 'legacy-capture')[] }

/** Classify saved evidence conservatively, including captures made before metadata existed.
 * @param worker Saved Worker attempt.
 * @returns Acquisition or analysis coverage independent of workflow status.
 */
export function classifySecurityWorker(worker: SecurityWorkerRun): Pick<SecurityReportOperation, 'status' | 'reason'> {
  if (worker.observations?.length) {
    for (const evidence of worker.observations) {
      if (evidence.status >= 300 && evidence.status < 400 && evidence.headers.location) {
        let destination: string
        try { destination = new URL(evidence.headers.location, evidence.url).href } catch { return { status: 'partial', reason: 'redirect' } }
        if (worker.observations.some(value => value.url === destination && value.status >= 200 && value.status < 300 && value.acquisition === 'complete')) continue
      }
      const result = classifySecurityWorker({ ...worker, observations: undefined, evidence })
      if (result.status !== 'confirmed') return result
    }
    return { status: 'confirmed', reason: 'observed' }
  }
  const evidence = worker.evidence
  if (!evidence) return { status: 'unverified', reason: worker.status === 'running' ? 'worker-running' : 'worker-failed' }
  if (evidence.acquisition === 'partial' || evidence.truncated || (evidence.acquisition === undefined && evidence.bytes >= worker.snapshot.limits.responseBytes)) return { status: 'partial', reason: 'capture-partial' }
  if (evidence.status >= 300 && evidence.status < 400) return { status: 'partial', reason: 'redirect' }
  if (worker.status !== 'completed') return { status: 'partial', reason: worker.status === 'running' ? 'worker-running' : 'worker-failed' }
  if (evidence.bodyTruncated) return { status: 'partial', reason: 'analysis-partial' }
  return { status: 'confirmed', reason: 'observed' }
}

/** Project the latest attempt, retaining unsupported proposals and missing dispatches.
 * @param input Authoritative saved records for one task.
 * @returns A report with no invented findings or broad vulnerability-free conclusion.
 */
export function buildSecurityReport(input: SecurityReportInput): SecurityReport {
  const executions = input.executions.filter(run => run.taskId === input.task.id).sort((a, b) => b.createdAt - a.createdAt)
  const execution = executions[0]
  const task = execution?.snapshot.task ?? input.task
  const assets = execution?.snapshot.assets ?? input.assets.filter(asset => task.assetIds.includes(asset.id))
  const plans = input.plans.filter(plan => plan.taskId === task.id
    && (execution === undefined || execution.planIds.includes(plan.id)))
  const workers = input.workers.filter(worker => worker.taskId === task.id
    && (execution === undefined || execution.workerRunIds.includes(worker.id)))
  const operations: SecurityReportOperation[] = []
  for (const plan of plans) for (const item of plan.items) {
    const replacement = findPlanItemWorker(plans, workers, plan, item)
    const classification = replacement ? classifySecurityWorker(replacement) : item.operation ? { status: 'unverified' as const, reason: 'not-dispatched' as const } : { status: 'unsupported' as const, reason: 'unsupported' as const }
    operations.push({ id: `${plan.id}:${item.id}`, title: item.title, url: item.operation?.url ?? '', assetId: item.operation?.assetId ?? item.targetAssetIds[0] ?? '', ...classification, worker: replacement, planId: plan.id, itemId: item.id })
  }
  const counts = { confirmed: 0, partial: 0, unverified: 0, unsupported: 0 }
  for (const operation of operations) counts[operation.status]++
  const gaps = operations.length === 0 || counts.partial + counts.unverified + counts.unsupported > 0
  const coverage = execution?.status === 'running' || workers.some(worker => worker.status === 'running') ? 'in-progress' : execution === undefined && workers.length === 0 ? 'not-started' : gaps || execution?.status !== 'completed' ? 'incomplete' : 'complete'
  const limitations: SecurityReport['limitations'] = ['bounded-http']
  if (gaps) limitations.push('coverage-gaps')
  if (execution && task.updatedAt !== input.task.updatedAt) limitations.push('configuration-changed')
  if (workers.some(worker => worker.evidence?.acquisition === undefined && worker.evidence !== undefined)) limitations.push('legacy-capture')
  return { task, assets, execution,
    generatedAt: Math.max(task.updatedAt, ...workers.map(worker => worker.updatedAt), ...plans.map(plan => plan.updatedAt),
      execution?.updatedAt ?? 0),
    coverage, operations, counts, findings: input.findings.filter(finding => finding.taskId === task.id),
    retests: input.retests.filter(retest => retest.taskId === task.id), limitations }
}
