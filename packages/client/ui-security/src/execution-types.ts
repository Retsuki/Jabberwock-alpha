/** Persisted bounded Planner and Worker coordination for one approved task. */
import type { SecurityConversationRequest, SecurityModelDecision } from './conversation-types.ts'
import type { SecurityAsset, SecurityTask } from './security-records.ts'
/** Exact registered target approved for anonymous GET requests during one run. */
export interface SecurityExecutionTarget { assetId: string; url: string }
/** Host limits stop repetition without resuming after restart. */
export interface SecurityExecutionLimits {
  maxRounds: number
  maxRequests: number
  timeoutMs: number
  maxConcurrentWorkers?: number | undefined
}
/** Durable HTTP quota reservation; absent settlement retains the full reservation. */
export interface SecurityExecutionDispatch {
  requestId: string
  planId: string
  itemId: string
  assetId: string
  url: string
  maxRequests: number
  workerRunId?: string | undefined
  settled?: boolean | undefined
}
/** Saved review admission and decision application; absent application never consumes result identities. */
export interface SecurityExecutionReview {
  requestId: string
  previousPlanId: string
  workerRunIds: string[]
  planId?: string | undefined
  applied?: boolean | undefined
}
/** Stable owner invocation and immutable target authorization. */
export interface SecurityExecutionStartRequest extends SecurityConversationRequest {
  requestId: string
  expectedRevision: number
  resumeRunId?: string | undefined
  planId?: string | undefined
  modelDecision?: SecurityModelDecision | undefined
  targets?: SecurityExecutionTarget[]
}
/** Durable dispatch and decision activity. */
export interface SecurityExecutionEvent { at: number; kind: 'started' | 'worker' | 'review' | 'decision' | 'stopped'; message: string; planId?: string | undefined; workerRunId?: string | undefined }
/** One task-owned attempt; completion describes only the bounded approved investigation. */
export interface SecurityExecutionRun extends SecurityConversationRequest {
  id: string
  requestId: string
  resumedFromRunId?: string | undefined
  status: 'running' | 'completed' | 'needs-input' | 'failed' | 'cancelled' | 'interrupted'
  createdAt: number
  updatedAt: number
  round: number
  planIds: string[]
  workerRunIds: string[]
  dispatches?: SecurityExecutionDispatch[] | undefined
  reviews?: SecurityExecutionReview[] | undefined
  events: SecurityExecutionEvent[]
  error?: string | undefined
  summary?: string | undefined
  snapshot: {
    modelDecision?: SecurityModelDecision | undefined
    recordRevision: number
    task: SecurityTask
    assets: SecurityAsset[]
    targetMode?: 'asset-scope' | undefined
    targets: SecurityExecutionTarget[]
    limits: SecurityExecutionLimits
  }
}
/** Newest-first runs and disclosed finite execution limits. */
export interface SecurityExecutionState { runs: SecurityExecutionRun[]; limits: SecurityExecutionLimits }
