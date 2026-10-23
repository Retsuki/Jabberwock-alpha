/** Durable evidence-backed findings and independent bounded retests. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SecurityConversationRequest, SecurityConversationSelection } from './conversation-types.ts'
import type { SecurityTask, SecurityAsset } from './security-records.ts'
import type { SecurityWorkerEvidence, SecurityWorkerLimits } from './worker-types.ts'
/** Owner triage, independent from execution state and retest verdict. */
export type FindingStatus = 'open' | 'in-progress' | 'confirmed' | 'fixed' | 'false-positive' | 'duplicate' | 'accepted-risk'
/** Evidence-backed model report, never inferred from free-form summaries. */
export interface SecurityFindingReport { title: string; summary: string; severity: 'critical' | 'high' | 'medium' | 'low' | 'info'; proof: string; remediation: string }
/** Original immutable observation plus owner-managed triage. */
export interface SecurityFinding extends SecurityFindingReport, SecurityConversationRequest {
  id: string
  workerRunId: string
  assetId: string
  status: FindingStatus
  /** Same-task, same-asset representative; original evidence and identity remain unchanged. */
  duplicateOfFindingId?: string | undefined
  /** Explicit owner decision preventing automatic relinking after separation. */
  duplicateReview?: 'separate' | undefined
  evidence: SecurityWorkerEvidence
  createdAt: number
  updatedAt: number
}
/** One independent verification, preserving its original finding and current authorization snapshot. */
export interface SecurityRetest extends SecurityConversationRequest {
  id: string
  findingId: string
  requestId: string
  sessionId: SessionId
  notes: string
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted'
  verdict?: 'reproduced' | 'fixed' | 'inconclusive' | undefined
  summary?: string | undefined
  proof?: string | undefined
  evidence?: SecurityWorkerEvidence | undefined
  error?: string | undefined
  createdAt: number
  updatedAt: number
  snapshot: {
    finding: SecurityFinding
    task: SecurityTask
    asset: SecurityAsset
    model: SecurityConversationSelection
    limits: SecurityWorkerLimits
  }
}
/** Task-scoped history; reading never performs investigation. */
export interface SecurityFindingState { findings: SecurityFinding[]; retests: SecurityRetest[] }
