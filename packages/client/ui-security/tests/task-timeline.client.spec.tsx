// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TaskTimeline } from '../src/client/TaskTimeline.tsx'
import { ja } from '../src/client/locales.ts'
import type { ActivityModel } from '../src/client/activity-model.ts'
afterEach(cleanup)
const t: Parameters<typeof TaskTimeline>[0]['t'] = key => ja[key as keyof typeof ja]
const model: ActivityModel = { nodes: [], edges: [], events: [
  { id: 'event1', nodeId: 'intent:1', kind: 'intent', title: 'First request', at: 1000, status: 'running', source: 'planner', assetIds: ['asset1'], payload: { instruction: 'Read response' } },
  { id: 'event2', nodeId: 'fact:2', kind: 'fact', title: 'Second response', at: 2000, status: 'recorded', source: 'worker', assetIds: ['asset1'], payload: { statusCode: 200 } },
] }
it('searches real titles and filters without introducing sample events', () => {
  render(<TaskTimeline t={t} model={model} />)
  expect(screen.queryByText('管理画面の機能とAPIの認可を確認')).toBeNull()
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'fact:2' } })
  expect(screen.getByText('Second response')).toBeTruthy()
  expect(screen.queryByText('First request')).toBeNull()
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: '調査' }))
  expect(screen.queryByText('Second response')).toBeNull()
})
it('sorts timestamps and expands actual stored payloads', () => {
  render(<TaskTimeline t={t} model={model} />)
  expect(screen.getAllByRole('button', { expanded: false })[0]?.textContent).toContain('Second response')
  fireEvent.click(screen.getByRole('button', { name: '新しい順' }))
  const first = screen.getAllByRole('button', { expanded: false })[0]
  expect(first?.textContent).toContain('First request')
  if (!first) throw new Error('Missing timeline row')
  fireEvent.click(first)
  expect(screen.getByText(/"instruction": "Read response"/)).toBeTruthy()
})
it('exposes refresh controls and distinguishes empty from read failure', () => {
  const change = vi.fn(); const refresh = vi.fn()
  render(<TaskTimeline t={t} model={{ nodes: [], edges: [], events: [] }} auto onAutoChange={change} refresh={refresh} error />)
  expect(screen.queryByText('活動はまだ記録されていません。')).toBeNull()
  expect(screen.getByRole('alert')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '自動更新' })); expect(change).toHaveBeenCalledWith(false)
  fireEvent.click(screen.getByRole('button', { name: '更新' })); expect(refresh).toHaveBeenCalledOnce()
})
