/** Replay scanner-owned notices as a chat card without starting a model turn. */
import type { ChatNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SupplyChainRun } from '../supply-chain-types.ts'

declare module '@deepseek-ai/dsh-client-ui-chat/client' {
  interface ChatNodeDataMap {
    /** Persisted factual supply-chain scan, independent of model messages. */
    'security-supply-chain': SupplyChainRun
  }
}
function scan(event: Parameters<ConversationNodeDefinition['match']>[0]): SupplyChainRun | undefined {
  if (event.type !== 'user/message' || event.data.source.kind !== 'security-supply-chain') return undefined
  const source = event.data.source
  return source.owner === source.run.sessionId ? source.run : undefined
}
/** Every full snapshot can start replay; subsequent notices update the same run card. */
export const supplyChainDefinition: ConversationNodeDefinition<SupplyChainRun> = {
  kind: 'security-supply-chain', target: 'chat',
  match: (event) => { const run = scan(event); return run ? { id: run.runId, role: 'start' } : null },
  start: (_context, match) => {
    const run = scan(match.event)
    if (!run) throw new Error('Supply-chain cards require scanner notices')
    return run
  },
  update: (context, match) => scan(match.event) ?? context.state,
  buildViewNode: (context) => {
    if (!context.start || !context.state) return null
    return { key: context.key, kind: 'security-supply-chain', id: context.id, target: 'chat',
      anchorSeq: context.start.event.seq, location: context.start.location, visibility: context.state.deletedAt === undefined ? 'visible' : 'hidden', data: context.state,
    } satisfies ChatNode<'security-supply-chain'>
  },
}
