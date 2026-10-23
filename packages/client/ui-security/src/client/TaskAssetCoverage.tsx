/** Asset-centered view of saved scope and HTTP observations. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button, Tooltip, IconGlobeOutlineRegular, IconBranchOutlineRegular, IconDataOutlineRegular, IconApiOutlineRegular, IconBrowseOutlineRegular, IconLinkOutlineRegular, IconUsersOutlineRegular, IconFullscreenOutlineRegular, IconPlusOutlineRegular, IconCloseOutlineRegular, IconRefreshOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { projectFindingGroups } from '../finding-groups.ts'
import type { CoverageKind, CoverageModel, CoverageNode } from './coverage-model.ts'
import type { SecurityTranslate } from './presentation.tsx'
import css from './TaskAssetCoverage.module.css'

const workerLabels = { running: 'workerRunning', completed: 'workerCompleted', failed: 'workerFailed', cancelled: 'workerCancelled', interrupted: 'workerInterrupted' } as const
const findingLabels = { open: 'findingStatusOpen', 'in-progress': 'findingStatusProgress', confirmed: 'findingStatusConfirmed', fixed: 'findingStatusFixed', 'false-positive': 'findingStatusFalse', duplicate: 'findingStatusDuplicate', 'accepted-risk': 'findingStatusAccepted' } as const
const severityLabels = { critical: 'findingSeverityCritical', high: 'findingSeverityHigh', medium: 'findingSeverityMedium', low: 'findingSeverityLow', info: 'findingSeverityInfo' } as const
const kinds = {
  company: { key: 'assetCoverageCompany', Icon: IconUsersOutlineRegular }, domain: { key: 'assetCoverageDomain', Icon: IconGlobeOutlineRegular }, subdomain: { key: 'assetCoverageSubdomain', Icon: IconBranchOutlineRegular }, ip: { key: 'assetCoverageIp', Icon: IconDataOutlineRegular }, service: { key: 'assetCoverageService', Icon: IconApiOutlineRegular }, app: { key: 'assetCoverageApp', Icon: IconBrowseOutlineRegular }, endpoint: { key: 'assetCoverageEndpoint', Icon: IconLinkOutlineRegular },
} as const
type Point = { x: number; y: number }
type View = Point & { width: number; height: number }
type Fold = { id: string; parent: string; kind: CoverageKind; hidden: CoverageNode[] }
type Props = {
  t: SecurityTranslate
  model: CoverageModel
  loading?: boolean
  error?: boolean
  auto?: boolean
  onAutoChange?: (value: boolean) => void
  refresh?: () => void
  openWorker?: (runId: string) => void
}
function status(node: CoverageNode): 'assetCoverageOutside' | 'assetCoverageUnknown' | 'assetCoverageTested' | 'assetCoverageUntested' {
  return node.scopeState === 'out' ? 'assetCoverageOutside' : node.scopeState === 'unknown' ? 'assetCoverageUnknown' : node.tested ? 'assetCoverageTested' : 'assetCoverageUntested'
}
function visibleGraph(model: CoverageModel, query: string, kind: string, state: string, expanded: Record<string, number>): { nodes: CoverageNode[]; folds: Fold[]; edges: CoverageModel['edges'] } {
  const byId = new Map(model.nodes.map(node => [node.id, node]))
  const parents = new Map(model.edges.map(edge => [edge.source, edge.target]))
  const matched = model.nodes.filter(node =>
    (!query || node.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    && (!kind || node.kind === kind) && (!state || status(node) === state))
  const included = new Set(matched.map(node => node.id))
  for (const node of matched) {
    let parent = parents.get(node.id)
    const visited = new Set<string>()
    while (parent && !visited.has(parent)) { visited.add(parent); included.add(parent); parent = parents.get(parent) }
  }
  const groups = new Map<string, CoverageNode[]>()
  for (const node of model.nodes) {
    if (!included.has(node.id)) continue
    const key = `${parents.get(node.id) ?? ''}:${node.kind}`
    const list = groups.get(key) ?? []; list.push(node); groups.set(key, list)
  }
  const hidden = new Set<string>(), folds: Fold[] = []
  for (const [key, nodes] of groups) {
    const excess = nodes.slice(expanded[key] ?? 20)
    if (!excess.length) continue
    for (const node of excess) hidden.add(node.id)
    const first = nodes[0]
    if (first) folds.push({ id: key, parent: parents.get(first.id) ?? '', kind: first.kind, hidden: excess })
  }
  let changed = true
  while (changed) {
    changed = false
    for (const edge of model.edges) {
      if (hidden.has(edge.target) && !hidden.has(edge.source)) { hidden.add(edge.source); changed = true }
    }
  }
  const nodes = model.nodes.filter(node => included.has(node.id) && !hidden.has(node.id))
  const visible = new Set(nodes.map(node => node.id))
  return {
    nodes, folds: folds.filter(fold => !fold.parent || visible.has(fold.parent)),
    edges: model.edges.filter(edge => visible.has(edge.source) && visible.has(edge.target) && byId.has(edge.source)),
  }
}
function layout(nodes: CoverageNode[], edges: CoverageModel['edges'], folds: Fold[]): { positions: Map<string, Point>; bounds: View } {
  const parents = new Map(edges.map(edge => [edge.source, edge.target]))
  const depth = (id: string): number => {
    let n = 0, current = parents.get(id)
    const seen = new Set([id])
    while (current && !seen.has(current)) { seen.add(current); n++; current = parents.get(current) }
    return n
  }
  const columns = new Map<number, string[]>()
  for (const node of nodes) { const d = depth(node.id), list = columns.get(d) ?? []; list.push(node.id); columns.set(d, list) }
  for (const fold of folds) { const d = fold.parent ? depth(fold.parent) + 1 : 0, list = columns.get(d) ?? []; list.push(`fold:${fold.id}`); columns.set(d, list) }
  const positions = new Map<string, Point>()
  for (const [d, ids] of columns) ids.forEach((id, i) => { positions.set(id, { x: 110 + d * 235, y: 320 + i * 96 }) })
  return { positions, bounds: { x: 0, y: 0,
    width: Math.max(800, ...[...positions.values()].map(p => p.x + 160)),
    height: Math.max(500, ...[...positions.values()].map(p => p.y + 90)),
  } }
}

/** Draw persisted assets without treating an observation as full diagnostic completion.
 * @param props - saved asset projection and task-owned refresh/navigation callbacks.
 * @returns an interactive asset graph and selected asset details.
 */
