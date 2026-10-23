/** Read-only asset coverage. Observed is deliberately independent from diagnostic completion. */
import ipaddr from 'ipaddr.js'
import type { SecurityAsset, SecurityCompany, SecurityTask } from '../security-records.ts'
import type { SecurityPlanningState } from '../planning-types.ts'
import type { SecurityWorkerState, SecurityWorkerRun, SecurityWorkerEvidence } from '../worker-types.ts'
import type { SecurityFindingState, SecurityFinding } from '../finding-types.ts'

/** Registered asset kinds and company connectors displayed in the coverage graph. */
export type CoverageKind = SecurityAsset['kind'] | 'company'
/** Persisted references displayed in the asset drawer. */
export interface CoverageNode {
  id: string
  kind: CoverageKind
  label: string
  companyId: string
  assetId?: string | undefined
  connector: boolean
  inScope: boolean
  scopeState: 'in' | 'out' | 'unknown'
  tested: boolean
  refs: {
    plans: { planId: string; itemId: string; title: string }[]
    workers: { runId: string; sessionId: SecurityWorkerRun['sessionId']; status: SecurityWorkerRun['status']; url: string; evidence?: SecurityWorkerEvidence | undefined }[]
    findings: SecurityFinding[]
  }
}
/** Parent relationships are supported by registered values, never guessed registrable suffixes. */
export interface CoverageModel {
  nodes: CoverageNode[]
  edges: { id: string; source: string; target: string }[]
  stats: { denominator: number; tested: number; percentage: number | null; byType: Partial<Record<SecurityAsset['kind'], { total: number; tested: number }>> }
  /** Stable diagnostic codes; the UI owns their localized presentation. */
  warnings: string[]
}
type Address = { host: string; url?: URL | undefined; ip?: string | undefined }
const key = (...parts: string[]) => parts.map(encodeURIComponent).join(':')
function address(asset: Pick<SecurityAsset, 'kind' | 'value'>): Address | undefined {
  try {
    if (asset.kind === 'app') return undefined
    if (asset.kind === 'ip') {
      const ip = ipaddr.process(asset.value.replace(/^\[|\]$/g, '')).toString()
      return { host: ip, ip }
    }
    const isUrl = asset.kind === 'service' || asset.kind === 'endpoint'
    const url = new URL(isUrl ? asset.value : `https://${asset.value}`)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash || (asset.kind !== 'endpoint' && url.search)) return undefined
    if (!isUrl && (url.host !== url.hostname || url.pathname !== '/' || !url.hostname.includes('.'))) return undefined
    const raw = url.hostname.replace(/^\[|\]$/g, '')
    const ip = ipaddr.isValid(raw) ? ipaddr.process(raw).toString() : undefined
    if (!isUrl && ip) return undefined
    return { host: ip ?? url.hostname.toLowerCase(), url: isUrl ? url : undefined, ip }
  } catch { return undefined }
}
const descendant = (host: string, parent: string) => host === parent || host.endsWith(`.${parent}`)
function contains(anchor: SecurityAsset, candidate: SecurityAsset): boolean {
  if (anchor.id === candidate.id) return true
  if (anchor.companyId !== candidate.companyId || anchor.kind !== 'domain') return false
  const parent = address(anchor), child = address(candidate)
  return !!parent && !!child && descendant(child.host, parent.host)
}
function matchesEvidence(asset: SecurityAsset, value: string): boolean {
  const registered = address(asset), observed = address({ kind: 'endpoint', value })
  if (!registered || !observed) return false
  if (asset.kind === 'domain') return descendant(observed.host, registered.host)
  if (asset.kind === 'service') return registered.url?.origin === observed.url?.origin
  if (asset.kind === 'endpoint') return registered.url?.href === observed.url?.href
  return registered.host === observed.host
}
function sameAsset(first: SecurityAsset, second: SecurityAsset): boolean {
  if (first.id !== second.id || first.kind !== second.kind || first.companyId !== second.companyId) return false
  if (first.kind === 'app') return first.value === second.value
  const a = address(first), b = address(second)
  return !!a && !!b && a.host === b.host && a.url?.href === b.url?.href
}
function scopeState(task: SecurityTask, asset: SecurityAsset): CoverageNode['scopeState'] {
  const candidate = address(asset)
  let unknown = false
  const matches = (rule: NonNullable<SecurityTask['scopeRules']>[number]): boolean | undefined => {
    try {
      if (rule.kind === 'domain') {
        const target = address({ kind: 'domain', value: rule.value })
        if (!target) return undefined
        return candidate ? descendant(candidate.host, target.host) : asset.kind === 'app' ? undefined : false
      }
      if (rule.kind === 'url') {
        const target = address({ kind: 'endpoint', value: rule.value })
        if (!target) return undefined
        // A hostname or service represents more than one URL: do not claim that an excluded path excludes the entire asset.
        return candidate?.url && asset.kind === 'endpoint' ? candidate.url.href === target.url?.href : undefined
      }
      if (rule.kind === 'ip') {
        const target = ipaddr.process(rule.value).toString()
        return candidate?.ip ? candidate.ip === target : undefined
      }
      const range = ipaddr.parseCIDR(rule.value)
      if (!candidate?.ip) return undefined
      const ip = ipaddr.process(candidate.ip)
      return ip.kind() === range[0].kind() && ip.match(range)
    } catch { return undefined }
  }
  const rules = (task.scopeRules ?? []).map(rule => ({ action: rule.action, match: matches(rule) }))
  if (rules.some(rule => rule.action === 'deny' && rule.match === true)) return 'out'
  if (rules.some(rule => rule.action === 'deny' && rule.match === undefined)) unknown = true
  const allows = rules.filter(rule => rule.action === 'allow')
  if (allows.length && !allows.some(rule => rule.match === true)) {
    if (allows.some(rule => rule.match === undefined)) unknown = true
    else return 'out'
  }
  return unknown ? 'unknown' : 'in'
}

