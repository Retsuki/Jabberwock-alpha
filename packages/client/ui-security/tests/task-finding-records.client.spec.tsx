// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TaskFindingRecords } from '../src/client/TaskFindingRecords.tsx'
import { ja } from '../src/client/locales.ts'
import type { SecurityFindingState } from '../src/finding-types.ts'
afterEach(() => { cleanup(); vi.useRealTimers() })
type Props = Parameters<typeof TaskFindingRecords>[0]
const unused = (): never => { throw new Error('Unused framework hook') }
const state: SecurityFindingState = { findings: [{ id: 'f1', workspaceId: 'workspace' as Props['workspaceId'], taskId: 'task', workerRunId: 'w1', assetId: 'a1', title: 'Example finding', summary: 'Observed response', severity: 'high', status: 'open', evidence: { url: 'https://example.org/', status: 200, headers: {}, body: 'saved observation', bytes: 17 }, proof: 'Captured proof', remediation: 'Fix configuration', createdAt: 1, updatedAt: 1 }], retests: [] }
function props(): Props {
  return { workspaceId: 'workspace' as Props['workspaceId'], taskId: 'task', assets: [], openRetestSession: vi.fn(), view: 'findings', t: key => ja[key as keyof typeof ja], readFindings: vi.fn(async () => state), setFindingStatus: vi.fn(async () => state), linkFindingDuplicate: vi.fn(async () => state), startFindingRetest: vi.fn(async () => state), cancelFindingRetest: vi.fn(async () => state), usePanelInfo: unused, useRemoteAccess: unused, useSessions: unused, useSessionStatus: unused, useSessionRetainInfo: unused, useSessionAccess: unused, useWorkspaces: unused, useWorkspaceAccess: unused, useResource: unused }
}
it('shows saved findings and changes triage through the durable service', async () => {
  const current=props();render(<TaskFindingRecords {...current} />)
  await screen.findByText('Example finding')
  expect(screen.queryByText('表示例')).toBeNull()
  fireEvent.change(screen.getByRole('combobox', { name: '対応状態 · Example finding' }), { target: { value: 'fixed' } })
  await act(async () => { await Promise.resolve() })
  expect(current.setFindingStatus).toHaveBeenCalledWith({ workspaceId: 'workspace', taskId: 'task', findingId: 'f1', status: 'fixed' })
  fireEvent.click(screen.getByText('詳細'))
  expect(screen.getByText('Captured proof')).toBeTruthy()
  expect(screen.getByText('saved observation')).toBeTruthy()
})
it('retains notes and reuses the request identifier after an unknown start outcome', async () => {
  const current=props();current.view='retests'
  const start=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(state);current.startFindingRetest=start
  render(<TaskFindingRecords {...current} />)
  await screen.findByText('Example finding', { selector: 'h3' })
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Fixed build 2' } })
  fireEvent.click(screen.getByRole('button', { name: '再テストを開始' }))
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: '再テストを開始' }))
  await act(async () => { await Promise.resolve() })
  expect(start).toHaveBeenCalledTimes(2)
  expect(start.mock.calls[0]?.[0]).toEqual(start.mock.calls[1]?.[0])
  expect(start.mock.calls[0]?.[0]).toMatchObject({ notes: 'Fixed build 2', findingId:'f1' })
})
it('does not overlap polling or display another task response', async () => {
  vi.useFakeTimers()
  let done: ((state: SecurityFindingState) => void) | undefined
  const current=props();current.readFindings=vi.fn(() => new Promise<SecurityFindingState>((resolve) => { done=resolve }))
  const view=render(<TaskFindingRecords {...current} />)
  await act(async () => { await Promise.resolve(); await vi.advanceTimersByTimeAsync(5000) })
  expect(current.readFindings).toHaveBeenCalledTimes(1)
  view.unmount()
  await act(async () => { done?.(state) })
  expect(screen.queryByText('Example finding')).toBeNull()
})

it('groups duplicate evidence under its representative and lets the owner unlink it', async () => {
  const canonical = state.findings[0]!
  const source = { ...canonical, id: 'f2', title: 'Related observation', workerRunId: 'w2', status: 'duplicate' as const, duplicateOfFindingId: canonical.id, proof: 'Other Worker original proof' }
  const grouped = { findings: [canonical, source], retests: [] }
  const current = props()
  current.readFindings = vi.fn(async () => grouped)
  current.linkFindingDuplicate = vi.fn(async () => ({ findings: [canonical, { ...source, status: 'open' as const, duplicateOfFindingId: undefined }], retests: [] }))
  render(<TaskFindingRecords {...current} />)
  await screen.findByText('発見事項 · 1')
  fireEvent.click(screen.getByRole('button', { name: '詳細' }))
  expect(screen.getByText('Other Worker original proof')).toBeTruthy()
  const control = screen.getByRole('combobox', { name: '重複先（代表の発見事項） · Related observation' })
  fireEvent.change(control, { target: { value: '' } })
  await act(async () => {})
  expect(current.linkFindingDuplicate).toHaveBeenCalledWith({ workspaceId: 'workspace', taskId: 'task', findingId: 'f2' })
  expect(screen.getByText('発見事項 · 2')).toBeTruthy()
})
it('offers only same-asset representatives for linking and keeps duplicate triage behind the link control', async () => {
  const canonical = state.findings[0]!
  const other = { ...canonical, id: 'f2', title: 'Other representative', createdAt: 0 }
  const foreign = { ...canonical, id: 'foreign', assetId: 'other-asset', title: 'Other asset finding', createdAt: 0 }
  const current = props()
  current.readFindings = vi.fn(async () => ({ findings: [canonical, other, foreign], retests: [] }))
  render(<TaskFindingRecords {...current} />)
  await screen.findByText('発見事項 · 3')
  const status = screen.getByRole('combobox', { name: '対応状態 · Example finding' })
  expect(Array.from(status.querySelectorAll('option')).map(option => option.value)).not.toContain('duplicate')
  const control = screen.getByRole('combobox', { name: '重複先（代表の発見事項） · Example finding' })
  expect(Array.from(control.querySelectorAll('option')).map(option => option.value)).toEqual(['', 'f2'])
  fireEvent.change(control, { target: { value: 'f2' } })
  await act(async () => {})
  expect(current.linkFindingDuplicate).toHaveBeenCalledWith({ workspaceId: 'workspace', taskId: 'task', findingId: 'f1', canonicalFindingId: 'f2' })
})
