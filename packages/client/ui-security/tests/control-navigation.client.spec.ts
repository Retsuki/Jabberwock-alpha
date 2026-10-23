import { describe, expect, it } from 'vitest'
import { securityControlActivityTarget, securityControlTarget, securityControlTargets } from '../src/client/control-navigation.ts'

describe('main chat explicit task navigation', () => {
  it('accepts the service open result and defaults to sessions', () => {
    expect(securityControlTarget(JSON.stringify({ action: 'open', workspaceId: 'w', taskId: 't', data: '{}' }), 4))
      .toEqual({ workspaceId: 'w', taskId: 't', view: 'sessions', seq: 4 })
  })
  it('ignores unrelated reads, invalid JSON, missing ownership and unknown destinations', () => {
    for (const value of [null, 'not json', { action: 'read', workspaceId: 'w', taskId: 't' },
      { action: 'open', taskId: 't' }, { action: 'open', workspaceId: '', taskId: 't' },
      { action: 'open', workspaceId: 'w', taskId: 't', view: 'shell' }]) {
      expect(securityControlTarget(value, 1)).toBeUndefined()
    }
  })
  it('ignores failed and unrelated native tool results', () => {
    const result = { action: 'open', workspaceId: 'w', taskId: 't' }
    expect(securityControlActivityTarget(JSON.stringify({ name: 'security_control', error: 'denied', result }), 2)).toBeUndefined()
    expect(securityControlActivityTarget(JSON.stringify({ name: 'other', result }), 2)).toBeUndefined()
    expect(securityControlActivityTarget(JSON.stringify({ name: 'security_control', result: JSON.stringify(result) }), 2)?.taskId).toBe('t')
    expect(securityControlActivityTarget(JSON.stringify({ name: 'mcp__host__security_control', result: JSON.stringify(result) }), 2)?.taskId).toBe('t')
  })
  it('keeps response ordering and distinct views without duplicating links', () => {
    const first = securityControlTarget({ action: 'open', workspaceId: 'w', taskId: 't', view: 'findings' }, 2)!
    const second = securityControlTarget({ action: 'open', workspaceId: 'w', taskId: 't', view: 'overview' }, 6)!
    expect(securityControlTargets([first, { ...first, seq: 3 }, second], 4)).toEqual([first])
    expect(securityControlTargets([first, second], 6)).toEqual([first, second])
  })
})
