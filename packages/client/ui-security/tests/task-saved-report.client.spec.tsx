// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TaskSavedReport, securityReportMarkdown } from '../src/client/TaskSavedReport.tsx'
import { ja } from '../src/client/locales.ts'
import { buildSecurityReport } from '../src/report-model.ts'
afterEach(cleanup)
type Props = Parameters<typeof TaskSavedReport>[0]
type Records = Awaited<ReturnType<Props['readSecurityReport']>>
const unused = (): never => { throw new Error('Unused framework hook') }
const task: Props['task'] = { id: 'task', name: 'Saved report target', description: 'Saved task description', objective: 'Check configuration', status: 'draft', assetIds: ['asset'], archived: false, pinned: false, createdAt: 1, updatedAt: 2 }
const records: Records = {
  planning: { plans: [] }, workers: { runs: [], limits: { requestTimeoutMs: 1, responseBytes: 65536, modelTimeoutMs: 1 } },
  execution: { runs: [], limits: { maxRounds: 3, maxRequests: 10, timeoutMs: 1000 } }, findings: [], retests: [],
}
function props(): Props {
  return { workspaceId: 'workspace' as Props['workspaceId'], taskId: 'task', task, assets: [{ id: 'asset', companyId: 'company', kind: 'domain', value: 'example.org' }], t: key => ja[key as keyof typeof ja], readSecurityReport: vi.fn(async () => records), usePanelInfo: unused, useRemoteAccess: unused, useSessions: unused, useSessionStatus: unused, useSessionRetainInfo: unused, useSessionAccess: unused, useWorkspaces: unused, useWorkspaceAccess: unused, useResource: unused }
}
it('shows saved target with no findings without claiming an unstarted diagnosis is complete', async () => {
  const current = props(); render(<TaskSavedReport {...current} />)
  await screen.findByText('Saved task description')
  expect(screen.getAllByText(ja.savedReportNotStarted).length).toBeGreaterThan(0)
  expect(screen.getAllByText(ja.savedReportCaution).length).toBeGreaterThan(0)
  fireEvent.click(screen.getByText(ja.savedReportTechnicalDetails))
  expect(screen.getByRole('heading', { name: '発見事項 (0)' })).toBeTruthy()
  expect(screen.queryByText(ja.savedReportComplete)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: ja.savedReportRefresh }))
  await waitFor(() => { expect(current.readSecurityReport).toHaveBeenCalledTimes(2) })
})
it('does not enable exports when report records cannot be trusted', async () => {
  const current = props(); current.readSecurityReport = vi.fn(async () => { throw new Error('offline') })
  render(<TaskSavedReport {...current} />)
  await screen.findByRole('alert')
  expect(screen.getByRole('button', { name: ja.savedReportDownload }).hasAttribute('disabled')).toBe(true)
  expect(screen.queryByText('Saved task description')).toBeNull()
})
it('exports authoritative scope and limitations with the zero-finding caution', () => {
  const current = props()
  const model = buildSecurityReport({ task, assets: current.assets, plans: [], workers: [], executions: [], findings: [], retests: [] })
  const markdown = securityReportMarkdown(model, current.t)
  expect(markdown.startsWith('# 診断レポート: Saved report target')).toBe(true)
  expect(markdown).toContain('example.org')
  expect(markdown).toContain(ja.savedReportCaution)
  expect(markdown).toContain(ja.reportLimitHttp)
  expect(markdown).toContain(ja.reportLimitGaps)
})
it('keeps partial capture and unsupported checks visible in the exported report', () => {
  const current = props()
  const report = buildSecurityReport({ task, assets: current.assets, plans: [], workers: [], executions: [], findings: [], retests: [] })
  report.coverage = 'incomplete'
  report.operations = [
    { id: 'p1:i1', planId: 'p1', itemId: 'i1', title: 'Large page', url: 'https://example.org/', assetId: 'asset', status: 'partial', reason: 'capture-partial' },
    { id: 'p1:i2', planId: 'p1', itemId: 'i2', title: 'Unavailable check', url: '', assetId: 'asset', status: 'unsupported', reason: 'unsupported' },
  ]
  const markdown = securityReportMarkdown(report, current.t)
  expect(markdown).toContain(ja.savedReportIncomplete)
  expect(markdown).toContain(`## ${ja.savedReportGaps}`)
  expect(markdown).toContain(`Large page: ${ja.savedReportPartial}`)
  expect(markdown).toContain(ja.reportReasonCapture)
  expect(markdown).toContain(ja.reportReasonUnsupported)
  expect(markdown).not.toContain(ja.savedReportComplete)
})
it('formats task rules as lists without repeating serialized setup metadata', () => {
  const current = props()
  const model = buildSecurityReport({ task: {
    ...task, scopeRules: [{ id: 's1', action: 'allow', kind: 'domain', value: 'example.org', note: 'Registered asset' }],
    constraints: [{ id: 'c1', action: 'deny', text: 'No writes' }],
    setup: { completionCondition: 'Summarize observed configuration', permission: { assetIds: ['asset'], confirmed: true },
      scope: { assetIds: ['asset'], rules: '{"internalScopeJson":true}', confirmed: true },
      operations: { constraints: '{"internalOperationsJson":true}', confirmed: true }, limits: 'Stop after ten requests' },
  }, assets: current.assets, plans: [], workers: [], executions: [], findings: [], retests: [] })
  const markdown = securityReportMarkdown(model, current.t)
  expect(markdown).not.toContain('internalScopeJson')
  expect(markdown).not.toContain('internalOperationsJson')
  expect(markdown).toContain(`### ${ja.policyScopeTitle}\n\n- ${ja.reportAllow}: example.org — Registered asset`)
  expect(markdown).toContain(`### ${ja.policyConstraint}\n\n- ${ja.policyExclude}: No writes`)
  expect(markdown).toContain('Summarize observed configuration')
  expect(markdown).toContain('Stop after ten requests')
  expect(markdown).toContain(ja.savedReportSettings)
})
it('separates recorded complete acquisition from excerpt analysis and leaves the AI report verbatim', () => {
  const current = props()
  const report = buildSecurityReport({ task, assets: current.assets, plans: [], workers: [], executions: [], findings: [], retests: [] })
  report.operations = [{ id: 'p:i', planId: 'p', itemId: 'i', title: 'Large response', url: 'https://example.org/', assetId: 'asset', status: 'partial', reason: 'analysis-partial',
    worker: { id: 'w', requestId: 'r', workspaceId: current.workspaceId, taskId: task.id, planId: 'p', itemId: 'i', assetId: 'asset',
      sessionId: 'session' as NonNullable<typeof report.operations[number]['worker']>['sessionId'], status: 'completed', createdAt: 1, updatedAt: 2,
      snapshot: { recordRevision: 1, task, asset: current.assets[0]!, item: { id: 'i', title: 'Large response', purpose: '', approach: '', targetAssetIds: ['asset'], status: 'pending' }, model: { engine: 'claude', model: 'sonnet' }, url: 'https://example.org/', limits: records.workers.limits },
      evidence: { url: 'https://example.org/', status: 200, headers: {}, body: 'excerpt', bytes: 80765, acquisition: 'complete', bodyTruncated: true }, summary: 'acquisition=partial',
    },
  }]
  const markdown = securityReportMarkdown(report, current.t)
  expect(markdown).toContain(`${ja.reportAcquisition}: ${ja.reportAcquisitionComplete}`)
  expect(markdown).toContain(`${ja.reportAnalysisRange}: ${ja.reportAnalysisExcerpt}`)
  expect(markdown).toContain(`#### ${ja.reportAiSummary}\n\nacquisition=partial`)
})
it('shows failed execution and preserves its stop reason inside an unbreakable code fence', () => {
  const current = props()
  const report = buildSecurityReport({ task, assets: current.assets, plans: [], workers: [], executions: [], findings: [], retests: [] })
  const error = 'Invalid planner JSON\n```\n# injected heading\n<script>bad</script>'
  report.execution = { id: 'e', requestId: 'r', workspaceId: current.workspaceId, taskId: task.id,
    status: 'failed', createdAt: 1, updatedAt: 2, round: 1, planIds: [], workerRunIds: [], events: [], error,
    snapshot: { recordRevision: 1, task, assets: current.assets, targets: [], limits: records.execution.limits },
  }
  const markdown = securityReportMarkdown(report, current.t)
  expect(markdown).toContain(`${ja.reportExecutionStatus}: ${ja.findingRetestFailed}`)
  expect(markdown).toContain(`### ${ja.reportStopReason}\n\n\`\`\`\`text\n${error}\n\`\`\`\``)
})

