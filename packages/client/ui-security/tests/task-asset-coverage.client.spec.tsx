// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { TaskAssetCoverage } from '../src/client/TaskAssetCoverage.tsx'
import { ja } from '../src/client/locales.ts'
import type { SecurityTranslate } from '../src/client/presentation.tsx'
import type { CoverageModel, CoverageNode } from '../src/client/coverage-model.ts'
afterEach(cleanup)
const t: SecurityTranslate = key => ja[key as keyof typeof ja] ?? key
const node = (id: string, patch: Partial<CoverageNode> = {}): CoverageNode => ({ id, label: id, kind: 'domain', companyId: 'company', inScope: true, scopeState: 'in', connector: false, tested: true, refs: { plans: [], workers: [], findings: [] }, ...patch })
const model = (nodes: CoverageNode[]): CoverageModel => ({
  nodes, edges: [], stats: { denominator: nodes.length, tested: nodes.length, percentage: nodes.length ? 100 : null,
    byType: { domain: { total: nodes.length, tested: nodes.length } } }, warnings: [] })
it('opens saved evidence and worker, and keeps selection across refreshed model objects', () => {
  const worker = { runId: 'run', sessionId: 'session' as CoverageNode['refs']['workers'][number]['sessionId'], status: 'completed' as const, url: 'https://example.org/', evidence: { url: 'https://example.org/', status: 200, bytes: 10, body: 'x'.repeat(5000), headers: {} } }
  const data = model([node('example.org', { refs: { plans: [{ planId: 'plan', itemId: 'item', title: 'Header inspection' }], workers: [worker], findings: [] } })])
  const openWorker = vi.fn(), view = render(<TaskAssetCoverage t={t} model={data} openWorker={openWorker} />)
  fireEvent.click(screen.getByRole('button', { name: 'example.org' }))
  const panel = screen.getByRole('complementary', { name: '資産の詳細' })
  expect(within(panel).getByText('Header inspection')).toBeTruthy()
  expect(within(panel).getByText('完了 · 200')).toBeTruthy()
  fireEvent.click(within(panel).getByRole('button', { name: 'ワーカーを開く' }))
  expect(openWorker).toHaveBeenCalledWith('run')
  view.rerender(<TaskAssetCoverage t={t} model={{ ...data, nodes: [...data.nodes] }} openWorker={openWorker} />)
  expect(screen.getByRole('complementary', { name: '資産の詳細' })).toBeTruthy()
  const details = within(panel).getByText('通信証拠').closest('details')
  expect(details?.open).toBe(false)
})
it('folds each parent/kind group after 20 and reveals 20 more without changing whole-task metrics', () => {
  const parent = node('root', { connector: true }), children = Array.from({ length: 45 }, (_, i) => node(`child-${i}`, { kind: 'endpoint' }))
  const data = model([parent, ...children]); data.edges = children.map(child => ({ id: child.id, source: child.id, target: parent.id }))
  render(<TaskAssetCoverage t={t} model={data} />)
  expect(document.querySelectorAll('[data-coverage-node]').length).toBe(21)
  fireEvent.click(screen.getByRole('button', { name: '折りたたんだ資産: 25' }))
  const panel = screen.getByRole('complementary')
  expect(within(panel).getAllByRole('button')).toHaveLength(22)
  fireEvent.click(within(panel).getByRole('button', { name: 'さらに20件表示' }))
  expect(document.querySelectorAll('[data-coverage-node]').length).toBe(41)
  fireEvent.change(screen.getByRole('textbox', { name: '資産を検索' }), { target: { value: 'child-44' } })
  expect(document.querySelectorAll('[data-coverage-node]').length).toBe(2)
  expect(screen.getByText('観測済み 46 / 46')).toBeTruthy()
})
it('keeps the old graph visible on read error and renders no percentage for no denominator', () => {
  const refresh = vi.fn()
  const view = render(<TaskAssetCoverage t={t} model={model([node('asset')])} error refresh={refresh} />)
  expect(screen.getByRole('alert')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'asset' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '更新' }))
  expect(refresh).toHaveBeenCalledTimes(1)
  view.rerender(<TaskAssetCoverage t={t} model={model([])} />)
  expect(screen.getByText('—')).toBeTruthy()
  expect(screen.getByText('該当する資産はありません。')).toBeTruthy()
})
it('pans with a two-finger wheel and zooms around the pointer without changing selection', () => {
  render(<TaskAssetCoverage t={t} model={model([node('asset')])} />)
  const graph = document.querySelector('svg.graph') ?? document.querySelector('section > div > svg')
  if (!(graph instanceof SVGSVGElement)) throw new Error('Missing graph')
  vi.spyOn(graph, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, top: 0, left: 0, right: 1100, bottom: 650, width: 1100, height: 650, toJSON: () => ({}) })
  const before = graph.getAttribute('viewBox')
  fireEvent.wheel(graph, { deltaX: 50, deltaY: 40 })
  expect(graph.getAttribute('viewBox')).toBe('50 40 1100 650')
  fireEvent.wheel(graph, { deltaY: -30, ctrlKey: true, clientX: 400, clientY: 300 })
  expect(graph.getAttribute('viewBox')).not.toBe(before)
  expect(Number(graph.getAttribute('viewBox')?.split(' ')[2])).toBeLessThan(1100)
})
it('drags an individual asset and retains its position after polling', () => {
  vi.stubGlobal('PointerEvent', MouseEvent)
  const data = model([node('asset')]), view = render(<TaskAssetCoverage t={t} model={data} />)
  const graph = document.querySelector('section > div > svg')
  if (!(graph instanceof SVGSVGElement)) throw new Error('Missing graph')
  graph.setPointerCapture = vi.fn(); graph.hasPointerCapture = () => true; graph.releasePointerCapture = vi.fn()
  vi.spyOn(graph, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, top: 0, left: 0, right: 1100, bottom: 650, width: 1100, height: 650, toJSON: () => ({}),
  })
  const asset = screen.getByRole('button', { name: 'asset' })
  fireEvent.pointerDown(asset, { button: 0, clientX: 110, clientY: 180 })
  fireEvent.pointerMove(graph, { clientX: 150, clientY: 200 })
  fireEvent.pointerUp(graph, { clientX: 150, clientY: 200 })
  expect(asset.getAttribute('transform')).toBe('translate(150,340)')
  view.rerender(<TaskAssetCoverage t={t} model={{ ...data, nodes: [...data.nodes] }} />)
  expect(screen.getByRole('button', { name: 'asset' }).getAttribute('transform')).toBe('translate(150,340)')
  vi.unstubAllGlobals()
})
it('groups related findings in asset details without dropping original evidence records', () => {
  const finding: CoverageNode['refs']['findings'][number] = {
    id: 'f1', workspaceId: 'workspace' as CoverageNode['refs']['findings'][number]['workspaceId'], taskId: 'task',
    workerRunId: 'w1', assetId: 'asset', title: 'Representative issue', summary: 'Observed exposure',
    proof: 'first proof', remediation: 'Repair', severity: 'high', status: 'open', createdAt: 1, updatedAt: 1,
    evidence: { url: 'https://example.org/debug', status: 200, headers: {}, body: 'first proof', bytes: 11 },
  }
  const data = model([node('example.org', { refs: { plans: [], workers: [], findings: [finding,
    { ...finding, id: 'f2', title: 'Related issue', workerRunId: 'w2', status: 'duplicate', duplicateOfFindingId: finding.id, proof: 'second proof' },
  ] } })])
  render(<TaskAssetCoverage t={t} model={data} />)
  fireEvent.click(screen.getByRole('button', { name: 'example.org' }))
  const panel = screen.getByRole('complementary', { name: '資産の詳細' })
  expect(within(panel).getByText('Representative issue')).toBeTruthy()
  expect(within(panel).getByText('関連するワーカーの証拠 · 1')).toBeTruthy()
  expect(within(panel).getByText('second proof')).toBeTruthy()
  expect(data.nodes[0]?.refs.findings).toHaveLength(2)
})
