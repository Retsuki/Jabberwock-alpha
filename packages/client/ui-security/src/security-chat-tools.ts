/** Main-chat adapters bind security commands to the live owner Session's registered Workspace. */
import { z } from 'zod'
import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent, EngineHostTool } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-subscription-engines'
import type {} from '@deepseek-ai/dsh-tools'
import type { JsonSchemaNode } from '@deepseek-ai/dsh-tools'
import { principalOf } from '@deepseek-ai/dsh-typert-protocol'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { securityChatCommandSchema } from './control-types.ts'
import type { SecurityControlResult } from './control-types.ts'
import type {} from './security-control.ts'
import { requestedSetupAction } from './security-setup.ts'

const inputSchema = z.object({ command: securityChatCommandSchema }).strict()
const description = 'Operate security tasks in this main chat’s registered workspace. List/read before editing; copy the exact current revision. Create only registered asset IDs. Save agreed configuration; never invent permission or scope confirmations. Setting a confirmed setup flag requires confirmationQuote copied verbatim from the CURRENT owner message explicitly granting that confirmation. Read modelCatalog before choosing models. Plan requests generate a saved plan only and never dispatch Workers or access targets. In automatic Planner mode, plan/start/resume must include modelDecision with an explicit available non-default engine/model and reason; a one-time automatic choice must not change saved fixed preferences. Start/resume only on the CURRENT explicit owner instruction and after all readiness checks. Before starting, compare the owner’s requested bounds against read.executionLimits; resume uses the selected saved execution’s limits instead. setup.limits is descriptive text, not an enforced budget. Do not start/resume if those bounds cannot be guaranteed. Stop awaits existing operations. Message sends an additional instruction to an existing Worker, not the Planner. Open returns a task navigation button; it does not run work. Preserve requestId on retries. Execution acceptance is not completion. Results disclose truncation; use list offset/limit or open instead of guessing missing data.'

// Harness intentionally presents a smaller JSON Schema vocabulary. Zod remains the
// input validator; this projection removes constraints that its presenter cannot carry.
function harnessSchema(input: Record<string, unknown>): JsonSchemaNode {
  const output: JsonSchemaNode = {}
  for (const key of ['type', 'enum', 'const', 'description', 'title', 'required', 'additionalProperties'] as const) {
    if (key in input) Object.assign(output, { [key]: input[key] })
  }
  if (typeof input.properties === 'object' && input.properties !== null) {
    output.properties = Object.fromEntries(Object.entries(input.properties)
      .map(([key, value]) => [key, harnessSchema(z.record(z.string(), z.unknown()).parse(value))]))
  }
  if (input.items !== undefined) output.items = harnessSchema(z.record(z.string(), z.unknown()).parse(input.items))
  const alternatives = input.oneOf ?? input.anyOf
  if (Array.isArray(alternatives)) output.oneOf = alternatives.map(value => harnessSchema(z.record(z.string(), z.unknown()).parse(value)))
  return output
}

/** Resolve current registered membership and reject delegated or internal task Sessions.
 * @param ctx Host owning the live Session and Workspace registries.
 * @param agent Exact live caller, never an identifier supplied by the model.
 * @returns Its unique registered Workspace; unavailable authority is rejected.
 */
export function securityChatWorkspace(ctx: Context, agent: Agent): WorkspaceId {
  if (ctx.sessions.get(agent.id) !== agent.session || agent.session.header.origin === 'subagent'
    || (agent.session.header.delegationDepth ?? 0) > 0 || agent.id.startsWith('security-')
    || principalOf(agent.ctx.invocation) !== undefined) throw new Error('Security controls require an owner main-chat Session')
  const latest = agent.session.deriveMessages().findLast(message => message.role === 'user' && message.source.kind === 'user')
  if (!latest || 'principal' in latest.source) {
    throw new Error('Security controls require a current owner message')
  }
  const workspaces = ctx.workspaceRegistry.list().filter(workspace => workspace.sessionIds.includes(agent.id))
  const workspace = workspaces[0]
  if (workspaces.length !== 1 || workspace === undefined) throw new Error('Main chat must belong to exactly one registered Workspace')
  return workspace.id
}

