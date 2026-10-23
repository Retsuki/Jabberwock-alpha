/** Turn-scoped Host tool dispatch for the Codex app-server. @module @deepseek-ai/dsh-subscription-engines/codex-host-tools */
import type { Context } from '@deepseek-ai/cordis'
import type { EngineHostTool, EngineRunRequest } from '@deepseek-ai/dsh-agent'
import { z } from 'zod'
import { activity, text } from './shared.ts'

/** Validated app-server tool declaration; handlers remain bound to the live turn. */
export interface CodexHostToolSpec {
  type: 'function'
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/** Native wire result for one dynamically registered Host tool. */
export interface CodexHostToolResult {
  success: boolean
  contentItems: { type: 'inputText'; text: string }[]
}

/** Owns exact per-turn schemas and executable capabilities; persisted catalogs grant no authority. */
export class CodexHostTools {
  readonly catalog: readonly CodexHostToolSpec[]
  private readonly tools = new Map<string, { definition: EngineHostTool; schema: z.ZodObject }>()
  private readonly calls = new Set<string>()

  constructor(private readonly ctx: Context, private readonly request: EngineRunRequest, definitions: readonly EngineHostTool[]) {
    this.catalog = definitions.map((definition) => {
      if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(definition.name) || this.tools.has(definition.name)) throw new Error('Invalid or duplicate host tool name')
      const schema = z.fromJSONSchema(definition.inputSchema)
      if (!(schema instanceof z.ZodObject)) throw new Error('Host tool input schema must be an object')
      this.tools.set(definition.name, { definition, schema })
      return { type: 'function', name: definition.name, description: definition.description, inputSchema: z.toJSONSchema(schema) }
    })
  }

  /**
   * Compare the thread's original declarations with this turn's current catalog.
   * @param nativeId Existing exact-Session native binding.
   * @param previous Last catalog fact recorded for a successfully opened native thread.
   * @returns Whether app-server resume preserves the same visible tool definitions.
   */
  canResume(nativeId: string | undefined, previous: { nativeId: string; catalog: string } | undefined): boolean {
    return previous === undefined ? this.catalog.length === 0
      : previous.nativeId === nativeId && previous.catalog === JSON.stringify(this.catalog)
  }

  /**
   * Validate the server request and call only the capability bound to this live turn.
   * @param params App-server item/tool/call parameters.
   * @param threadId Expected conversation identity.
   * @param turnId Expected native turn identity.
   * @returns Logged text result; execution failures remain tool failures instead of terminating the native turn.
   */
  async execute(params: Record<string, unknown>, threadId: string | undefined, turnId: string | undefined): Promise<CodexHostToolResult> {
    this.request.signal.throwIfAborted()
    if (threadId === undefined || turnId === undefined || params.threadId !== threadId || params.turnId !== turnId) throw new Error('Codex Host tool referenced another conversation or turn')
    const callId = text(params.callId)
    if (this.calls.has(callId)) throw new Error('Codex Host tool repeated a call identity')
    this.calls.add(callId)
    const name = text(params.tool)
    const tool = params.namespace === undefined || params.namespace === null ? this.tools.get(name) : undefined
    activity(this.request, 'codex', 'host-tool-call', JSON.stringify({ callId, name, input: params.arguments }))
    await this.ctx.sessions.flush(this.request.agent.session)
    try {
      if (tool === undefined) throw new Error('Codex Host tool is not available in this turn')
      const input = tool.schema.parse(params.arguments)
      this.request.signal.throwIfAborted()
      const result = await tool.definition.execute(input, this.request.signal)
      this.request.signal.throwIfAborted()
      activity(this.request, 'codex', 'host-tool-result', JSON.stringify({ callId, name, result }))
      await this.ctx.sessions.flush(this.request.agent.session)
      return { success: true, contentItems: [{ type: 'inputText', text: result }] }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      activity(this.request, 'codex', 'host-tool-result', JSON.stringify({ callId, name, error: message }))
      await this.ctx.sessions.flush(this.request.agent.session)
      this.request.signal.throwIfAborted()
      return { success: false, contentItems: [{ type: 'inputText', text: message }] }
    }
  }
}
