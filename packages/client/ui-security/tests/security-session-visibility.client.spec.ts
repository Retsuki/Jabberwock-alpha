import { describe, expect, it } from 'vitest'
import { showInMainSidebar } from '../src/client/security-session-visibility.ts'

describe('task conversation navigation', () => {
  const uuid = '12345678-1234-4234-9234-123456789abc'
  it.each(['security-', 'security-planner-', 'security-worker-', 'security-worker-discussion-'])(
    'keeps existing and new %s sessions in task navigation', (prefix) => {
      expect(showInMainSidebar({ id: prefix + uuid })).toBe(false)
    },
  )
  it.each(['ordinary', 'security-not-a-task', uuid, `note-security-worker-${uuid}`])(
    'preserves an ordinary conversation %s', (id) => { expect(showInMainSidebar({ id })).toBe(true) },
  )
})
