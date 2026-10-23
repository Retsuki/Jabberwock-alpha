/** Replay explicit successful security navigation results into turn-owned view data. */
import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SecuritySelection, SecurityTaskView } from './navigation.ts'

/** Navigation coordinates recorded by the workspace-authorized control service. */
export interface SecurityControlTarget {
  workspaceId: SecuritySelection['workspaceId']
  taskId: string
  view: SecurityTaskView
  seq: number
}
interface ControlState { turn: number; calls: ReadonlySet<string>; targets: readonly SecurityControlTarget[] }
declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationTurnDataMap {
    /** Explicit task navigation from successful owner control calls. */
    securityControl: readonly SecurityControlTarget[]
  }
}
function object(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function json(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) }
  catch (_error: unknown) { return undefined }
}
function tool(name: unknown): boolean { return name === 'security_control' || name === 'mcp__host__security_control' }
/** Extract only the explicit open result; assistant prose and failed outputs stay inert.
 * @param value Recorded control result, optionally serialized as JSON.
 * @param seq Result event sequence.
 * @returns Validated navigation target, or undefined for unrelated data.
 */
export function securityControlTarget(value: unknown, seq: number): SecurityControlTarget | undefined {
  const result = json(value)
  if (!object(result) || result.action !== 'open' || typeof result.workspaceId !== 'string' || !result.workspaceId.trim()
    || typeof result.taskId !== 'string' || !result.taskId.trim()) return undefined
  const view = result.view ?? 'sessions'
  if (view !== 'sessions' && view !== 'overview' && view !== 'findings' && view !== 'report') return undefined
  return { workspaceId: result.workspaceId as SecuritySelection['workspaceId'], taskId: result.taskId, view, seq }
}
/** Accept only successful named host-tool activity, including replay after restart.
 * @param detail Serialized native activity result.
 * @param seq Result event sequence.
 * @returns Validated target, or undefined for failed or unrelated tools.
 */
export function securityControlActivityTarget(detail: string, seq: number): SecurityControlTarget | undefined {
  const value = json(detail)
  if (!object(value) || !tool(value.name) || value.error !== undefined) return undefined
  return securityControlTarget(value.result, seq)
}
/** Keep navigation bounded by the closing response and deduplicate identical destinations.
 * @param targets Recorded targets from this turn.
 * @param seq Closing response event sequence.
 * @returns Unique destinations available at this response.
 */
export function securityControlTargets(targets: readonly SecurityControlTarget[], seq: number): readonly SecurityControlTarget[] {
  return targets.filter((target, index) => target.seq <= seq && !targets.slice(0, index).some(prior =>
    prior.workspaceId === target.workspaceId && prior.taskId === target.taskId && prior.view === target.view))
}
/** Native host activity and Harness results share the same turn-local projection. */
export const securityControlDefinition: ConversationNodeDefinition<ControlState> = {
  kind: 'securityControl',
  match: (event) => {
    if (event.type === 'turn/start') return { id: String(event.data.turn), role: 'start' }
    if (event.type === 'tool/call' || event.type === 'tool/result' || event.type === 'engine/activity') return { id: String(event.data.turn), role: 'update' }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== 'turn/start') throw new Error('securityControl requires turn/start')
    return { turn: match.event.data.turn, calls: new Set(), targets: [] }
  },
  update: (context, match) => {
    const event = match.event
    if (event.type === 'tool/call') {
      if (!tool(event.data.name)) return context.state
      return { ...context.state, calls: new Set([...context.state.calls, String(event.data.callId)]) }
    }
    let target: SecurityControlTarget | undefined
    if (event.type === 'engine/activity' && event.data.kind === 'host-tool-result') {
      target = securityControlActivityTarget(event.data.detail, event.seq)
    } else if (event.type === 'tool/result' && event.data.message.isError !== true && context.state.calls.has(String(event.data.message.source.callId))) {
      target = securityControlTarget(event.data.meta, event.seq)
      if (!target) {
        const content = event.data.message.content
        const blocks: readonly unknown[] = Array.isArray(content) ? content : []
        for (const block of blocks) {
          if (object(block) && block.type === 'text') { target = securityControlTarget(block.text, event.seq); if (target) break }
        }
      }
    }
    return target ? { ...context.state, targets: [...context.state.targets, target] } : context.state
  },
  buildLocationData: (context, scope, previous) => {
    if (scope !== 'turn' || !context.state) return null
    if (previous?.kind === 'turn' && previous.turn === context.state.turn && previous.key === 'securityControl' && previous.value === context.state.targets) return previous
    return { kind: 'turn', turn: context.state.turn, key: 'securityControl', value: context.state.targets }
  },
}
