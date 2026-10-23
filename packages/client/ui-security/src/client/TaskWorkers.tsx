/** Explicitly approved bounded Worker operations and durable results. */
import type { ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SecurityConversationRequest } from '../conversation-types.ts'
import type { SecurityWorkerSendRequest, SecurityWorkerStartRequest, SecurityWorkerState, SecurityBrowserCredentialsRequest } from '../worker-types.ts'
import { WorkerChat } from './WorkerChat.tsx'
/** Worker commands exposed to task panels; reads never start executions. */
export interface WorkerFace {
  setSecurityBrowserCredentials(this: void, request: SecurityBrowserCredentialsRequest): Promise<{ configured: boolean }>
  readSecurityWorkers(this: void, target: SecurityConversationRequest): Promise<SecurityWorkerState>
  sendSecurityWorker(this: void, request: SecurityWorkerSendRequest): Promise<SecurityWorkerState>
  startSecurityWorker(this: void, request: SecurityWorkerStartRequest): Promise<void>
  cancelSecurityWorker(this: void, target: SecurityConversationRequest & { runId?: string }): Promise<void>
  approveSecurityWorkerTool(
    this: void, request: SecurityConversationRequest & { runId: string; approvalId: string; allow: boolean },
  ): Promise<SecurityWorkerState>
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Sessions view of actual Worker runs and captured observations. */
    'security.sessions.workers': { kind: 'single'; scope: 'root'; owner: SecurityConversationRequest & { runId?: string; state: SecurityWorkerState | undefined; readError: boolean; refresh: () => Promise<void> } }
  }
}
type Props = PropsRuntime<'security.sessions.workers'> & PropsLocale<'security'> & InjectFace<WorkerFace>
/** Display one selected Worker using the parent-owned execution projection.
 * @param props - task identity and owner-validated Worker commands.
 * @returns lifecycle, selected models and captured results.
 */
export function TaskWorkers(props: Props): ReactNode {
  return <WorkerChat key={JSON.stringify([props.workspaceId, props.taskId, props.runId])} {...props} />
}