/** Build one native tool using live authorization again for every accepted operation.
 * @param ctx Host common operation owner and registries.
 * @param agent Calling main-chat Agent.
 * @returns Bound capability; native execution owns durable tool logging.
 */
export function securityChatTool(ctx: Context, agent: Agent): EngineHostTool {
  securityChatWorkspace(ctx, agent)
  return { name: 'security_control', description, inputSchema: z.toJSONSchema(inputSchema),
    async execute(input, signal) {
      signal.throwIfAborted()
      const workspaceId = securityChatWorkspace(ctx, agent)
      const { command } = inputSchema.parse(input)
      const latest = agent.session.deriveMessages().findLast(message => message.role === 'user' && message.source.kind === 'user')
      const text = latest?.content.filter(block => block.type === 'text').map(block => block.text).join('\n') ?? ''
      if ((command.action === 'start' || command.action === 'resume') && requestedSetupAction(text) !== 'start-investigation') {
        throw new Error('Starting or resuming investigation requires an explicit current owner instruction')
      }
      if (command.action === 'update' && command.patch.setup !== undefined
        && (command.patch.setup.permission.confirmed || command.patch.setup.scope.confirmed || command.patch.setup.operations.confirmed)) {
        if (!command.confirmationQuote || !text.includes(command.confirmationQuote)) throw new Error('Setup confirmation requires an exact quote from the current owner message')
      }
      const result = await ctx.securityControl.execute({ workspaceId, ...command,
        ...'requestId' in command ? { requestId: createHash('sha256').update(JSON.stringify([agent.id, command.requestId])).digest('hex') } : {} })
      return JSON.stringify(result)
    },
  }
}

/** Register native Claude and ordinary Harness tools without changing either execution loop.
 * @param ctx Plugin lifetime owning both reversible registrations.
 */
export function registerSecurityChatTools(ctx: Context): void {
  ctx.on('subscription-engines/host-tools', async (request, next) => {
    const prior = await next()
    // Dedicated task/Worker routes have their own capability policy.
    if (request.agent.id.startsWith('security-') || request.agent.session.header.origin === 'subagent'
      || (request.agent.session.header.delegationDepth ?? 0) > 0) return prior
    const memberships = ctx.workspaceRegistry.list().filter(workspace => workspace.sessionIds.includes(request.agent.id))
    if (memberships.length !== 1) return prior
    return [...prior, securityChatTool(ctx, request.agent)]
  })
  ctx.inject(['tools'], (scope) => {
    scope.tools.register({ name: 'security_control', description, parameters: { ...harnessSchema(z.toJSONSchema(inputSchema)) },
      output: {
        schema: { type: 'object', additionalProperties: false, required: ['action', 'workspaceId', 'data'], properties: {
          action: { type: 'string' }, workspaceId: { type: 'string' }, taskId: { type: 'string' }, view: { type: 'string' }, data: { type: 'string' },
        } },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
        presentationMeta: (_args, value) => value,
      },
      async execute(input, exec): Promise<SecurityControlResult> {
        if (!exec.agent) throw new Error('Security control requires an owning main-chat Agent')
        const text = await securityChatTool(ctx, exec.agent).execute(input, exec.signal)
        const parsed = z.object({ action: z.enum(['list', 'read', 'create', 'update', 'plan', 'start', 'resume', 'stop', 'message', 'open']),
          workspaceId: z.string().transform(value => value as WorkspaceId), taskId: z.string().optional(),
          view: z.enum(['sessions', 'overview', 'findings', 'report']).optional(), data: z.string() }).strict().parse(JSON.parse(text))
        return parsed
      },
    })
  })
}
