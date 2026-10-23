// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TaskExploration } from '../src/client/TaskExploration.tsx'
import type { ActivityModel } from '../src/client/activity-model.ts'
import { ja } from '../src/client/locales.ts'
import type { SecurityTranslate } from '../src/client/presentation.tsx'

afterEach(cleanup)
const t: SecurityTranslate = key => key in ja ? ja[key as keyof typeof ja] : key
const model: ActivityModel = {
  nodes: [
    { id: 'plan:1', kind: 'review', title: 'Saved planner', at: 1, status: 'ready', source: 'planner', assetIds: [], payload: {} },
    { id: 'intent:1', kind: 'intent', title: 'Saved investigation', at: 2, status: 'running', source: 'planner', assetIds: [], payload: {} },
    { id: 'worker:1', kind: 'execution', title: 'Saved worker', at: 3, status: 'failed', source: 'worker', assetIds: [], payload: { error: '<script>escaped</script>' } },
  ], edges: [
    { id: 'a', source: 'plan:1', target: 'intent:1', kind: 'contains' },
    { id: 'b', source: 'intent:1', target: 'worker:1', kind: 'dispatches' },
  ], events: [],
}
it('shows an empty stored graph without substituting sample nodes', () => {
  render(<TaskExploration t={t} model={{ nodes: [], edges: [], events: [] }} />)
  expect(screen.getByText(ja.explorationEmpty)).toBeTruthy()
  expect(screen.queryByText(ja.explorationSample)).toBeNull()
  expect(screen.queryByRole('button', { name: 'Saved worker' })).toBeNull()
})
it('distinguishes observed facts, findings, unverified hints and goal assessments', () => {
  const nodes: ActivityModel['nodes'] = [
    { id: 'fact:f', kind: 'fact', title: 'Observed header', at: 1, status: 'recorded', source: 'worker', assetIds: [], payload: {} },
    { id: 'finding:f', kind: 'finding', title: 'Reported exposure', at: 2, status: 'recorded', source: 'worker', assetIds: [], payload: {} },
    { id: 'hint:h', kind: 'hint', title: 'Try another page', at: 3, status: 'unverified', source: 'planner', assetIds: [], payload: {} },
    { id: 'goal:g', kind: 'goal', title: 'Review objective', at: 4, status: 'supported', source: 'owner', assetIds: [], payload: {} },
    { id: 'missing', kind: 'hint', title: 'Source unavailable', at: 4, status: 'unverified', source: 'system', assetIds: [], payload: { recordType: 'shared-knowledge', state: 'unknown' } },
  ]
  render(<TaskExploration t={t} model={{ nodes, edges: [{ id: 'support', source: 'fact:f', target: 'goal:g', kind: 'supports' }], events: [] }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Try another page' }))
  expect(screen.getAllByText('未確認').length).toBeGreaterThan(0)
  fireEvent.click(screen.getByRole('button', { name: 'Review objective' }))
  expect(screen.getAllByText('根拠あり（目標評価）').length).toBeGreaterThan(0)
  expect(screen.getByRole('button', { name: '根拠として支持: Observed header' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '参照元が見つかりません' }))
  expect(screen.getAllByText('未確認').length).toBeGreaterThan(0)
  expect(screen.queryByText('Source unavailable')).toBeNull()
})
it('uses stored links for columns and opens escaped actual node details by keyboard', () => {
  const { container } = render(<TaskExploration t={t} model={model} />)
  const planner = screen.getByRole('button', { name: 'Saved planner' })
  const worker = screen.getByRole('button', { name: 'Saved worker' })
  expect(planner.getAttribute('transform')).toBe('translate(70,150)')
  expect(worker.getAttribute('transform')).toBe('translate(540,150)')
  fireEvent.keyDown(worker, { key: 'Enter' })
  expect(screen.getByText('worker:1')).toBeTruthy()
  const payload = screen.getByText(ja.explorationPayload).closest('details')
  expect(payload?.open).toBe(false)
  fireEvent.click(screen.getByText(ja.explorationPayload))
  expect(screen.getByText(/<script>escaped<\/script>/)).toBeTruthy()
  expect(container.querySelector('script')).toBeNull()
  expect(screen.getByRole('button', { name: '指示: Saved investigation' })).toBeTruthy()
})
it('preserves zoom and node selection across polling and fits the current graph on request', () => {
  const { container, rerender } = render(<TaskExploration t={t} model={model} />)
  const svg = container.querySelector('svg')
  const initial = svg?.getAttribute('viewBox')
  fireEvent.click(screen.getByRole('button', { name: ja.explorationZoomIn }))
  const zoomed = svg?.getAttribute('viewBox')
  expect(zoomed).not.toBe(initial)
  fireEvent.click(screen.getByRole('button', { name: 'Saved worker' }))
  rerender(<TaskExploration t={t} model={{ ...model, nodes: [...model.nodes] }} />)
  expect(svg?.getAttribute('viewBox')).toBe(zoomed)
  expect(screen.getByText('worker:1')).toBeTruthy()
  for (let index = 0; index < 30; index++) fireEvent.click(screen.getByRole('button', { name: ja.explorationZoomIn }))
  expect(Number(svg?.getAttribute('viewBox')?.split(' ')[2])).toBe(350)
  fireEvent.click(screen.getByRole('button', { name: ja.explorationFit }))
  expect(svg?.getAttribute('viewBox')).toBe('0 0 780 440')
})
it('fits after the initial load and preserves that viewport during later refreshes', () => {
  const { container, rerender } = render(<TaskExploration t={t} model={{ nodes: [], edges: [], events: [] }} loading />)
  expect(screen.getByText(ja.explorationLoading)).toBeTruthy()
  rerender(<TaskExploration t={t} model={model} loading={false} />)
  const svg = container.querySelector('svg')
  expect(svg?.getAttribute('viewBox')).toBe('0 0 1100 600')
  fireEvent.click(screen.getByRole('button', { name: ja.explorationZoomIn }))
  const zoomed = svg?.getAttribute('viewBox')
  rerender(<TaskExploration t={t} model={model} loading />)
  rerender(<TaskExploration t={t} model={{ ...model, nodes: [...model.nodes] }} loading={false} />)
  expect(svg?.getAttribute('viewBox')).toBe(zoomed)
})

it('packs graph nodes into at most six rows and excludes message chatter from its layout', () => {
  const nodes = Array.from({ length: 15 }, (_, index) => ({
    ...model.nodes[0]!, id: `plan:${index}`, title: `Plan ${index}`, at: index,
  }))
  const { container } = render(<TaskExploration t={t} model={{ nodes: [...nodes, {
    ...nodes[0]!, id: 'message:1', kind: 'message', title: 'Raw conversation log',
  }], edges: [], events: [] }} />)
  expect(screen.queryByRole('button', { name: 'Raw conversation log' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Plan 14' }).getAttribute('transform')).toBe('translate(540,334)')
  const ys = [...container.querySelectorAll('[data-activity-node]')].map(node => Number(node.getAttribute('transform')?.match(/,(\d+)/)?.[1]))
  expect(Math.max(...ys)).toBe(610)
})

it('pans with wheel and anchors trackpad pinch to the cursor even when SVG is letterboxed', () => {
  const { container } = render(<TaskExploration t={t} model={model} />)
  const svg = container.querySelector('svg')!
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ x: 100, y: 50, left: 100, top: 50, right: 1100, bottom: 850, width: 1000, height: 800, toJSON() {} })
  fireEvent.click(screen.getByRole('button', { name: ja.explorationFit }))
  const before = svg.getAttribute('viewBox')!.split(' ').map(Number)
  const wheel = new WheelEvent('wheel', { deltaX: 20, deltaY: 40, cancelable: true })
  fireEvent(svg, wheel)
  expect(wheel.defaultPrevented).toBe(true)
  const panned = svg.getAttribute('viewBox')!.split(' ').map(Number)
  expect(panned[0]).toBeCloseTo(15.6)
  expect(panned[1]).toBeCloseTo(31.2)
  expect(panned[2]).toBe(before[2])
  const anchorX = panned[0]! + 200 / (1000 / 780)
  const anchorY = panned[1]! + (300 - (800 - 440 * (1000 / 780)) / 2) / (1000 / 780)
  fireEvent.wheel(svg, { ctrlKey: true, deltaY: -20, clientX: 300, clientY: 350 })
  const zoomed = svg.getAttribute('viewBox')!.split(' ').map(Number)
  expect(zoomed[2]).toBeLessThan(panned[2]!)
  const ratio = zoomed[2]! / panned[2]!
  expect(zoomed[0]! + (anchorX - panned[0]!) * ratio).toBeCloseTo(anchorX)
  expect(zoomed[1]! + (anchorY - panned[1]!) * ratio).toBeCloseTo(anchorY)
})

it('only labels relationships connected to the selected node', () => {
  const { container } = render(<TaskExploration t={t} model={model} />)
  expect(container.querySelectorAll('[data-activity-edge] text')).toHaveLength(0)
  fireEvent.click(screen.getByRole('button', { name: 'Saved worker' }))
  expect(container.querySelectorAll('[data-activity-edge] text')).toHaveLength(1)
  expect(container.querySelector('[data-activity-edge="b"] text')?.textContent).toBe(ja.explorationDispatches)
  fireEvent.click(screen.getByRole('button', { name: ja.explorationClose }))
  expect(container.querySelectorAll('[data-activity-edge] text')).toHaveLength(0)
})

it('keeps scope links unlabelled when their asset is selected', () => {
  const asset = { ...model.nodes[0]!, id: 'asset:1', kind: 'asset' as const, title: 'Scope asset' }
  const { container } = render(<TaskExploration t={t} model={{ ...model, nodes: [asset, ...model.nodes], edges: [...model.edges, { id: 'scope', source: asset.id, target: 'worker:1', kind: 'targets' }] }} />)
  fireEvent.click(screen.getByRole('button', { name: asset.title }))
  expect(container.querySelector('[data-activity-edge="scope"] text')).toBeNull()
  expect(container.querySelector('[data-activity-edge="scope"] path')?.getAttribute('stroke-dasharray')).toBe('4 4')
})
