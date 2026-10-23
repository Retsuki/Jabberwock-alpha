import type { DiagnosticTask } from './diagnostics/types.ts'

/** Migrated prototype asset kind. */
export type AssetKind =
  | 'company'
  | 'root_domain'
  | 'subdomain'
  | 'ip'
  | 'service'
  | 'app'
  | 'endpoint'

/** Migrated prototype coverage node. */
export type CoverageNode = {
  key: string
  kind: AssetKind
  label: string
  tested: boolean
  inScope: boolean
  port?: number | undefined
  pageTitle?: string | undefined
  statusCode?: number | undefined
  url?: string | undefined
}

/** Migrated prototype coverage edge. */
export type CoverageEdge = {
  source: string
  target: string
}

/** Migrated prototype task info. */
export type TaskInfo = {
  id: string
  name: string
  description: string
  llmStatus: string
  state: string
  tabs: string[]
  activeTab: string
}
/** Migrated prototype target kind. */
export type TargetKind = 'url' | 'domain' | 'ip' | 'cidr'

/** Migrated prototype target status. */
export type TargetStatus = 'untested' | 'testing' | 'tested'

/** Migrated prototype target. */
export type Target = {
  id: string
  value: string
  kind: TargetKind
  status: TargetStatus
  registeredAt: string
}
/** Migrated prototype ticket status. */
export type TicketStatus = 'todo' | 'doing' | 'review' | 'done'

/** Migrated prototype ticket priority. */
export type TicketPriority = 'high' | 'medium' | 'low'

/** Migrated prototype severity. */
export type Severity = 'critical' | 'high' | 'medium' | 'low'

/** Migrated prototype severity counts. */
export type SeverityCounts = Record<Severity, number>

/** Migrated prototype finding status. */
export type FindingStatus = 'open' | 'confirmed' | 'resolved'
/** Migrated prototype finding. */
export type Finding = {
  id: string
  title: string
  description: string
  severity: Severity
  target: string
  status: FindingStatus
  foundAt: string
  vulnType: string
  evidence: string
  impact: string[]
  fixes: string[]
}

/** Migrated prototype ticket result. */
export type TicketResult = { findings: Finding[] }

/** Migrated prototype finding follow up. */
export type FindingFollowUp = 'retest' | 'deepdive'

/** Migrated prototype ticket. */
export type Ticket = {
  diagnosticTaskId?: string | undefined
  goalIds?: string[] | undefined
  derivedFromFactIds?: string[] | undefined
  id: string
  title: string
  description: string
  category: string
  priority: TicketPriority
  status: TicketStatus
  targets: string[]
  source: 'ai' | 'manual'
  result?: TicketResult | undefined
  origin?: { findingId: string; kind: FindingFollowUp }
}

/** Migrated prototype ticket draft. */
export type TicketDraft = Omit<Ticket, 'id' | 'status' | 'source' | 'result'>

/** Migrated prototype project view. */
export type ProjectView = 'chat' | 'assets' | 'tasks' | 'findings' | 'agents'

/** Migrated prototype chat link. */
export type ChatLink = { label: string; view: Exclude<ProjectView, 'chat'> }

/** Migrated prototype chat message. */
export type ChatMessage = {
  id: string
  role: 'user' | 'ai'
  text: string
  links?: ChatLink[] | undefined
}

/** Migrated prototype project. */
export type Project = { id: string; name: string }
/** Migrated prototype project data. */
export type ProjectData = {
  diagnostics?: DiagnosticTask[] | undefined
  targets: Target[]
  tickets: Ticket[]
  messages: ChatMessage[]
  agents: Agent[]
}
/** Migrated prototype agent status. */
export type AgentStatus = 'running' | 'idle' | 'stopped' | 'done'

/** Migrated prototype agent. */
export type Agent = {
  id: string
  name: string
  taskIds: string[]
  status: AgentStatus
  activity: string
}

/** Migrated prototype agent draft. */
export type AgentDraft = Omit<Agent, 'id' | 'status'>
