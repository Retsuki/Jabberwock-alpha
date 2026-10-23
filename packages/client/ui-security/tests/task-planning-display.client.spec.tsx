// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TaskPlanning } from '../src/client/TaskPlanning.tsx'
import type { PlanningEntry } from '../src/client/planning-state.ts'
import type { RecordsEntry } from '../src/client/records-state.ts'
import type { SecurityPlan } from '../src/planning-types.ts'
import { ja } from '../src/client/locales.ts'

afterEach(cleanup)
type Props = Parameters<typeof TaskPlanning>[0]
const target = { workspaceId: 'workspace' as Props['workspaceId'], taskId: 'task' }
const plan: SecurityPlan = {
  ...target, id: 'plan', requestId: 'request', sessionId: 'session' as SecurityPlan['sessionId'], status: 'ready', createdAt: 1, updatedAt: 2,
  snapshot: { recordRevision: 1, task: { id: 'task', name: 'Task', description: '', objective: '', assetIds: ['asset'], status: 'draft',
    archived: false, pinned: false, createdAt: 1, updatedAt: 1 }, assets: [{ id: 'asset', companyId: 'company', kind: 'domain', value: 'saved.example.org' }], conversation: '' },
  items: [{ id: 'item', title: 'Review public response', purpose: '<script>private-data</script>', approach: 'Read the saved response', targetAssetIds: ['asset'], status: 'pending' }],
}
function props(plans: SecurityPlan[]): Props {
  const key = JSON.stringify([target.workspaceId, target.taskId])
  const planning: Record<string, PlanningEntry> = { [key]: { loading: false, state: { plans } } }
  const records: Record<string, RecordsEntry> = {}
  return {
    ...target, t: key => key in ja ? ja[key as keyof typeof ja] : key,
    useSecurityPlanning: selector => selector(planning), useSecurityRecords: selector => selector(records),
    watchSecurityPlanning: vi.fn(), refreshSecurityPlanning: vi.fn(), cancelSecurityPlanning: vi.fn(),
    readSecurityExecution: vi.fn(async () => ({ runs: [], limits: { maxRounds: 3, maxRequests: 4, timeoutMs: 1000 } })),
    cancelSecurityExecution: vi.fn(),
  } as Props
}
it('shows compact saved rounds oldest first and expands actual target, purpose and steps safely', () => {
  const later = { ...plan, id: 'later', createdAt: 3, updatedAt: 4, items: [] }
  const { container } = render(<TaskPlanning {...props([later, plan])} />)
  expect(screen.getAllByRole('heading').map(heading => heading.textContent)).toEqual(['計画ラウンド 1', '計画ラウンド 2'])
  const summary = screen.getByText('Review public response')
  const details = summary.closest('details')
  expect(details?.hasAttribute('open')).toBe(false)
  fireEvent.click(summary)
  expect(screen.getByText('saved.example.org')).toBeTruthy()
  expect(screen.getByText('<script>private-data</script>')).toBeTruthy()
  expect(container.querySelector('script')).toBeNull()
  expect(screen.queryByRole('button', { name: '調査を開始' })).toBeNull()
  expect(screen.queryByText(ja.executionNotice)).toBeNull()
})
it('keeps plan failure actionable with escaped technical details collapsed', () => {
  render(<TaskPlanning {...props([{ ...plan, status: 'failed', items: [], error: '<img src=x>' }])} />)
  expect(screen.getByRole('alert').textContent).toContain(ja.planningFailureNotice)
  expect(screen.getByText('<img src=x>').closest('details')?.hasAttribute('open')).toBe(false)
})
it('distinguishes replanning from initial planning and names the saved-result snapshot count', () => {
  const initial: SecurityPlan = { ...plan, status: 'planning', items: [] }
  const review: SecurityPlan = { ...plan, id: 'review', status: 'planning', items: [],
    snapshot: { ...plan.snapshot, previousPlanId: plan.id, workerRunIds: ['completed-1', 'completed-2'] },
  }
  render(<TaskPlanning {...props([review, initial])} />)
  expect(screen.getByText(ja.planningReviewRunning)).toBeTruthy()
  expect(screen.getByText(ja.planningStatusPlanning)).toBeTruthy()
  expect(screen.getByText(`${ja.planningReviewResults} 2`)).toBeTruthy()
  expect(screen.getByText(ja.planningReviewStarted)).toBeTruthy()
  expect(screen.getByText(ja.planningStartedActivity)).toBeTruthy()
  expect(screen.queryByText('調査中 2')).toBeNull()
})
it('keeps the immutable saved-result count visible after a review has been saved', () => {
  render(<TaskPlanning {...props([{ ...plan, snapshot: { ...plan.snapshot, previousPlanId: 'earlier', workerRunIds: [] } }])} />)
  expect(screen.getByText(`${ja.planningReviewResults} 0`)).toBeTruthy()
  expect(screen.queryByText(ja.planningReviewRunning)).toBeNull()
})
