/** Evidence-preserving finding groups; invalid links never hide records. */
import type { FindingStatus, SecurityFinding } from './finding-types.ts'

/** A representative and its original evidence-bearing duplicate records. */
export interface FindingGroup { finding: SecurityFinding; related: SecurityFinding[] }

/** Apply triage without leaving a nonduplicate attached to another finding.
 * @param finding Original evidence-bearing record.
 * @param status New owner or verified retest status.
 * @param updatedAt Recorded transition time.
 * @returns Updated record, preserving evidence and explicit separation.
 */
export function withFindingTriage(finding: SecurityFinding, status: FindingStatus, updatedAt: number): SecurityFinding {
  if (status === 'duplicate') return { ...finding, status, updatedAt }
  const { duplicateOfFindingId, ...unlinked } = finding
  const separate = status === 'open' || finding.status === 'duplicate' || duplicateOfFindingId !== undefined
  return { ...unlinked, status, updatedAt, ...separate ? { duplicateReview: 'separate' } : {} }
}

/** Derive groups without changing records or merging assets/tasks.
 * @param findings Saved records.
 * @returns Representatives and related duplicates; invalid links remain separate.
 */
export function projectFindingGroups(findings: readonly SecurityFinding[]): FindingGroup[] {
  const owner = (finding: SecurityFinding): SecurityFinding | undefined => {
    if (finding.status !== 'duplicate' || !finding.duplicateOfFindingId) return undefined
    return findings.find(candidate => candidate.id === finding.duplicateOfFindingId && candidate.id !== finding.id
      && candidate.workspaceId === finding.workspaceId && candidate.taskId === finding.taskId && candidate.assetId === finding.assetId
      && candidate.status !== 'duplicate' && !candidate.duplicateOfFindingId)
  }
  return findings.filter(finding => !owner(finding)).map(finding => ({
    finding, related: findings.filter(candidate => owner(candidate)?.id === finding.id),
  }))
}

/** Conservative identity for automatic grouping; unknown request contexts never match.
 * @param finding Evidence-backed finding.
 * @returns Exact-match key, or undefined for unsupported request contexts.
 */
export function automaticFindingKey(finding: SecurityFinding): string | undefined {
  const evidence = finding.evidence
  const method = (evidence.method ?? 'GET').toUpperCase()
  if (evidence.requestContext !== 'anonymous' || (method !== 'GET' && method !== 'HEAD')) return undefined
  return JSON.stringify([finding.workspaceId, finding.taskId, finding.assetId, method, evidence.url,
    finding.title.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase(), finding.severity, finding.proof])
}
