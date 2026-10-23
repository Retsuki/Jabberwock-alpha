// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type {} from '../src/client/index.ts'
import { TaskDetail } from '../src/client/TaskDetail.tsx'
import { ja } from '../src/client/locales.ts'
import type { SecurityRecords } from '../src/security-records.ts'
afterEach(cleanup)
const task = { id: 'task', name: 'Saved task', description: '', objective: 'Observe', assetIds: ['asset'], status: 'draft' as const, archived: false, pinned: false, createdAt: 1, updatedAt: 1 }
const records: SecurityRecords = { workspaceId: 'workspace' as SecurityRecords['workspaceId'], revision: 1, companies: [], assets: [{ id: 'asset', companyId: 'company', kind: 'domain', value: 'example.org' }], tasks: [task] }
it('connects both saved task activity tabs to their scoped real records', () => {
  render(<TaskDetail task={task} records={records} t={key => key in ja ? ja[key as keyof typeof ja] : key}
    disabled={false} editTask={vi.fn()} back={vi.fn()} flush={async () => true}
    renderSlot={(name, owner) => <div data-testid={name}>{JSON.stringify(owner)}</div>} />)
  expect(screen.queryByTestId('security.task.activity')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'タイムライン' }))
  expect(screen.getByTestId('security.task.activity').textContent).toContain('"view":"timeline"')
  expect(screen.getByTestId('security.task.activity').textContent).toContain('example.org')
  expect(screen.getByTestId('security.task.activity').textContent).toContain('"taskId":"task"')
  fireEvent.click(screen.getByRole('button', { name: '探索経路' }))
  expect(screen.getByTestId('security.task.activity').textContent).toContain('"view":"exploration"')
})

it('opens the saved coverage slot and navigates to the selected Worker', () => {
  render(<TaskDetail task={task} records={records} t={key => key in ja ? ja[key as keyof typeof ja] : key}
    disabled={false} editTask={vi.fn()} back={vi.fn()} flush={async () => true}
    renderSlot={(name, owner) => name === 'security.task.coverage'
      ? <button onClick={() => { (owner as unknown as { openWorker: (id: string) => void }).openWorker('selected') }}>Open selected worker</button>
      : <div data-testid={name}>{JSON.stringify(owner)}</div>} />)
  fireEvent.click(screen.getByRole('button', { name: 'カバレッジ' }))
  fireEvent.click(screen.getByRole('button', { name: 'Open selected worker' }))
  expect(screen.getByTestId('security.task.sessions').textContent).toContain('"initialWorkerId":"selected"')
  expect(screen.getByTestId('security.task.sessions').textContent).toContain('"taskId":"task"')
})
