/** Workspace-owned dependency advisory checks; no model or project code executes. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'

/** Lifecycle of one persisted advisory check. */
export type SupplyChainStatus = 'running' | 'completed' | 'incomplete' | 'failed' | 'cancelled' | 'interrupted'
/** Fixed scanner progress stages. */
export type SupplyChainPhase = 'lockfile' | 'advisories' | 'formatting' | 'done'
/** Known advisory risk classification, retaining unknown upstream values explicitly. */
export type SupplyChainSeverity = 'critical' | 'high' | 'moderate' | 'low' | 'info' | 'unknown'
/** One package/version match, not proof of application reachability or exploitability. */
export interface SupplyChainFinding {
  /** Installed package name. */
  package: string
  /** Locked installed version. */
  version: string
  /** Public advisory title. */
  title: string
  /** Published advisory description; absent metadata stays unknown. */
  description?: string | undefined
  /** Public severity. */
  severity: SupplyChainSeverity
  /** Upstream affected version expression. */
  vulnerableRange: string
  /** Advisory URL from the public source. */
  advisoryUrl: string
  /** Valid public GitHub advisory identifier when supplied. */
  ghsaId?: string | undefined
  /** Public CVE identifiers when supplied. */
  cveIds: string[]
  /** Earliest known fixed version, when the source supplies one. */
  fixedVersion?: string | undefined
  /** Available fix differs from explicitly unavailable or unspecified fix metadata. */
  fixStatus: 'available' | 'unavailable' | 'unknown'
  /** Dependency relationship supported by the lockfile. */
  relationship: 'direct' | 'transitive' | 'shared' | 'unknown'
  /** Runtime classification supported by the lockfile. */
  environment: 'production' | 'development' | 'shared' | 'unknown'
  /** Public advisory publication time, when available. */
  publishedAt?: string | undefined
  /** Public advisory update time, when available. */
  updatedAt?: string | undefined
  /** Published CVSS score, when available. */
  cvssScore?: number | undefined
  /** Published CVSS vector, when available. */
  cvssVector?: string | undefined
  /** Published CWE identifiers, when available. */
  cweIds: string[]
}
/** One exact direct dependency definition change. */
export interface SupplyChainRepairChange {
  /** Canonical public package name. */ package: string
  /** Previous locked version. */ from: string
  /** Exact selected version, rechecked against current advisories. */ to: string
}
/** One bounded manifest/lock patch and its stale-input witnesses. */
export interface SupplyChainRepairFile {
  /** Workspace-relative file name. */ path: string
  /** SHA-256 of original bytes. */ beforeHash: string
  /** SHA-256 of proposed bytes. */ afterHash: string
  /** Bounded human-readable changed lines. */ diff: string
}
/** Durable progress of definition-only dependency repair. */
export interface SupplyChainRepair {
  /** Stable owner action identity. */ requestId: string
  /** Repair lifecycle, separate from the original scan result. */
  status: 'running' | 'completed' | 'incomplete' | 'failed' | 'cancelled' | 'stale' | 'unsupported' | 'interrupted'
  /** Fixed repair stage. */ phase: 'preparing' | 'updating' | 'rechecking' | 'applying' | 'done'
  /** Start time in milliseconds. */ startedAt: number
  /** Last durable update time. */ updatedAt: number
  /** Factual action or failure explanation. */ message: string
  /** Requested package groups. */ packages: string[]
  /** Validated exact version changes. */ changes: SupplyChainRepairChange[]
  /** Recorded definition differences. */ files: SupplyChainRepairFile[]
  /** Coverage gaps and packages left unchanged. */ warnings: string[]
  /** New saved scan of the generated/applied definitions. */ resultRunId?: string | undefined
  /** Local private recovery directory, never sent to a model automatically. */ recoveryPath?: string | undefined
  /** Whether applying both definition files completed. */ applied?: boolean | undefined
  /** This operation does not install node_modules. */ definitionOnly: true
  /** Application build and functional tests are never implied by advisory verification. */ runtimeTests: 'not-run'
}
/** Owner-only saved-results query. */
export interface SupplyChainListRequest { /** Registered Workspace. */ workspaceId: WorkspaceId }
/** Recorded checks, newest first. */
export interface SupplyChainListResult { /** Detached durable runs. */ runs: SupplyChainRun[] }
/** Fix saved package groups; no version, command or directory is accepted. */
export interface SupplyChainRepairRequest {
  /** Registered Workspace. */ workspaceId: WorkspaceId
  /** Exact original check. */ runId: string
  /** Stable action identity. */ requestId: string
  /** Omission selects all eligible groups; each name covers all its advisories. */ packages?: string[] | undefined
}
/** Complete serializable state retained in the ordinary owning Session. */
export interface SupplyChainRun {
  /** Registered Workspace identity; callers cannot provide a directory. */
  workspaceId: WorkspaceId
  /** Stable scanner run identity. */
  runId: string
  /** Ordinary dedicated conversation containing this run's records. */
  sessionId: SessionId
  /** Owner-provided idempotency identity. */
  requestId: string
  /** Durable lifecycle state. */
  status: SupplyChainStatus
  /** Current fixed scanner stage. */
  phase: SupplyChainPhase
  /** Unix epoch milliseconds at creation. */
  createdAt: number
  /** Unix epoch milliseconds at the latest persisted change. */
  updatedAt: number
  /** Human-readable progress or terminal explanation. */
  message: string
  /** Discovered root lockfile and actual checked scope. */
  lockfile?: { /** Absolute trusted lockfile path. */ path: string; /** Lock format. */ packageManager: 'npm' | 'pnpm'; /** Shared lockfiles include sibling workspace dependencies. */ scope: 'project' | 'workspace' } | undefined
  /** Number of distinct locked package/version pairs submitted for comparison. */
  checkedPackages: number
  /** Advisory matches; duplicates for different installed versions are separate rows. */
  findings: SupplyChainFinding[]
  /** Bounded scanner warnings and incomplete-coverage explanations. */
  warnings: string[]
  /** Original manifest/lock digest; older checks without a witness require a new check before repair. */
  inputDigest?: string | undefined
  /** Latest repair action; prior snapshots remain in Session history. */
  repair?: SupplyChainRepair | undefined
  /** Factual Markdown report, including uncertainty and checked scope. */
  markdown?: string | undefined
  /** Owner deletion time; this latest snapshot hides the run while earlier snapshots stay in the Session log. */
  deletedAt?: number | undefined
}
/** Start or reopen a fixed check for one registered Workspace. */
export interface SupplyChainStartRequest {
  /** Registered Workspace identity. */
  workspaceId: WorkspaceId
  /** Stable owner request identity. */
  requestId: string
}
/** Read the latest check, or one exact prior run. */
export interface SupplyChainReadRequest {
  /** Registered Workspace identity. */
  workspaceId: WorkspaceId
  /** Optional exact run identity; omission selects the latest run. */
  runId?: string | undefined
}
/** Cancel one owned check without accepting arbitrary job identifiers. */
export interface SupplyChainCancelRequest extends SupplyChainReadRequest {
  /** Exact scanner run to cancel. */
  runId: string
}
/** Hide one finished check; its Session and earlier snapshots are retained. */
export interface SupplyChainRemoveRequest extends SupplyChainReadRequest {
  /** Exact finished run to hide. */
  runId: string
}
/** Deletion time of the removed run. */
export interface SupplyChainRemoveResult {
  /** Hidden scanner run. */ runId: string
  /** Unix epoch milliseconds recorded in the tombstone snapshot. */ deletedAt: number
}
/** Reading a workspace with no recorded check is distinct from a zero-finding result. */
export interface SupplyChainReadResult {
  /** Last recorded state, when a check exists. */
  run?: SupplyChainRun | undefined
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** Fixed scanner notice, never an instruction to start inference.
     * @persistenceAttribution
     */
    'security-supply-chain': { kind: 'security-supply-chain'; form: 'notice'; visibleInHistory?: true; summary: string; owner: SessionId; run: SupplyChainRun }
  }
}
