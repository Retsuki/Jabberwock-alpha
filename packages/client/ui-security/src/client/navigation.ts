/** Selection shared by workspace navigation and the main security surface. */
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'

type WorkspaceId = PropsRuntime<'sidebar.workspaces.project.children'>['workspaceId']

/** Task detail destination requested by an explicit owner navigation action. */
export type SecurityTaskView = 'sessions' | 'overview' | 'findings' | 'report'

/** Security section selected from a workspace menu. */
export type SecurityView = 'assets' | 'tasks' | 'supply-chain' | 'findings' | 'agents'
/** Selected workspace and section; independent of the active chat session. */
export interface SecuritySelection {
  workspaceId: WorkspaceId
  projectId: string
  view: SecurityView
  taskId?: string | undefined
  taskView?: SecurityTaskView | undefined
}
/** Injected navigation shared by the two registration surfaces. */
export interface SecurityNavigation {
  hooks: { securitySelection: ObservableSnapshot<SecuritySelection | undefined> }
  openSecurity(workspaceId: WorkspaceId, title: string, view: SecurityView): void
}