export function TaskAssetCoverage({ t, model, loading, error, auto, onAutoChange, refresh, openWorker }: Props): ReactNode {
  const [query, setQuery] = useState(''), [kind, setKind] = useState(''), [state, setState] = useState('')
  const [expanded, setExpanded] = useState<Record<string, number>>({}), [selected, select] = useState<string>()
  const [offsets, setOffsets] = useState<Record<string, Point>>({})
  const [view, setView] = useState<View>({ x: 0, y: 0, width: 1100, height: 650 })
  const svg = useRef<SVGSVGElement>(null)
  const suppressClick = useRef(false)
  const drag = useRef<{ pointer: number; start: Point; origin: Point; node?: string; moved: boolean } | undefined>(undefined)
  const graph = useMemo(() => visibleGraph(model, query, kind, state, expanded), [model, query, kind, state, expanded])
  const placed = useMemo(() => layout(graph.nodes, graph.edges, graph.folds), [graph])
  const point = (id: string): Point => offsets[id] ?? placed.positions.get(id) ?? { x: 0, y: 0 }
  const selectedNode = model.nodes.find(node => node.id === selected)
  const findingGroups = projectFindingGroups(selectedNode?.refs.findings ?? [])
  const selectedFold = graph.folds.find(fold => `fold:${fold.id}` === selected)
  useEffect(() => {
    const element = svg.current
    if (!element) return
    const wheel = (event: WheelEvent): void => {
      const rect = element.getBoundingClientRect(); if (!rect.width || !rect.height) return
      event.preventDefault()
      setView((current) => {
        const scale = Math.min(rect.width / current.width, rect.height / current.height)
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1
        if (!event.ctrlKey) return { ...current, x: current.x + event.deltaX * unit / scale, y: current.y + event.deltaY * unit / scale }
        const ratio = Math.min(10000, Math.max(300, current.width * Math.exp(event.deltaY * unit * .01))) / current.width
        const x = (event.clientX - rect.left - (rect.width - current.width * scale) / 2) / scale
        const y = (event.clientY - rect.top - (rect.height - current.height * scale) / 2) / scale
        return { x: current.x + x * (1 - ratio), y: current.y + y * (1 - ratio),
          width: current.width * ratio, height: current.height * ratio }
      })
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => { element.removeEventListener('wheel', wheel) }
  }, [])
  const zoom = (factor: number): void => {
    setView((current) => {
      const width = Math.min(10000, Math.max(300, current.width * factor)), ratio = width / current.width
      return { x: current.x + current.width * (1 - ratio) / 2, y: current.y + current.height * (1 - ratio) / 2,
        width, height: current.height * ratio }
    })
  }
  const selectNode = (id: string): void => { if (!suppressClick.current) select(id); suppressClick.current = false }
  return <section className={css.root} aria-label={t('assetCoverageTitle')}>
    <div className={css.toolbar}><input aria-label={t('assetCoverageSearch')} placeholder={t('assetCoverageSearch')} value={query} onChange={(event) => { setQuery(event.target.value) }} /><select aria-label={t('assetCoverageTitle')} value={kind} onChange={(event) => { setKind(event.target.value) }}><option value="">{t('assetCoverageAll')}</option>{Object.entries(kinds).map(([id, meta]) => <option key={id} value={id}>{t(meta.key)}</option>)}</select><select aria-label={t('status')} value={state} onChange={(event) => { setState(event.target.value) }}><option value="">{t('assetCoverageAll')}</option>{(['assetCoverageTested', 'assetCoverageUntested', 'assetCoverageOutside', 'assetCoverageUnknown'] as const).map(key => <option key={key} value={key}>{t(key)}</option>)}</select><div className={css.spacer} />{refresh && <Button size="sm" disabled={loading} onClick={refresh}><IconRefreshOutlineRegular size={14} />{t('assetCoverageRefresh')}</Button>}{onAutoChange && <Button size="sm" aria-pressed={auto} onClick={() => { onAutoChange(!auto) }}>{t('assetCoverageAuto')}</Button>}</div>
    {error && <p className={css.notice} role="alert">{t('assetCoverageError')}</p>}
    <div className={css.canvas}>
      <svg ref={svg} className={css.graph} viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} aria-label={t('assetCoverageTitle')} onPointerDown={(event) => { if (event.button !== 0) return; const node = (event.target as Element).closest('[data-coverage-node]')?.getAttribute('data-coverage-node') ?? undefined; drag.current = { pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: node ? point(node) : { x: view.x, y: view.y }, ...(node ? { node } : {}), moved: false }; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={(event) => { const current = drag.current; if (!current || current.pointer !== event.pointerId) return; const rect = event.currentTarget.getBoundingClientRect(); if (!rect.width || !rect.height) return; const scale = Math.max(view.width / rect.width, view.height / rect.height), dx = event.clientX - current.start.x, dy = event.clientY - current.start.y; if (Math.abs(dx) + Math.abs(dy) > 3) current.moved = true; const nodeId = current.node; if (nodeId) setOffsets(old => ({ ...old, [nodeId]: { x: current.origin.x + dx * scale, y: current.origin.y + dy * scale } })); else setView(old => ({ ...old, x: current.origin.x - dx * scale, y: current.origin.y - dy * scale })) }} onPointerUp={(event) => { const current = drag.current; suppressClick.current = !!current?.node && current.moved; if (current?.node && !current.moved) select(current.node); drag.current = undefined; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }} onPointerCancel={() => { drag.current = undefined }}>
        <title>{t('assetCoverageTitle')}</title>
        {graph.edges.map((edge) => { const a = point(edge.source), b = point(edge.target); return <path key={edge.id} className={css.edge} d={`M${a.x} ${a.y}C${(a.x + b.x) / 2} ${a.y},${(a.x + b.x) / 2} ${b.y},${b.x} ${b.y}`} /> })}
        {graph.folds.map((fold) => { const p = point(`fold:${fold.id}`), parent = point(fold.parent); return <g key={fold.id}><path className={css.edge} d={`M${parent.x} ${parent.y}L${p.x} ${p.y}`} /><g role="button" tabIndex={0} aria-label={`${t('assetCoverageHidden')}: ${fold.hidden.length}`} className={css.fold} transform={`translate(${p.x},${p.y})`} onClick={() => { select(`fold:${fold.id}`) }} onKeyDown={(event) => { if (event.key === 'Enter') select(`fold:${fold.id}`) }}><circle r="20" /><text textAnchor="middle" dy="5">+{fold.hidden.length}</text><text textAnchor="middle" y="40">{t(kinds[fold.kind].key)}</text></g></g> })}
        {graph.nodes.map((node) => { const p = point(node.id), meta = kinds[node.kind], Icon = meta.Icon; return <g key={node.id} data-coverage-node={node.id} data-coverage-state={status(node)} data-kind={node.kind} role="button" tabIndex={0} aria-label={node.label} aria-pressed={selected === node.id} className={`${css.node} ${node.tested && node.inScope ? css.tested : ''} ${!node.inScope ? css.outside : ''} ${selected === node.id ? css.selected : ''}`} transform={`translate(${p.x},${p.y})`} onClick={() => { selectNode(node.id) }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(node.id) } }}><title>{`${node.label} · ${t(status(node))}`}</title><circle r={node.kind === 'company' ? 27 : node.kind === 'domain' ? 23 : 19} /><g transform="translate(-11,-11)"><Icon size={22} /></g><text textAnchor="middle" y="43">{node.label.length > 29 ? `${node.label.slice(0, 28)}…` : node.label}</text></g> })}
      </svg>
      <div className={css.legend}><strong>{model.stats.percentage === null ? '—' : `${Math.round(model.stats.percentage)}%`}</strong><span>{t('assetCoverageTested')} {model.stats.tested} / {model.stats.denominator}</span><div className={css.types}>{Object.entries(model.stats.byType).map(([id, count]) => <span key={id}>{t(kinds[id as CoverageKind].key)} {count.tested}/{count.total}</span>)}</div><p>{t('assetCoverageRough')}</p><div className={css.statusLegend}><span className={css.observedDot}>● {t('assetCoverageTested')}</span><span>○ {t('assetCoverageUntested')}</span><span>◌ {t('assetCoverageOutside')}</span></div></div>
      {graph.nodes.length === 0 && <p className={css.empty}>{t('assetCoverageEmpty')}</p>}
      {model.warnings.length > 0 && <p className={css.warning}>{t('assetCoverageWarnings')}</p>}
      <div className={css.controls}><Tooltip label={t('assetCoverageZoomIn')}><Button variant="ghost" size="sm" aria-label={t('assetCoverageZoomIn')} onClick={() => { zoom(.8) }}><IconPlusOutlineRegular size={16} /></Button></Tooltip><Tooltip label={t('assetCoverageZoomOut')}><Button variant="ghost" size="sm" aria-label={t('assetCoverageZoomOut')} onClick={() => { zoom(1.25) }}>−</Button></Tooltip><Tooltip label={t('assetCoverageFit')}><Button variant="ghost" size="sm" aria-label={t('assetCoverageFit')} onClick={() => { const points = [...placed.positions.keys()].map(point); setView({ x: Math.min(0, ...points.map(p => p.x - 70)), y: Math.min(0, ...points.map(p => p.y - 80)), width: Math.max(800, ...points.map(p => p.x + 150)), height: Math.max(500, ...points.map(p => p.y + 90)) }) }}><IconFullscreenOutlineRegular size={16} /></Button></Tooltip></div><p className={css.help}>{t('assetCoverageHelp')}</p>
      {(selectedNode || selectedFold) && <aside className={css.details} aria-label={t('assetCoverageDetails')}><header><h3>{selectedNode?.label ?? t('assetCoverageHidden')}</h3><Button variant="ghost" size="sm" aria-label={t('assetCoverageClose')} onClick={() => { select(undefined) }}><IconCloseOutlineRegular size={16} /></Button></header><div className={css.detailBody}>{selectedFold ? <><p>{t(kinds[selectedFold.kind].key)} · {selectedFold.hidden.length}</p><Button size="sm" onClick={() => { const id = selectedFold.id; setExpanded(old => ({ ...old, [id]: (old[id] ?? 20) + 20 })); select(undefined) }}>{t('assetCoverageMore')}</Button>{selectedFold.hidden.slice(0, 20).map(node => <Button key={node.id} variant="ghost" size="sm" onClick={() => { select(node.id) }}>{node.label}</Button>)}</> : selectedNode && <><p>{t(kinds[selectedNode.kind].key)} · {t(status(selectedNode))}</p><code>{selectedNode.label}</code><h4>{t('assetCoveragePlans')}</h4>{selectedNode.refs.plans.length ? selectedNode.refs.plans.map(plan => <p key={`${plan.planId}:${plan.itemId}`}>{plan.title}</p>) : <p>{t('assetCoverageNone')}</p>}<h4>{t('assetCoverageWorkers')}</h4>{selectedNode.refs.workers.length ? selectedNode.refs.workers.map(worker => <div className={css.record} key={worker.runId}><p>{t(workerLabels[worker.status])} · {worker.evidence?.status ?? '—'}</p><code>{worker.url}</code>{openWorker && <Button size="sm" onClick={() => { openWorker(worker.runId) }}>{t('assetCoverageOpenWorker')}</Button>}{worker.evidence && <details><summary>{t('assetCoverageEvidence')}</summary><pre>{JSON.stringify(worker.evidence, null, 2)}</pre></details>}</div>) : <p>{t('assetCoverageNone')}</p>}<h4>{t('assetCoverageFindings')}</h4>{findingGroups.length ? findingGroups.map(({ finding, related }) => <div className={css.record} key={finding.id}><p>{finding.title}</p><p>{t(severityLabels[finding.severity])} · {t(findingLabels[finding.status])}</p><p>{finding.summary}</p>{related.length > 0 && <details><summary>{t('findingRecordsRelatedEvidence')} · {related.length}</summary>{related.map(source => <div key={source.id}><p>{source.title}</p><p>{t('workerSpeaker')}: {source.workerRunId}</p><code>{source.evidence.url}</code><p>{source.proof}</p></div>)}</details>}</div>) : <p>{t('assetCoverageNone')}</p>}</>}</div></aside>}
    </div>
  </section>
}
