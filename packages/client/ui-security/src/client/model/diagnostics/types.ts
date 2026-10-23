import type { TargetKind } from '../types.ts'

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

/** Migrated prototype diagnostic status. */
export type DiagnosticStatus = 'pending' | 'running' | 'paused' | 'completed' | 'stopped'

/** Migrated prototype goal. */
export type Goal = {
  id: string
  text: string
  status: 'open' | 'achieved'
  evidenceFindingIds: string[]
  replanPending?: boolean | undefined
  updatedAt: string
}

/** Migrated prototype constraint. */
export type Constraint = {
  id: string
  kind: 'allow' | 'deny'
  text: string
}
/** Migrated prototype asset rule. */
export type AssetRule = {
  id: string
  action: 'allow' | 'block'
  targetKind: TargetKind | 'any'
  pattern: string
  note?: string | undefined
}

/** Migrated prototype planner status. */
export type PlannerStatus = 'idle' | 'planning' | 'waiting' | 'done' | 'stopped'

/** Migrated prototype planner round. */
export type PlannerRound = {
  id: string
  round: number
  at: string
  summary: string
  decisions: string[]
  createdTicketIds: string[]
}

/** Migrated prototype planner state. */
export type PlannerState = {
  status: PlannerStatus
  rounds: PlannerRound[]
}
/** Migrated prototype session kind. */
export type SessionKind = 'main' | 'worker'

/** Migrated prototype worker status. */
export type WorkerStatus = 'running' | 'waiting' | 'stopped' | 'done' | 'failed'

/** Migrated prototype session message. */
export type SessionMessage = {
  id: string
  at: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  text: string
  pending?: boolean | undefined
  tool?: { name: string; args: string; result?: string; error?: string }
}

/** Migrated prototype session. */
export type Session = {
  id: string
  kind: SessionKind
  title: string
  ticketId?: string | undefined
  status?: WorkerStatus | undefined
  slot?: number | undefined
  startedAt?: string | undefined
  endedAt?: string | undefined
  messages: SessionMessage[]
}
/** Migrated prototype fact. */
export type Fact = {
  id: string
  text: string
  ticketId: string
  at: string
  assetValue?: string | undefined
  evidence?: string | undefined
}
/** Migrated prototype hint. */
export type Hint = {
  id: string
  text: string
  at: string
  from: 'human' | 'main'
  ticketId?: string | undefined
}

/** Migrated prototype event kind. */
export type EventKind =
  | 'goal'
  | 'intent_added'
  | 'intent_started'
  | 'intent_finished'
  | 'fact'
  | 'finding'
  | 'hint'
  | 'approval'
  | 'retest'
  | 'control'
  | 'message'
  | 'system'

/** Migrated prototype event source. */
export type EventSource = 'main' | 'planner' | 'worker' | 'system' | 'user'

/** Migrated prototype event refs. */
export type EventRefs = {
  ticketId?: string | undefined
  findingId?: string | undefined
  factId?: string | undefined
  goalId?: string | undefined
  hintId?: string | undefined
  approvalId?: string | undefined
  sessionId?: string | undefined
  retestId?: string | undefined
}

/** Migrated prototype diagnostic event. */
export type DiagnosticEvent = {
  id: string
  at: string
  kind: EventKind
  source: EventSource
  text: string
  detail?: string | undefined
  status?: string | undefined
  refs?: EventRefs | undefined
}

/** Migrated prototype approval status. */
export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

/** Migrated prototype approval. */
export type Approval = {
  id: string
  ticketId: string
  requestedBy: string
  sessionId?: string | undefined
  action: string
  target: string
  reason: string
  at: string
  status: ApprovalStatus
  decidedAt?: string | undefined
  decisionNote?: string | undefined
}

/** Migrated prototype retest status. */
export type RetestStatus = 'running' | 'finished' | 'failed' | 'stopped'
/** Migrated prototype retest result. */
export type RetestResult = 'reproduced' | 'fixed' | 'inconclusive'

/** Migrated prototype retest run. */
export type RetestRun = {
  id: string
  findingId: string
  fixVersion?: string | undefined
  note?: string | undefined
  status: RetestStatus
  result?: RetestResult | undefined
  startedAt: string
  finishedAt?: string | undefined
  evidenceSummary?: string | undefined
  log: string[]
}
/** Migrated prototype model usage. */
export type ModelUsage = {
  model: string
  calls: number
  inputTokens: number
  outputTokens: number
  cacheTokens: number
}

/** Migrated prototype diagnostic task. */
export type DiagnosticTask = {
  id: string
  projectId: string
  name: string
  description: string
  objective: string
  status: DiagnosticStatus
  targetIds: string[]
  model: string
  createdAt: string
  startedAt?: string | undefined
  completedAt?: string | undefined
  goals: Goal[]
  constraints: Constraint[]
  assetRules: AssetRule[]
  planner: PlannerState
  workerSlots: number
  sessions: Session[]
  facts: Fact[]
  hints: Hint[]
  events: DiagnosticEvent[]
  approvals: Approval[]
  retests: RetestRun[]
  usage: ModelUsage[]
  report?: { markdown: string; generatedAt: string }
}
