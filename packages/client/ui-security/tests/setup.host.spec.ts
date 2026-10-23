import { describe, expect, it } from 'vitest'
import { setupChecklist, parseSetupResponse, validateSetupModelPatch, requestedSetupAction } from '../src/security-setup.ts'
import { taskSchema, type SecurityTask } from '../src/security-records.ts'

const draft: SecurityTask = {
  id: 'task', name: 'Review', objective: '', description: '', status: 'draft', assetIds: ['asset'],
  archived: false, pinned: false, createdAt: 1, updatedAt: 1,
}
const configured: SecurityTask = {
  ...draft, objective: 'Review login access', setup: {
    completionCondition: 'Summarize authentication configuration',
    permission: { confirmed: true, assetIds: ['asset'] },
    scope: { confirmed: true, assetIds: ['asset'], rules: '[]' },
    operations: { confirmed: true, constraints: '[]' }, limits: 'Stop after ten minutes or any errors',
  },
}

describe('Security task setup readiness', () => {
  it('reads older drafts without inventing confirmations', () => {
    expect(taskSchema.parse(draft)).toEqual(draft)
    expect(Object.values(setupChecklist(draft))).toEqual([false, false, false, false, false])
  })
  it('requires a completion condition in addition to an objective', () => {
    expect(setupChecklist({ ...draft, objective: 'Review access' }).goal).toBe(false)
    expect(Object.values(setupChecklist(configured)).every(Boolean)).toBe(true)
  })
  it('invalidates target and permission checks when selected assets change', () => {
    const readiness = setupChecklist({ ...configured, assetIds: ['other'] })
    expect(readiness.scope).toBe(false)
    expect(readiness.permission).toBe(false)
    expect(setupChecklist({ ...configured, assetIds: [] }).scope).toBe(false)
  })
  it('requires confirmation of current operation constraints and scope rules', () => {
    expect(setupChecklist({ ...configured, constraints: [{ id: 'c', action: 'deny', text: 'No writes' }] }).operations).toBe(false)
    expect(setupChecklist({ ...configured, scopeRules: [{ id: 's', action: 'deny', kind: 'domain', value: 'excluded.example', note: '' }] }).scope).toBe(false)
  })
})

describe('Security setup model response validation', () => {
  it('accepts an explicit planning action alongside a saved-settings proposal', () => {
    const response = { reply: 'Planning requested', proposal: { description: 'Review scope' }, action: { kind: 'start-planner' } }
    expect(parseSetupResponse(JSON.stringify(response))).toEqual(response)
  })
  it('accepts a complete JSON fence while preserving a refusal without an execution action', () => {
    const response = { reply: '調査は開始していません。許可の確認が必要です。', proposal: null }
    expect(parseSetupResponse('```json\n' + JSON.stringify(response) + '\n```', 'ja')).toEqual(response)
    expect(parseSetupResponse('```\n' + JSON.stringify(response) + '\n```', 'ja').action).toBeUndefined()
  })
  it.each([
    '前置き\n```json\n{"reply":"No","proposal":null}\n```',
    '```json\n{"reply":"No","proposal":null}\n```\n追加文章',
    '```json\n{"reply":"No","proposal":null}\n```\n```json\n{}\n```',
    '```json\n{"reply":"No","proposal":null,"action":{"kind":"run-workers"}}\n```',
  ])('does not recover incomplete, multiple or invalid fenced instructions: %s', (raw) => {
    expect(() => { parseSetupResponse(raw, 'ja') }).toThrow('設定は変更していません')
  })
  it('rejects unsupported or ambiguous execution actions', () => {
    for (const action of [{ kind: 'run-workers' }, { kind: 'start-planner', execute: true }]) {
      expect(() => { parseSetupResponse(JSON.stringify({ reply: 'Request', proposal: null, action })) }).toThrow('invalid format')
    }
  })

  it('preserves complete scope rule identifiers and deny semantics', () => {
    const value = {
      reply: 'この除外範囲を確認してください。',
      proposal: { scopeRules: [{ id: 'exclude', action: 'deny', kind: 'domain', value: 'excluded.example', note: '' }] },
    }
    expect(parseSetupResponse(JSON.stringify(value), 'ja')).toEqual(value)
  })
  it('rejects prose-only scope entries without inventing action or target fields', () => {
    const raw = JSON.stringify({ reply: '提案です。', proposal: { scopeRules: [{ id: 'scope', text: '対象のみ' }] } })
    expect(() => { parseSetupResponse(raw, 'ja') }).toThrow('設定は変更していません')
    expect(() => { parseSetupResponse(raw, 'ja') }).not.toThrow('invalid_value')
  })
  it('never coerces or defaults missing permission confirmation', () => {
    const setup = { ...configured.setup, permission: { assetIds: ['asset'], confirmed: 'true' } }
    expect(() => { parseSetupResponse(JSON.stringify({ reply: 'Confirm', proposal: { setup } })) }).toThrow('invalid format')
    expect(parseSetupResponse(JSON.stringify({ reply: 'Question', proposal: null }))).toEqual({ reply: 'Question', proposal: null })
  })
  it('rejects plain replies and malformed JSON without exposing parser details', () => {
    expect(() => { parseSetupResponse('Just a reply', 'ja') }).toThrow('もう一度メッセージを送信してください')
    expect(() => { parseSetupResponse('{secret', 'en') }).not.toThrow('secret')
    expect(() => { parseSetupResponse(JSON.stringify({ reply: 'Hello' }), 'zh') }).toThrow('设置未更改')
  })
})