it('includes the localized limit reason when execution needs input without an error', () => {
  const current = props()
  const report = buildSecurityReport({ task, assets: current.assets, plans: [], workers: [], executions: [], findings: [], retests: [] })
  report.execution = { id: 'e', requestId: 'r', workspaceId: current.workspaceId, taskId: task.id,
    status: 'needs-input', createdAt: 1, updatedAt: 2, round: 3, planIds: [], workerRunIds: [], events: [], summary: 'Configured Planner round limit reached.',
    snapshot: { recordRevision: 1, task, assets: current.assets, targets: [], limits: records.execution.limits },
  }
  const markdown = securityReportMarkdown(report, current.t)
  expect(markdown).toContain(`### ${ja.reportStopReason}`)
  expect(markdown).toContain(ja.executionRoundLimit)
  expect(markdown).not.toContain('Configured Planner round limit reached.')
})

it('exports one representative with the original proof and Worker identity of related findings', () => {
  const current = props()
  const report = buildSecurityReport({ task, assets: current.assets, plans: [], workers: [], executions: [], findings: [], retests: [] })
  const canonical = { id: 'f1', workspaceId: current.workspaceId, taskId: 'task', workerRunId: 'w1', assetId: 'asset', title: 'Representative issue', summary: 'Observed exposure', severity: 'high' as const, status: 'open' as const, proof: 'original proof', remediation: 'Repair the exposure', createdAt: 1, updatedAt: 1, evidence: { url: 'https://example.org/debug', status: 200, headers: {}, body: 'original proof', bytes: 14 } }
  report.findings = [canonical, { ...canonical, id: 'f2', workerRunId: 'w2', title: 'Related issue', proof: 'second original proof', status: 'duplicate', duplicateOfFindingId: 'f1' }]
  const markdown = securityReportMarkdown(report, current.t)
  expect(markdown).toContain('## 発見事項 (1)')
  expect(markdown).toContain('### Representative issue')
  expect(markdown).toContain('#### 関連するワーカーの証拠: Related issue')
  expect(markdown).toContain('ワーカー: w2')
  expect(markdown).toContain('second original proof')
  expect(report.findings).toHaveLength(2)
})
