import { describe, expect, it } from 'vitest'
import { resolveTaskAgentMode, resolveTaskModelDecision, resolveConversationSelection, resolveTaskAgentSelection, validateConversationSelection } from '../src/security-conversations.ts'
import { taskSchema } from '../src/security-records.ts'
import type { SecurityConversationCatalog } from '../src/conversation-types.ts'

const catalog: SecurityConversationCatalog = {
  selection: { engine: 'claude', model: 'default' },
  engines: [{ id: 'claude', name: 'Claude', models: [{ id: 'default', name: 'Default' }, { id: 'provider-model', name: 'Model' }] }],
}

describe('Task conversation model selection', () => {
  it('keeps legacy task mappings on the existing Claude default', () => {
    expect(resolveConversationSelection({})).toEqual({ engine: 'claude', model: 'default' })
  })
  it('preserves an explicitly saved model instead of silently falling back', () => {
    const selected = resolveConversationSelection({ engine: 'claude', model: 'retired-model' })
    expect(selected.model).toBe('retired-model')
    expect(() => { validateConversationSelection(catalog, selected) }).toThrow('available conversation-only')
  })
  it('accepts only exact provider-owned model choices', () => {
    expect(() => { validateConversationSelection(catalog, { engine: 'claude', model: 'provider-model' }) }).not.toThrow()
    expect(() => { validateConversationSelection(catalog, { engine: 'claude', model: 'invented-model' }) }).toThrow()
  })
  it('rejects Codex when no conversation-only engine is registered', () => {
    expect(() => { validateConversationSelection(catalog, { engine: 'codex', model: 'default' }) }).toThrow()
  })
})

describe('Role model selection', () => {
  it('keeps legacy main selection isolated from default planner and worker', () => {
    const legacy = { engine: 'claude' as const, model: 'provider-model' }
    expect(resolveTaskAgentSelection({}, 'main', legacy)).toEqual(legacy)
    expect(resolveTaskAgentSelection({}, 'planner', legacy).model).toBe('default')
    expect(resolveTaskAgentSelection({}, 'worker', legacy).model).toBe('default')
  })
  it('resolves each explicit role independently and rejects unavailable overrides', () => {
    const task = { agentModels: { main: { engine: 'claude' as const, model: 'default' }, planner: { engine: 'claude' as const, model: 'provider-model' }, worker: { engine: 'claude' as const, model: 'retired-model' } } }
    expect(resolveTaskAgentSelection(task, 'main').model).toBe('default')
    expect(resolveTaskAgentSelection(task, 'planner').model).toBe('provider-model')
    expect(() => { validateConversationSelection(catalog, resolveTaskAgentSelection(task, 'worker')) }).toThrow()
  })
})

it('reads older task records and rejects malformed role model persistence', () => {
  const legacy = { id: 'task', name: 'Task', description: '', objective: '', status: 'draft', assetIds: [], archived: false, pinned: false, createdAt: 1, updatedAt: 1 }
  expect(taskSchema.parse(legacy).agentModels).toBeUndefined()
  expect(taskSchema.parse({ ...legacy, agentModels: { worker: { engine: 'claude', model: 'provider-model' } } }).agentModels?.worker?.model).toBe('provider-model')
  expect(() => taskSchema.parse({ ...legacy, agentModels: { worker: { engine: 'unsupported', model: '' } } })).toThrow()
})

const task = taskSchema.parse({ id: 'task', name: 'Task', description: '', objective: '', status: 'draft', assetIds: [], archived: false, pinned: false, createdAt: 1, updatedAt: 1 })
describe('Automatic delegated model decisions', () => {
  const choice = { engine: 'claude' as const, model: 'provider-model', reason: 'Matches this investigation' }
  it('treats absent and legacy default choices as automatic, while keeping explicit legacy models fixed', () => {
    expect(resolveTaskAgentMode(task, 'worker')).toBe('auto')
    expect(resolveTaskAgentMode({ agentModels: { planner: { engine: 'claude', model: 'default' } } }, 'planner')).toBe('auto')
    expect(resolveTaskAgentMode({ agentModels: { worker: choice } }, 'worker')).toBe('fixed')
  })
  it('requires an actual explicit model decision in automatic mode', () => {
    expect(() => resolveTaskModelDecision(task, 'planner', catalog)).toThrow('missing')
    expect(() => resolveTaskModelDecision(task, 'worker', catalog, { ...choice, model: 'default' })).toThrow('explicit')
    expect(() => resolveTaskModelDecision(task, 'worker', catalog, { ...choice, model: 'invented' })).toThrow('available')
    expect(resolveTaskModelDecision(task, 'worker', catalog, choice)).toEqual(choice)
  })
  it('keeps a fixed default ahead of an Agent decision', () => {
    const fixed = { ...task, agentModelModes: { worker: 'fixed' as const } }
    expect(resolveTaskModelDecision(fixed, 'worker', catalog, choice).model).toBe('default')
    expect(resolveTaskModelDecision(fixed, 'worker', catalog).model).toBe('default')
  })
})