/** Project current registered scope and actual task-owned HTTP observations without network access.
 * @param task Current task whose selected assets and rules define coverage.
 * @param assets Registered assets used to resolve scope and graph relationships.
 * @param companies Registered companies used for labels and scope connectors.
 * @param planning Saved plans supplying task-owned investigation references.
 * @param workers Saved Worker runs supplying matching HTTP observations.
 * @param findings Saved finding state supplying evidence-matched asset references.
 * @returns Asset graph, distinct observed-asset counts, and unresolved scope diagnostics. Percentage uses 0–100.
 */
export function buildTaskCoverage(
  task: SecurityTask, assets: SecurityAsset[], companies: SecurityCompany[],
  planning: SecurityPlanningState, workers: SecurityWorkerState, findings: SecurityFindingState,
): CoverageModel {
  const anchors = assets.filter(asset => task.assetIds.includes(asset.id))
  const companyIds = new Set(anchors.map(asset => asset.companyId))
  const nodes: CoverageNode[] = []
  const edges: CoverageModel['edges'] = []
  const warnings = new Set<string>()
  if (task.assetIds.some(id => !assets.some(asset => asset.id === id))) warnings.add('missing-asset')
  const plans = planning.plans.filter(plan => plan.taskId === task.id && plan.snapshot.task.id === task.id)
  const runs = workers.runs.filter(run => run.taskId === task.id && run.snapshot.task.id === task.id)
  const emptyRefs = (): CoverageNode['refs'] => ({ plans: [], workers: [], findings: [] })
  for (const companyId of companyIds) {
    const company = companies.find(value => value.id === companyId)
    nodes.push({ id: key('company', companyId), kind: 'company', label: company?.name ?? companyId, companyId, connector: true, inScope: false, scopeState: 'out', tested: false, refs: emptyRefs() })
    if (!company) warnings.add('missing-company')
  }
  const visible = assets.filter(asset => companyIds.has(asset.companyId))
  for (const asset of visible) {
    const selected = anchors.some(anchor => contains(anchor, asset))
    let state = selected ? scopeState(task, asset) : 'out' as CoverageNode['scopeState']
    if (selected && asset.kind !== 'app' && !address(asset)) state = 'unknown'
    if (state === 'unknown') warnings.add('unresolved-scope')
    const matchingRuns = runs.filter(run => run.assetId === asset.id && sameAsset(asset, run.snapshot.asset))
    const refs = emptyRefs()
    for (const plan of plans) {
      if (!plan.snapshot.assets.some(snapshot => sameAsset(asset, snapshot))) continue
      for (const item of plan.items) {
        if (item.targetAssetIds.includes(asset.id)) refs.plans.push({ planId: plan.id, itemId: item.id, title: item.title })
      }
    }
    refs.plans.sort((a, b) => a.planId.localeCompare(b.planId) || a.itemId.localeCompare(b.itemId))
    refs.workers = matchingRuns.map(run => ({
      runId: run.id, sessionId: run.sessionId, status: run.status, url: run.snapshot.url, evidence: run.evidence,
    })).sort((a, b) => a.runId.localeCompare(b.runId))
    refs.findings = findings.findings.filter(finding => finding.taskId === task.id && finding.assetId === asset.id
      && matchingRuns.some(run => run.id === finding.workerRunId) && matchesEvidence(asset, finding.evidence.url))
      .sort((a, b) => a.id.localeCompare(b.id))
    const tested = matchingRuns.some(run => !!run.evidence && run.evidence.status >= 100 && run.evidence.status <= 599
      && matchesEvidence(asset, run.evidence.url))
    nodes.push({ id: key('asset', asset.id), kind: asset.kind, label: asset.value, companyId: asset.companyId, assetId: asset.id, connector: false, inScope: state === 'in', scopeState: state, tested, refs })
  }
  const connect = (source: string, target: string) => { if (source !== target) edges.push({ id: key('edge', source, target), source, target }) }
  for (const asset of visible) {
    const target = address(asset)
    const candidates = visible.filter(parent => parent.id !== asset.id && parent.companyId === asset.companyId && ['domain', 'subdomain', 'service'].includes(parent.kind)).filter((parent) => {
      const parsed = address(parent)
      if (!parsed || !target) return false
      if (parent.kind === 'service') return asset.kind === 'endpoint' && parsed.url?.origin === target.url?.origin
      return descendant(target.host, parsed.host) && (target.host !== parsed.host || asset.kind === 'service' || asset.kind === 'endpoint')
    }).sort((a, b) => Number(b.kind === 'service') - Number(a.kind === 'service') || (address(b)?.host.length ?? 0) - (address(a)?.host.length ?? 0) || a.id.localeCompare(b.id))
    if (candidates[0]) connect(key('asset', asset.id), key('asset', candidates[0].id))
    else {
      const root = companies.find(company => company.id === asset.companyId)?.scope.filter(scope => scope.kind === 'domain').map(scope => address({ kind: 'domain', value: scope.value })).filter(scope => !!scope && !!target && descendant(target.host, scope.host)).sort((a, b) => (b?.host.length ?? 0) - (a?.host.length ?? 0))[0]
      if (root && !(asset.kind === 'domain' && target?.host === root.host)) {
        const id = key('connector', asset.companyId, root.host)
        if (!nodes.some(node => node.id === id)) {
          nodes.push({ id, kind: 'domain', label: root.host, companyId: asset.companyId, connector: true, inScope: false, scopeState: 'out', tested: false, refs: emptyRefs() })
          connect(id, key('company', asset.companyId))
        }
        connect(key('asset', asset.id), id)
      } else connect(key('asset', asset.id), key('company', asset.companyId))
    }
  }
  const byType: CoverageModel['stats']['byType'] = {}
  let denominator = 0, tested = 0
  for (const node of nodes) if (node.inScope && !node.connector && node.kind !== 'company') {
    const count = byType[node.kind] ?? { total: 0, tested: 0 }
    count.total++; denominator++
    if (node.tested) { count.tested++; tested++ }
    byType[node.kind] = count
  }
  return { nodes: nodes.sort((a, b) => a.id.localeCompare(b.id)), edges: edges.sort((a, b) => a.id.localeCompare(b.id)), stats: { denominator, tested, percentage: denominator && !warnings.has('unresolved-scope') && !warnings.has('missing-asset') ? tested / denominator * 100 : null, byType }, warnings: [...warnings].sort() }
}
