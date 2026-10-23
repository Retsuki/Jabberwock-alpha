/** Read-only executive summaries of saved, evidence-backed findings. */
import type { SecurityFinding } from './finding-types.ts'
import type { SecurityReport } from './report-model.ts'
import type { SecurityAsset } from './security-records.ts'

/** Severity remains independent from investigation coverage and completeness. */
export interface ExecutiveReport {
  findings: SecurityFinding[]
  activeFindings: SecurityFinding[]
  severityCounts: Record<SecurityFinding['severity'], number>
  risk: SecurityFinding['severity'] | 'none'
  topFindings: SecurityFinding[]
  affectedAssets: { asset: SecurityAsset; findings: SecurityFinding[] }[]
  findingTypes: { title: string; count: number }[]
  roadmap: { urgent: SecurityFinding[]; soon: SecurityFinding[]; planned: SecurityFinding[] }
  counts: { total: number; active: number; fixed: number }
  startedAt: number | undefined
  finishedAt: number | undefined
}

const severities: SecurityFinding['severity'][] = ['critical', 'high', 'medium', 'low', 'info']

/** Aggregate owner triage without generating findings, impacts, or vulnerability classes.
 * @param report Saved report whose records remain unchanged.
 * @returns Active risk and remediation groups; no active finding does not establish safety.
 */
export function projectExecutiveReport(report: SecurityReport): ExecutiveReport {
  const findings = report.findings.filter(finding => finding.status !== 'false-positive' && finding.status !== 'duplicate')
  const activeFindings = findings.filter(finding => finding.status !== 'fixed')
  const severityCounts: ExecutiveReport['severityCounts'] = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
  const types = new Map<string, number>()
  for (const finding of activeFindings) {
    severityCounts[finding.severity]++
    types.set(finding.title, (types.get(finding.title) ?? 0) + 1)
  }
  return {
    findings,
    activeFindings,
    severityCounts,
    risk: severities.find(severity => severityCounts[severity] > 0) ?? 'none',
    topFindings: [...activeFindings].sort((a, b) => severities.indexOf(a.severity) - severities.indexOf(b.severity)
      || b.createdAt - a.createdAt || a.id.localeCompare(b.id)).slice(0, 5),
    affectedAssets: report.assets.map(asset => ({ asset, findings: activeFindings.filter(finding => finding.assetId === asset.id) }))
      .filter(entry => entry.findings.length > 0),
    findingTypes: [...types].map(([title, count]) => ({ title, count })),
    roadmap: {
      urgent: activeFindings.filter(finding => finding.severity === 'critical' || finding.severity === 'high'),
      soon: activeFindings.filter(finding => finding.severity === 'medium'),
      planned: activeFindings.filter(finding => finding.severity === 'low' || finding.severity === 'info'),
    },
    counts: { total: findings.length, active: activeFindings.length, fixed: findings.length - activeFindings.length },
    startedAt: report.execution?.createdAt,
    finishedAt: report.execution?.updatedAt,
  }
}
