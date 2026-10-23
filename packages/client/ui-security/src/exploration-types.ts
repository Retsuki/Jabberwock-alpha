/** Shared task knowledge references; execution and evidence keep their original owners. */
import type { SecurityConversationRequest } from './conversation-types.ts'

/** Read-only typed source projection or committed shared claim. */
export interface ExplorationNode {
  id: string
  kind: 'goal' | 'investigation' | 'observation' | 'fact' | 'finding' | 'hint'
  summary: string
  state: string
  assetIds: string[]
  source?: { planId?: string; itemId?: string; workerRunId?: string; observationIndex?: number; findingId?: string } | undefined
  assessment?: 'supported' | 'unverified' | 'contradicted' | undefined
  at?: number | undefined
  detail?: string | undefined
}
/** Directed source relationship; missing sources remain explicit unknown nodes. */
export interface ExplorationEdge { from: string; to: string; relation: 'derived-from' | 'produces' | 'supports' | 'contradicts' }
/** Full owner graph or an explicitly bounded model view of that graph. */
export interface SecurityExplorationState {
  revision: number
  nodes: ExplorationNode[]
  edges: ExplorationEdge[]
  truncated?: boolean | undefined
  omittedNodes?: number | undefined
  omittedEdges?: number | undefined
}
/** Only validated source IDs can support a claim; no completion or triage mutation is exposed. */
export interface ExplorationAnnotations {
  goalAssessments?: { goalId: string; assessment: 'supported' | 'unverified' | 'contradicted'; supportNodeIds: string[] }[] | undefined
  investigationLinks?: { itemId: string; goalIds: string[]; sourceNodeIds: string[] }[] | undefined
  hints?: { summary: string; sourceNodeIds: string[] }[] | undefined
}
/** Worker claim tied to exact retained evidence and a stable retry identity. */
export interface ExplorationFactInput { requestId: string; summary: string; observationIndexes: number[]; quote: string }
/** Private model reads request bounded overview or specific original node identities. */
export interface ExplorationReadOptions { nodeIds?: string[] | undefined }
/** Task/run-fixed Worker access; model inputs cannot change the owner identity. */
export interface ExplorationWorkerCapability {
  read(options?: ExplorationReadOptions): Promise<SecurityExplorationState>
  publishFact(input: ExplorationFactInput): Promise<SecurityExplorationState>
}
/** Workspace-owned task identity for shared exploration reads. */
export type ExplorationRequest = SecurityConversationRequest