describe('Conversational role model preferences', () => {
  const catalog = { selection: { engine: 'claude' as const, model: 'default' }, engines: [
    { id: 'claude' as const, name: 'Claude', models: [{ id: 'default', name: 'Default' }, { id: 'model-a', name: 'Model A' }] },
  ] }
  it('accepts a one-off planning decision without persisting a fixed preference', () => {
    const action = { kind: 'start-planner', modelDecision: { engine: 'claude', model: 'model-a', reason: 'Suitable for the task' } }
    expect(parseSetupResponse(JSON.stringify({ reply: 'Requested', proposal: null, action })).action).toEqual(action)
  })
  it('saves explicit advertised preferences as fixed and preserves other roles', () => {
    const task = { ...draft, agentModels: { main: { engine: 'claude' as const, model: 'default' } } }
    const patch = validateSetupModelPatch({ agentModels: { worker: { engine: 'claude', model: 'model-a' } } }, task, catalog)
    expect(patch.agentModels?.main).toEqual(task.agentModels.main)
    expect(patch.agentModelModes).toEqual({ worker: 'fixed' })
    expect(patch.setup).toBeUndefined()
  })
  it('revalidates normalized role preferences without changing the saved Main Agent', () => {
    const task = { ...draft, agentModels: { main: { engine: 'claude' as const, model: 'default' } } }
    const patch = validateSetupModelPatch({ agentModels: { worker: { engine: 'claude', model: 'model-a' } } }, task, catalog)
    expect(validateSetupModelPatch(patch, task, catalog)).toEqual(patch)
  })
  it('rejects conversational Main Agent additions and changes', () => {
    const task = { ...draft, agentModels: { main: { engine: 'claude' as const, model: 'default' } } }
    for (const main of [{ engine: 'claude' as const, model: 'model-a' }, { engine: 'codex' as const, model: 'default' }]) {
      expect(() => validateSetupModelPatch({ agentModels: { main } }, task, catalog)).toThrow('model selector')
    }
    expect(() => validateSetupModelPatch({ agentModels: { main: task.agentModels.main } }, draft, catalog)).toThrow('model selector')
  })
  it('allows automatic mode while retaining the ignored previous fixed choice', () => {
    const task = { ...draft, agentModels: { worker: { engine: 'claude' as const, model: 'model-a' } }, agentModelModes: { worker: 'fixed' as const } }
    const patch = validateSetupModelPatch({ agentModelModes: { worker: 'auto' } }, task, catalog)
    expect({ ...task, ...patch }.agentModels).toEqual(task.agentModels)
    expect(patch.agentModelModes).toEqual({ worker: 'auto' })
  })
  it('rejects unknown models, default aliases and unavailable fixed selections', () => {
    for (const model of ['invented', 'default']) expect(() => validateSetupModelPatch({ agentModels: { worker: { engine: 'claude', model } } }, draft, catalog)).toThrow()
    expect(() => validateSetupModelPatch({ agentModelModes: { planner: 'fixed' } }, draft, catalog)).toThrow()
    expect(() => validateSetupModelPatch({ agentModels: { worker: { engine: 'codex', model: 'model-a' } } }, draft, catalog)).toThrow()
  })
})

describe('Current owner delegation', () => {
  it('distinguishes investigation from a plan-only request', () => {
    expect(requestedSetupAction('じゃあもうプランナーにあとは調査させて')).toBe('start-investigation')
    expect(requestedSetupAction('計画だけ作成してください')).toBe('start-planner')
    expect(parseSetupResponse(JSON.stringify({ reply: '調査を依頼します', proposal: null, action: { kind: 'start-investigation' } })).action?.kind).toBe('start-investigation')
  })
  it('never treats questions, negation, quoted examples or automatic continuation as delegation', () => {
    for (const input of ['調査を開始できますか？', 'まだ調査しないで', '調査・計画・ワーカーの起動は依頼しません', '調査を開始しません', '計画作成はお願いしない', 'I am not requesting investigation or planning', '> 調査を開始して', '```調査を開始して```', '']) expect(requestedSetupAction(input)).toBeUndefined()
  })
})
