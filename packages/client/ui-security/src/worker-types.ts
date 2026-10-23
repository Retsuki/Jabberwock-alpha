/** Durable task-owned bounded Worker requests and observations. */
import type { SecurityFindingReport } from './finding-types.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SecurityConversationRequest, SecurityConversationSelection, SecurityModelDecision } from './conversation-types.ts'
import type { SecurityTask, SecurityAsset } from './security-records.ts'
import type { SecurityPlanItem } from './planning-types.ts'

/** Owner approval for exactly one anonymous GET using current saved settings. */
export interface SecurityWorkerStartRequest extends SecurityConversationRequest {
  planId: string
  itemId: string
  assetId: string
  url: string
  requestId: string
  expectedRevision: number
  /** Remaining investigation-wide HTTP attempts; omitted uses deployment limit. */
  maxRequests?: number | undefined
}
/** Captured bounded response; no cookies or authentication headers are retained. */
export interface SecurityWorkerEvidence {
  /** Actual HTTP method; absent legacy observations are GET. */
  method?: string | undefined
  /** Recorded by transport; missing legacy context cannot establish an anonymous request. */
  requestContext?: 'anonymous' | 'authenticated' | undefined
  url: string
  status: number
  headers: Record<string, string>
  body: string
  bytes: number
  acquisition?: 'complete' | 'partial' | undefined
  truncated?: boolean | undefined
  artifactId?: string | undefined
  capturedBytes?: number | undefined
  bodyBytes?: number | undefined
  bodyTruncated?: boolean | undefined
}
/** Public instruction, observation, and report; never private model reasoning. */
export interface SecurityWorkerMessage {
  id: string
  kind: 'instruction' | 'log' | 'report' | 'user' | 'error'
  text: string
  createdAt: number
  requestId?: string | undefined
}
/** Owner followup analyzes retained evidence without issuing target requests. */
export interface SecurityWorkerSendRequest extends SecurityConversationRequest {
  runId: string
  requestId: string
  text: string
}
/** Immutable execution inputs and actual lifecycle for one bounded operation. */
export interface SecurityWorkerRun extends SecurityConversationRequest {
  id: string
  requestId: string
  planId: string
  itemId: string
  assetId: string
  sessionId: SessionId
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted'
  createdAt: number
  updatedAt: number
  snapshot: {
    exploration?: string | undefined
    recordRevision: number
    task: SecurityTask
    asset: SecurityAsset
    item: SecurityPlanItem
    modelDecision?: SecurityModelDecision | undefined
    model: SecurityConversationSelection
    url: string
    limits: SecurityWorkerLimits
  }
  transcript?: SecurityWorkerMessage[] | undefined
  conversationStatus?: 'running' | 'idle' | 'failed' | 'cancelled' | 'interrupted' | undefined
  evidence?: SecurityWorkerEvidence | undefined
  /** Captured responses for tool-using runs; absent on legacy single-GET runs. */
  observations?: SecurityWorkerEvidence[] | undefined
  /** Observation index corresponding to each saved finding. */
  findingObservationIndexes?: number[] | undefined
  /** Reserved HTTP attempts, including failed attempts. */
  httpRequests?: number | undefined
  /** Owner decision needed before the described operation executes. */
  pendingApproval?: { id: string; description: string } | undefined
  findings?: SecurityFindingReport[] | undefined
  summary?: string | undefined
  error?: string | undefined
}
/** Owner-only ephemeral browser login configuration; never written to task or Session storage. */
export interface SecurityBrowserCredentialsRequest extends SecurityConversationRequest {
  credentials?: { origin: string; username: string; password: string } | undefined
}
/** Newest-first execution history; reading never executes anything. */
export interface SecurityWorkerState {
  runs: SecurityWorkerRun[]
  limits: SecurityWorkerLimits
  /** Live Host capability and credential presence; credentials themselves are never projected. */
  browser?: { enabled: boolean; credentialsConfigured: boolean } | undefined
}
/** Host-enforced finite limits disclosed before approval. */
export interface SecurityWorkerLimits {
  requestTimeoutMs: number
  responseBytes: number
  modelResponseBytes?: number | undefined
  modelTimeoutMs: number
  /** Maximum HTTP attempts available to this Worker. */
  maxRequests?: number | undefined
}
