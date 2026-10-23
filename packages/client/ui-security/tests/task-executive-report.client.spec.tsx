// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { TaskExecutiveReport } from '../src/client/TaskExecutiveReport.tsx'
import { ja } from '../src/client/locales.ts'
import { buildSecurityReport } from '../src/report-model.ts'
import type { SecurityFinding } from '../src/finding-types.ts'
afterEach(cleanup)
const task = { id: 'task', name: 'Executive test', description: '', objective: 'Check saved observations', status: 'draft' as const, assetIds: ['asset'], archived: false, pinned: false, createdAt: 1, updatedAt: 2 }
const t: Parameters<typeof TaskExecutiveReport>[0]['t'] = key => ja[key as keyof typeof ja]
function report(findings: SecurityFinding[] = []) {
  return buildSecurityReport({ task, assets: [{ id: 'asset', companyId: 'company', kind: 'service', value: 'http://example.org' }], plans: [], workers: [], executions: [], findings, retests: [] })
}
it('renders all eight numbered sections and real zero counts without declaring safety', () => {
  render(<TaskExecutiveReport report={report()} t={t} />)
  const headings = screen.getAllByRole('heading', { level: 3 })
  expect(headings).toHaveLength(8)
  headings.forEach((heading, index) => { expect(heading.textContent).toMatch(new RegExp(`^${index + 1}\\.`)) })
  expect(screen.getAllByText(ja.savedReportCaution)).toHaveLength(2)
  expect(screen.getAllByText(ja.executiveNone)).toHaveLength(4)
  expect(screen.getAllByText(ja.savedReportNotStarted).length).toBeGreaterThan(0)
  expect(screen.queryByText('安全')).toBeNull()
  expect(screen.getByText(ja.executiveNoPeriod)).toBeTruthy()
})
it('shows saved findings, proof and remediation as literal text without generating claims or HTML', () => {
  const finding: SecurityFinding = { id: 'finding', workspaceId: 'workspace' as SecurityFinding['workspaceId'], taskId: 'task', workerRunId: 'worker', assetId: 'asset', status: 'open', title: '<img src=x onerror=alert(1)>' + '長い見出し'.repeat(30), summary: '<script>untrusted()</script>', proof: 'Saved excerpt only', remediation: 'Remove public configuration', severity: 'high', createdAt: 3, updatedAt: 3, evidence: { url: 'http://example.org/debug', status: 200, headers: {}, body: 'Saved excerpt only', bytes: 18, truncated: false } }
  const { container } = render(<TaskExecutiveReport report={report([finding])} t={t} />)
  expect(screen.getAllByText(finding.title).length).toBeGreaterThan(0)
  expect(screen.getAllByText(finding.summary).length).toBeGreaterThan(0)
  expect(screen.getByText(finding.proof)).toBeTruthy()
  expect(screen.getByText(finding.remediation)).toBeTruthy()
  expect(container.querySelector('img, script')).toBeNull()
  expect(screen.getAllByText(ja.executiveDeadline)).toHaveLength(3)
  expect(screen.queryByText('1〜2週間')).toBeNull()
})

it('keeps long saved summaries in impact and scenarios while using a labeled table excerpt', () => {
  const current = report()
  const summary = '保存された説明'.repeat(50)
  current.findings = [{ id: 'long', workspaceId: 'workspace' as SecurityFinding['workspaceId'], taskId: 'task', workerRunId: 'worker', assetId: 'asset', status: 'open', title: 'Long summary', summary, proof: 'Recorded proof', remediation: '', severity: 'medium', createdAt: 1, updatedAt: 1, evidence: { url: 'http://example.org/path', status: 200, headers: {}, body: 'Recorded proof', bytes: 14, truncated: false } }]
  render(<TaskExecutiveReport report={current} t={t} />)
  const table = screen.getByRole('table')
  expect(within(table).getByText(`${summary.slice(0, 160)}…`)).toBeTruthy()
  expect(within(table).queryByText(summary)).toBeNull()
  expect(screen.getAllByText(summary)).toHaveLength(2)
  expect(screen.getByRole('columnheader', { name: ja.executiveExcerpt })).toBeTruthy()
})

it('counts a grouped finding once and retains related original proof in the report', () => {
  const canonical: SecurityFinding = { id: 'f1', workspaceId: 'workspace' as SecurityFinding['workspaceId'], taskId: 'task', workerRunId: 'w1', assetId: 'asset', title: 'Representative issue', summary: 'Observed exposure', severity: 'high', status: 'open', proof: 'first proof', remediation: 'Repair', createdAt: 1, updatedAt: 1, evidence: { url: 'http://example.org/debug', status: 200, headers: {}, body: 'first proof', bytes: 11 } }
  render(<TaskExecutiveReport report={report([canonical, { ...canonical, id: 'f2', workerRunId: 'w2', status: 'duplicate', duplicateOfFindingId: canonical.id, title: 'Related issue', proof: 'second proof' }])} t={t} />)
  const summary = screen.getByRole('region', { name: `1. ${ja.executiveSummary}` })
  expect(within(summary).getByText(ja.executiveTotal).closest('div')?.textContent).toContain('1')
  expect(screen.getByText('second proof')).toBeTruthy()
  expect(screen.getByText('関連するワーカーの証拠 · 1')).toBeTruthy()
})
