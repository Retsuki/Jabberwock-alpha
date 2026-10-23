/** Last-observation projection for native execution-engine context and usage. */

import { z } from 'zod'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { EngineUsageProjection } from './projection.ts'

const tokenCount = z.number().int().nonnegative()
const snapshotFields = {
  engine: z.string().min(1),
  model: z.string().optional(),
  updatedAt: z.number().int().nonnegative(),
  context: z.object({
    usedTokens: tokenCount,
    maxTokens: tokenCount.optional(),
    estimated: z.boolean().optional(),
    categories: z.array(z.object({
      name: z.string(),
      tokens: tokenCount,
      kind: z.string().optional(),
    }).strict()).optional(),
  }).strict().optional(),
  tokens: z.object({
    inputTokens: tokenCount,
    outputTokens: tokenCount,
    cacheReadTokens: tokenCount.optional(),
    cacheWriteTokens: tokenCount.optional(),
  }).strict().optional(),
}
const snapshotSchema: z.ZodType<EngineUsageProjection | null> = z.object({
  ...snapshotFields, requestedModel: z.string().optional(),
}).strict().nullable()
const stateSchema = z.object({
  route: z.object({ provider: z.string(), model: z.string() }).strict().nullable(),
  sample: snapshotSchema,
}).strict()
type UsageState = z.infer<typeof stateSchema>

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    engineUsage: UsageState
  }
}

/** Retain the newest logged sample without mixing engines or accumulating snapshots. */
export const engineUsageProjectionDefinition = {
  key: 'engineUsage',
  stateVersion: 2,
  stateSchema,
  init: (): UsageState => ({ route: null, sample: null }),
  apply: (state, event) => {
    if (event.type === 'request/header') {
      const { provider, model } = event.data.header.config
      return { ...state, route: { provider, model } }
    }
    if (event.type !== 'engine/usage') return state
    const requestedModel = state.route?.provider === `${event.data.engine}-subscription` ? state.route.model : undefined
    return { ...state, sample: { ...event.data, ...(requestedModel === undefined ? {} : { requestedModel }) } }
  },
  wire: { viewSchema: snapshotSchema, view: state => state.sample },
} satisfies ProjectionDefinition<'engineUsage', UsageState>
