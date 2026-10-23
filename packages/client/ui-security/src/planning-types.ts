/** Durable planning output is separate from editable task drafts and never executes investigations. */
import type { ExplorationAnnotations } from './exploration-types.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SecurityAsset, SecurityTask } from './security-records.ts'
import type { SecurityConversationRequest, SecurityModelDecision } from './conversation-types.ts'

/** One immutable proposed investigation; execution is deliberately unavailable. */
export interface SecurityPlanItem {
  id: string
  title: string
  purpose: string
  approach: string
  targetAssetIds: string[]
  modelDecision?: SecurityModelDecision | undefined
  operation?: { kind: 'http-get'; assetId: string; url: string } | undefined
  /** Host-validated continuation of an unchanged investigation item. */
  carriedFrom?: { planId: string; itemId: string } | undefined
  status: 'pending'
}
/** Inputs captured when a planning request is admitted; later draft edits do not change them. */
export interface SecurityPlanSnapshot {
  modelDecision?: SecurityModelDecision | undefined
  recordRevision: number
  task: SecurityTask
  assets: SecurityAsset[]
  previousPlanId?: string | undefined
  workerRunIds?: string[] | undefined
  workerRefs?: { workerRunId: string; planId: string; itemId: string }[] | undefined
  ongoingWorkerRunIds?: string[] | undefined
  executionReviewRequestId?: string | undefined
  observations?: string | undefined
  /** Immutable bounded shared knowledge captured before inference. */
  exploration?: string | undefined
  targetMode?: 'asset-scope' | undefined
  approvedTargets?: { assetId: string; url: string }[] | undefined
  conversation: string
}
/** One planning attempt and its validated pending investigations. */
export interface SecurityPlan extends SecurityConversationRequest {
  id: string
  requestId: string
  sessionId: SessionId
  status: 'planning' | 'ready' | 'failed' | 'cancelled' | 'interrupted'
  createdAt: number
  updatedAt: number
  error?: string | undefined
  snapshot: SecurityPlanSnapshot
  reviewDecision?: 'continue' | 'complete' | 'needs-input' | undefined
  reviewSummary?: string | undefined
  stopWorkerRunIds?: string[] | undefined
  explorationAnnotations?: ExplorationAnnotations | undefined
  items: SecurityPlanItem[]
}
/** Plans for one task, newest first; an empty array means none has been requested. */
export interface SecurityPlanningState { plans: SecurityPlan[] }
/** Stable retry identity prevents duplicate planning after reconnect. */
export interface SecurityPlanningStartRequest extends SecurityConversationRequest {
  requestId: string
  modelDecision?: SecurityModelDecision | undefined
  targetMode?: 'asset-scope' | undefined
  approvedTargets?: { assetId: string; url: string }[] | undefined
  /** Reject conversation actions after intervening edits to saved settings. */
  expectedRevision?: number | undefined
}
/** Inputs for review of saved results within approved targets. */
export interface SecurityPlanningReviewRequest extends SecurityPlanningStartRequest {
  planId: string
  /** Owner execution whose authoritative budgets and findings are included in review. */
  executionRunId?: string | undefined
  workerRunIds: string[]
  targetMode?: 'asset-scope' | undefined
  approvedTargets: { assetId: string; url: string }[]
}
