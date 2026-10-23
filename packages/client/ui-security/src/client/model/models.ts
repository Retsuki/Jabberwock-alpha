/** Migrated prototype ai model. */
export type AiModel = { id: string; label: string }

/** Migrated prototype ai_models. */
export const AI_MODELS: AiModel[] = [
  { id: 'claude-fable-5-1', label: 'Fable 5.1' },
  { id: 'claude-opus-5-5', label: 'Opus 5.5' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5' },
]

/** Migrated prototype default_model_id. */
export const DEFAULT_MODEL_ID = 'claude-sonnet-5-5'
