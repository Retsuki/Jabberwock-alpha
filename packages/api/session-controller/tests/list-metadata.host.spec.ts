/** Published owner results count as conversation history without synthetic model turns. */
import { expect, it } from 'vitest'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { SessionSeq } from '@deepseek-ai/dsh-session'
import { applySessionListMetadata } from '../src/list.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'test-session-notice': { kind: 'test-session-notice'; form: 'notice'; visibleInHistory?: true }
  }
}
const blank = { blank: true, lastPromptAt: null }
function message(text: string | null, notice = false, visible = false): SessionEvent<'user/message'> {
  return { type: 'user/message', seq: SessionSeq(0), time: 7, surfaceOp: 'append', data: createUserMessage({
    source: notice ? { kind: 'test-session-notice', form: 'notice', ...(visible ? { visibleInHistory: true as const } : {}) } : { kind: 'user' },
    content: text === null ? [] : [{ type: 'text', text }],
  }) }
}
it('keeps human prompts provisional until a turn starts while updating recency', () => {
  expect(applySessionListMetadata(blank, message('Human prompt'))).toEqual({ blank: true, lastPromptAt: 7 })
})
it('retains producer-opted-in appended history without changing human recency', () => {
  expect(applySessionListMetadata(blank, message('Saved result', true, true))).toEqual({ blank: false, lastPromptAt: null })
})
it.each(['', '   ', null])('keeps empty or absent content %s provisional', (text) => {
  expect(applySessionListMetadata(blank, message(text, true, true))).toBe(blank)
})
it('does not let replacement material create a new published conversation', () => {
  const event = message('Replacement summary', true, true)
  event.surfaceOp = { op: 'replace', startSeq: SessionSeq(0), endSeq: SessionSeq(0) }
  expect(applySessionListMetadata(blank, event)).toBe(blank)
})

it('keeps ordinary internal notices out of history unless their producer explicitly opts in', () => {
  expect(applySessionListMetadata(blank, message('Internal setup notice', true))).toBe(blank)
})
