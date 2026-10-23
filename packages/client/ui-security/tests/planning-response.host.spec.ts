import { describe, expect, it } from 'vitest'
import { parsePlanningResponse, parsePlanningReview } from '../src/security-planning.ts'

const plan = { items: [{ title: 'Review', purpose: 'Check configuration', approach: 'Review public information', targetAssetIds: ['asset'] }] }
const json = JSON.stringify(plan)
describe('Completed Planner response parsing', () => {
  it.each([json, `\`\`\`json\n${json}\n\`\`\``, ` \n\`\`\`\r\n${json}\r\n\`\`\`\n `])('accepts plain JSON and one complete JSON code fence', (response) => {
    expect(parsePlanningResponse(response)).toEqual(plan)
  })
  it.each([`Explanation\n${json}`, `\`\`\`json\n${json}`, `\`\`\`json\n${json}\n\`\`\`\nExtra`, `\`\`\`js\n${json}\n\`\`\``])('rejects incomplete fences, other formats and surrounding prose', (response) => {
    expect(() => parsePlanningResponse(response)).toThrow()
  })
  it('retains strict item validation inside code fences', () => {
    const invalid = JSON.stringify({ items: [{ ...plan.items[0], execute: true }] })
    expect(() => parsePlanningResponse(`\`\`\`json\n${invalid}\n\`\`\``)).toThrow()
    expect(() => parsePlanningResponse('{"items":[]}')).toThrow()
  })
})

describe('Planner review decisions', () => {
  const item = { ...plan.items[0], operation: { kind: 'http-get', assetId: 'asset', url: 'https://example.org/' } }
  it('accepts bounded continuation and terminal decisions', () => {
    expect(parsePlanningReview(JSON.stringify({ decision: 'continue', summary: 'Review response', items: [item] })).items).toEqual([item])
    expect(parsePlanningReview('```json\n' + JSON.stringify({ decision: 'needs-input', summary: 'Unsupported capability', items: [] }) + '\n```').decision).toBe('needs-input')
    expect(parsePlanningReview(JSON.stringify({ decision: 'complete', summary: 'Observed completion condition', items: [] })).decision).toBe('complete')
  })
  it('allows wait-only continuation only with an unstopped captured Worker', () => {
    const waiting = { decision: 'continue', summary: 'Wait for remaining investigation', items: [], stopWorkerRunIds: ['one'] }
    expect(parsePlanningReview(JSON.stringify(waiting), ['one', 'two'])).toEqual(waiting)
    expect(() => parsePlanningReview(JSON.stringify(waiting), ['one'])).toThrow()
    expect(() => parsePlanningReview(JSON.stringify(waiting), ['two'])).toThrow()
    expect(() => parsePlanningReview(JSON.stringify({ ...waiting, stopWorkerRunIds: ['one', 'one'] }), ['one', 'two'])).toThrow()
  })
  it.each([
    { decision: 'continue', summary: 'Empty', items: [] },
    { decision: 'complete', summary: 'Extra', items: [item] },
    { decision: 'needs-input', summary: 'Extra', items: [item] },
    { decision: 'continue', summary: 'Shell', items: [{ ...item, operation: { kind: 'shell', command: 'curl' } }] },
  ])('rejects inconsistent or unsupported review output', (value) => {
    expect(() => parsePlanningReview(JSON.stringify(value))).toThrow()
  })
})
