import { describe, expect, it } from 'vitest'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { SecurityFinding } from '../src/finding-types.ts'
import type { SecurityReport } from '../src/report-model.ts'
import { projectExecutiveReport } from '../src/executive-report-model.ts'

function finding(id: string, severity: SecurityFinding['severity'] = 'high', status: SecurityFinding['status'] = 'open'): SecurityFinding {
  return { id, severity, status, title: 'Exposed configuration', summary: 'Observed response', proof: 'test_secret', remediation: 'Restrict access', workspaceId: 'workspace' as WorkspaceId, taskId: 'task', workerRunId: 'worker', assetId: 'asset', createdAt: 1, updatedAt: 2, evidence: { url: 'https://example.org/config', status: 200, headers: {}, body: 'test_secret', bytes: 11 } }
}
function report(findings: SecurityFinding[] = []): SecurityReport {
  return { task: { id: 'task', name: 'Review', description: '', objective: 'Review', status: 'draft', assetIds: ['asset'], archived: false, pinned: false, createdAt: 1, updatedAt: 2 }, assets: [{ id: 'asset', companyId: 'company', kind: 'domain', value: 'example.org' }], findings, retests: [], generatedAt: 2, coverage: 'not-started', operations: [], counts: { confirmed: 0, partial: 0, unverified: 0, unsupported: 0 }, limitations: ['bounded-http'] }
}

describe('executive report projection', () => {
  it('keeps no findings distinct from complete coverage and an executed period', () => {
    const result = projectExecutiveReport(report())
    expect(result.risk).toBe('none')
    expect(result.counts).toEqual({ total: 0, active: 0, fixed: 0 })
    expect(result.severityCounts).toEqual({ critical: 0, high: 0, medium: 0, low: 0, info: 0 })
    expect(result.topFindings).toEqual([])
    expect(result.affectedAssets).toEqual([])
    expect(result.findingTypes).toEqual([])
    expect(result.startedAt).toBeUndefined()
    expect(result.finishedAt).toBeUndefined()
  })
  it('excludes dismissed records while fixed findings remain in totals and accepted risks remain active', () => {
    const input = report([finding('dismissed', 'critical', 'false-positive'), finding('duplicate', 'critical', 'duplicate'), finding('fixed', 'critical', 'fixed'), finding('accepted', 'medium', 'accepted-risk'), finding('confirmed', 'low', 'confirmed'), finding('progress', 'info', 'in-progress')])
    const result = projectExecutiveReport(input)
    expect(result.counts).toEqual({ total: 4, active: 3, fixed: 1 })
    expect(result.risk).toBe('medium')
    expect(result.activeFindings.map(item => item.id)).toEqual(['accepted', 'confirmed', 'progress'])
    expect(result.roadmap).toEqual({ urgent: [], soon: [input.findings[3]], planned: [input.findings[4], input.findings[5]] })
    expect(projectExecutiveReport(report([finding('fixed', 'critical', 'fixed')])).risk).toBe('none')
  })
  it('orders the top five by severity, newest observation, and id without mutating saved records', () => {
    const input = report([finding('low', 'low'), finding('b', 'critical'), finding('a', 'critical'), { ...finding('new', 'critical'), createdAt: 9 }, finding('high'), finding('medium', 'medium'), finding('info', 'info')])
    const before = structuredClone(input)
    const result = projectExecutiveReport(input)
    expect(result.topFindings.map(item => item.id)).toEqual(['new', 'a', 'b', 'high', 'medium'])
    expect(result.risk).toBe('critical')
    expect(result.roadmap.urgent).toHaveLength(4)
    expect(input).toEqual(before)
  })
  it('groups exact saved titles and registered affected assets without inventing unknown assets or categories', () => {
    const input = report([finding('one'), finding('two'), { ...finding('three', 'medium'), title: 'exposed configuration', assetId: 'missing' }, finding('fixed', 'high', 'fixed')])
    const result = projectExecutiveReport(input)
    expect(result.findingTypes).toEqual([{ title: 'Exposed configuration', count: 2 }, { title: 'exposed configuration', count: 1 }])
    expect(result.affectedAssets).toEqual([{ asset: input.assets[0], findings: input.findings.slice(0, 2) }])
    expect(result.counts.active).toBe(3)
  })
  it('projects the saved execution interval', () => {
    const input = report()
    input.execution = { workspaceId: 'workspace' as WorkspaceId, taskId: 'task', id: 'execution', requestId: 'request', status: 'completed', createdAt: 10, updatedAt: 30, round: 1, planIds: [], workerRunIds: [], events: [], snapshot: { task: input.task, assets: input.assets, recordRevision: 1, targets: [], limits: { maxRounds: 3, maxRequests: 10, timeoutMs: 1000 } } }
    const result = projectExecutiveReport(input)
    expect(result.startedAt).toBe(10)
    expect(result.finishedAt).toBe(30)
  })
})
