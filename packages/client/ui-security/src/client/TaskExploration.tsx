/** Stored exploration graph and isolated sample preview. */
import { useEffect, useId, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { Button, IconPlusOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ActivityModel, ActivityNode } from './activity-model.ts'
import type { SecurityTranslate } from './presentation.tsx'
import css from './TaskExploration.module.css'

const kinds = [
  { key: 'explorationOrigin', color: '#718198' },
  { key: 'explorationGoal', color: '#12b88c' },
  { key: 'explorationIntent', color: '#468cff' },
  { key: 'explorationFact', color: '#f5a623' },
  { key: 'explorationFinding', color: '#f34d75' },
  { key: 'explorationHint', color: '#9764ef' },
  { key: 'explorationSummary', color: '#12b8ae' },
] as const
const relations = [
  { key: 'explorationDerived', color: '#20bd93' },
  { key: 'explorationIntentLink', color: '#8176f6' },
  { key: 'explorationProduces', color: '#edb353' },
  { key: 'explorationEvidence', color: '#f56c88' },
] as const
const nodeTitles = ['explorationScopeNode', 'explorationAuthNode', 'explorationApiNode', 'explorationPortNode', 'explorationServiceNode', 'explorationConfigNode', 'explorationAccessNode', 'explorationReviewNode', 'explorationConfirmedNode', 'explorationSummaryNode', 'explorationPublicNode', 'explorationAssetNode'] as const
type KindIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6
const columns: KindIndex[][] = [
  [0, 5, 5], [1, 1, 1], [2, 2, 2, 2, 2], [3, 3, 4, 3, 3, 4, 3],
  [2, 2], [3, 4], [2, 2], [3, 3, 4], [2], [4], [1], [2, 4], [3, 4],
]
const nodes = columns.flatMap((items, column) => items.map((kind, row) => ({
  id: `node-${column}-${row}`, column, row, kind: kinds[kind], kindIndex: kind,
  x: 65 + column * 176, y: 460 + (row - (items.length - 1) / 2) * 61,
}))).map((node, index) => {
  const title = nodeTitles[index % nodeTitles.length]
  if (!title) throw new Error('Sample exploration node has no title')
  return { ...node, title }
})
const edges = nodes.filter(node => node.column > 0).map((node) => {
  const previous = columns[node.column - 1]
  if (!previous) throw new Error('Sample exploration node has no preceding column')
  const source = nodes.find(candidate => candidate.column === node.column - 1
    && candidate.row === Math.min(node.row, previous.length - 1))
  if (!source) throw new Error('Sample exploration edge has no source')
  const relationIndex = node.kindIndex === 4 ? 3 : node.kindIndex === 3 ? 2 : node.column < 3 ? 0 : 1
  return { target: node, source, relation: relations[relationIndex], relationIndex }
})
const initialView = { x: 0, y: 0, width: 2400, height: 900 }

/** Draw a local graph preview with pan, zoom, fit and minimap controls.
 * @param props - localized security dictionary.
 * @returns a viewport-sized graph canvas with sample nodes and connections.
 */
function SampleExploration({ t }: { t: SecurityTranslate }): ReactNode {
  const prefix = useId().replaceAll(':', '')
  const [view, setView] = useState(initialView)
  const [drag, setDrag] = useState<{ pointer: number; clientX: number; clientY: number; x: number; y: number }>()
  const zoom = (factor: number): void => {
    setView((current) => {
      const width = Math.min(3600, Math.max(450, current.width * factor))
      const height = width * initialView.height / initialView.width
      return { x: current.x + (current.width - width) / 2, y: current.y + (current.height - height) / 2, width, height }
    })
  }
  const stopDrag = (event: PointerEvent<SVGSVGElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    setDrag(undefined)
  }
  return <section className={css.root} aria-label={t('explorationTitle')}>
    <div className={css.canvas}>
      <svg className={`${css.graph} ${drag ? css.dragging : ''}`} viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} aria-label={t('explorationTitle')} role="img" onPointerDown={(event) => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); setDrag({ pointer: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: view.x, y: view.y }) }} onPointerMove={(event) => { if (!drag || drag.pointer !== event.pointerId) return; const bounds = event.currentTarget.getBoundingClientRect(); const scale = Math.max(view.width / bounds.width, view.height / bounds.height); setView({ ...view, x: drag.x - (event.clientX - drag.clientX) * scale, y: drag.y - (event.clientY - drag.clientY) * scale }) }} onPointerUp={stopDrag} onPointerCancel={stopDrag}>
        <title>{t('explorationSample')}</title>
        <defs>{relations.map((relation, index) => <marker key={relation.key} id={`${prefix}-arrow-${index}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill={relation.color} /></marker>)}</defs>
        {edges.map(edge => <path key={edge.target.id} d={`M ${edge.source.x + 133} ${edge.source.y + 23} C ${edge.source.x + 158} ${edge.source.y + 23}, ${edge.target.x - 25} ${edge.target.y + 23}, ${edge.target.x} ${edge.target.y + 23}`} fill="none" stroke={edge.relation.color} strokeWidth="1.6" opacity=".58" markerEnd={`url(#${prefix}-arrow-${edge.relationIndex})`} />)}
        {nodes.map((node, index) => <g key={node.id} transform={`translate(${node.x},${node.y})`}><title>{t(node.title)}</title><rect width="133" height="47" rx="5" className={css.node} /><rect x="7" y="7" width="8" height="8" rx="2" fill={node.kind.color} /><text x="20" y="14" className={css.kindLabel}>{t(node.kind.key)}</text><text x="8" y="28" className={css.nodeLabel}>{t(node.title).slice(0, 20)}</text><rect x="8" y="35" width="28" height="5" rx="2" fill={node.kind.color} opacity=".22" /><text x="123" y="40" className={css.nodeNumber} textAnchor="end">#{index + 1}</text></g>)}
      </svg>
      <div className={css.legend}>
        <div className={css.kindLegend}>{kinds.map(kind => <span key={kind.key}>
          <i style={{ background: kind.color }} />{t(kind.key)}
        </span>)}</div>
        <div className={css.relationLegend}>{relations.map(relation => <span key={relation.key}>
          <i style={{ background: relation.color }} />{t(relation.key)}
        </span>)}</div></div>
      <span className={css.sample}>{t('explorationSample')}</span>
      <div className={css.controls}><Button variant="ghost" size="sm" aria-label={t('explorationZoomIn')} title={t('explorationZoomIn')} onClick={() => { zoom(.8) }}><IconPlusOutlineRegular size={17} /></Button><Button variant="ghost" size="sm" aria-label={t('explorationZoomOut')} title={t('explorationZoomOut')} onClick={() => { zoom(1.25) }}><svg width="17" height="17" viewBox="0 0 17 17" aria-hidden="true"><path d="M4 8.5h9" stroke="currentColor" strokeWidth="1.3" /></svg></Button><Button variant="ghost" size="sm" aria-label={t('explorationFit')} title={t('explorationFit')} onClick={() => { setView(initialView) }}><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg></Button></div>
      <div className={css.minimap} aria-label={t('explorationMinimap')}><svg viewBox="0 0 2400 900" role="img" aria-label={t('explorationMinimap')}>{edges.map(edge => <line key={edge.target.id} x1={edge.source.x + 133} y1={edge.source.y + 23} x2={edge.target.x} y2={edge.target.y + 23} stroke={edge.relation.color} strokeWidth="8" opacity=".3" />)}{nodes.map(node => <rect key={node.id} x={node.x} y={node.y} width="133" height="47" rx="3" fill={node.kind.color} />)}<rect x={view.x} y={view.y} width={view.width} height={view.height} className={css.viewport} /></svg></div>
      <p className={css.help}>{t('explorationHelp')}</p>
    </div>
  </section>
}


type GraphView = typeof initialView
type PositionedNode = ActivityNode & { x: number; y: number }
const activityKinds = {
  goal: { key: 'explorationGoal', color: '#12b88c' },
  asset: { key: 'explorationAsset', color: '#718198' },
  intent: { key: 'explorationIntent', color: '#468cff' },
  fact: { key: 'explorationFact', color: '#f5a623' },
  observation: { key: 'explorationObservation', color: '#12b8ae' },
  finding: { key: 'explorationFinding', color: '#ff365d' },
  hint: { key: 'explorationHint', color: '#9764ef' },
  review: { key: 'explorationReview', color: '#9764ef' },
  execution: { key: 'explorationExecution', color: '#12b8ae' },
  message: { key: 'explorationMessage', color: '#718198' },
} as const
const activitySources = { planner: 'explorationReview', worker: 'worker', owner: 'explorationOwner', system: 'explorationSystem' } as const
const activityStatuses = { pending: 'pending', recorded: 'explorationRecorded', planning: 'explorationPlanning', ready: 'explorationReady', running: 'running', completed: 'completed', failed: 'failed', cancelled: 'explorationCancelled', interrupted: 'explorationInterrupted', 'needs-input': 'explorationNeedsInput', unverified: 'explorationUnverified', supported: 'explorationSupported', contradicted: 'explorationContradicted' } as const
const activityRelations = {
  contains: 'explorationContains', dispatches: 'explorationDispatches', produces: 'explorationProduces',
  reviews: 'explorationReviews', replans: 'explorationReplans', targets: 'explorationTargets',
  'derived-from': 'explorationDerived', supports: 'explorationSupports', contradicts: 'explorationContradicts',
} as const

function layoutActivity(model: ActivityModel): { nodes: PositionedNode[]; bounds: GraphView } {
  const ordered = model.nodes.filter(node => node.kind !== 'message').sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
  const columns = new Map(ordered.map(node => [node.id, node.kind === 'asset' || node.kind === 'goal' ? 0 : 1]))
  // Asset links describe scope, not a causal ordering of investigations.
  const causal = model.edges.filter(edge => edge.kind !== 'targets' && !edge.source.startsWith('goal:') && !edge.source.startsWith('asset:'))
  for (let pass = 0; pass < ordered.length; pass++) {
    let changed = false
    for (const edge of causal) {
      const source = columns.get(edge.source), target = columns.get(edge.target)
      if (source === undefined || target === undefined || source + 1 <= target) continue
      columns.set(edge.target, Math.min(ordered.length, source + 1))
      changed = true
    }
    if (!changed) break
  }
  const groups = new Map<number, ActivityNode[]>()
  for (const node of ordered) {
    const depth = columns.get(node.id) ?? 0
    const group = groups.get(depth) ?? []
    group.push(node)
    groups.set(depth, group)
  }
  const positioned: PositionedNode[] = []
  let offset = 0
  for (const [, group] of [...groups].sort(([a], [b]) => a - b)) {
    group.forEach((node, index) => {
      positioned.push({ ...node, x: 70 + (offset + Math.floor(index / 6)) * 235, y: 150 + (index % 6) * 92 })
    })
    offset += Math.ceil(group.length / 6)
  }
  return { nodes: positioned, bounds: {
    x: 0, y: 0, width: Math.max(700, ...positioned.map(node => node.x + 240)),
    height: Math.max(440, ...positioned.map(node => node.y + 140)),
  } }
}

type ExplorationProps = {
  t: SecurityTranslate
  model?: ActivityModel
  auto?: boolean
  onAutoChange?: (value: boolean) => void
  refresh?: () => void
  loading?: boolean
  error?: boolean | undefined
}

/** Render persisted activity relationships, or the isolated sample when no model is supplied.
 * @param props - localized dictionary and task-owned activity projection.
 * @returns an interactive graph whose edges reflect stored references.
 */
export function TaskExploration(props: ExplorationProps): ReactNode {
  return props.model ? <StoredExploration {...props} model={props.model} /> : <SampleExploration t={props.t} />
}

function StoredExploration(
  { t, model, auto, onAutoChange, refresh, loading, error }: ExplorationProps & { model: ActivityModel },
): ReactNode {
  const title = (node: ActivityNode): string => node.payload.recordType === 'shared-knowledge'
    && node.payload.state === 'unknown' && node.title === 'Source unavailable' ? t('explorationSourceUnavailable') : node.title
  const graph = useMemo(() => layoutActivity(model), [model])
  const prefix = useId().replaceAll(':', '')
  const [view, setView] = useState({ x: 0, y: 0, width: 1100, height: 600 })
  const svgRef = useRef<SVGSVGElement>(null)
  const fitted = useRef(false)
  const [selectedId, select] = useState<string>()
  const [drag, setDrag] = useState<{ pointer: number; clientX: number; clientY: number; x: number; y: number }>()
  useEffect(() => {
    if (!loading && !fitted.current && graph.nodes.length > 0) {
      fitted.current = true
      const rect = svgRef.current?.getBoundingClientRect()
      setView({ x: 0, y: 0, width: rect?.width || 1100, height: rect?.height || 600 })
    }
  }, [graph.nodes.length, loading])
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const wheel = (event: WheelEvent): void => {
      const rect = svg.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      event.preventDefault()
      setView((current) => {
        // SVG's default xMidYMid meet transform includes letterboxing after Fit.
        const scale = Math.min(rect.width / current.width, rect.height / current.height)
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1
        if (!event.ctrlKey) return { ...current, x: current.x + event.deltaX * unit / scale, y: current.y + event.deltaY * unit / scale }
        const width = Math.min(Math.max(3600, graph.bounds.width * 2), Math.max(350, current.width * Math.exp(event.deltaY * unit * .01)))
        const ratio = width / current.width
        const x = (event.clientX - rect.left - (rect.width - current.width * scale) / 2) / scale
        const y = (event.clientY - rect.top - (rect.height - current.height * scale) / 2) / scale
        return { x: current.x + x * (1 - ratio), y: current.y + y * (1 - ratio), width, height: current.height * ratio }
      })
    }
    svg.addEventListener('wheel', wheel, { passive: false })
    return () => { svg.removeEventListener('wheel', wheel) }
  }, [graph.bounds.width, graph.nodes.length])
  const byId = new Map(graph.nodes.map(node => [node.id, node]))
  const selected = selectedId ? byId.get(selectedId) : undefined
  const zoom = (factor: number): void => { setView((current) => {
    const width = Math.min(Math.max(3600, graph.bounds.width * 2), Math.max(350, current.width * factor))
    const height = current.height * width / current.width
    return { x: current.x + (current.width - width) / 2, y: current.y + (current.height - height) / 2, width, height }
  }) }
  const stopDrag = (event: PointerEvent<SVGSVGElement>): void => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    setDrag(undefined)
  }
  return <section className={css.root} aria-label={t('explorationTitle')}>
    <div className={css.canvas}>
      <div className={css.refreshControls}>{refresh && <Button size="sm" disabled={loading} onClick={refresh}>{t('explorationRefresh')}</Button>}{onAutoChange && <Button size="sm" aria-pressed={auto} onClick={() => { onAutoChange(!auto) }}>{t('explorationAutoRefresh')}</Button>}</div>
      {error && <p role="alert" className={css.error}>{t('explorationError')}</p>}
      {graph.nodes.length === 0 ? <p className={css.empty}>{t(loading ? 'explorationLoading' : 'explorationEmpty')}</p> : <>
        <svg ref={svgRef} className={`${css.graph} ${css.storedGraph} ${drag ? css.dragging : ''}`} viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} aria-label={t('explorationTitle')}
          onPointerDown={(event) => { if (event.button !== 0 || (event.target as Element).closest('[data-activity-node]')) return; event.currentTarget.setPointerCapture(event.pointerId); setDrag({ pointer: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: view.x, y: view.y }) }}
          onPointerMove={(event) => {
            if (!drag || drag.pointer !== event.pointerId) return
            const rect = event.currentTarget.getBoundingClientRect()
            if (!rect.width || !rect.height) return
            const scale = Math.max(view.width / rect.width, view.height / rect.height)
            setView({ ...view, x: drag.x - (event.clientX - drag.clientX) * scale, y: drag.y - (event.clientY - drag.clientY) * scale })
          }} onPointerUp={stopDrag} onPointerCancel={stopDrag}>
          <title>{t('explorationTitle')}</title>
          <defs><marker id={`${prefix}-activity-arrow`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="currentColor" /></marker></defs>
          {model.edges.map((edge) => {
            const source = byId.get(edge.source), target = byId.get(edge.target)
            if (!source || !target) return null
            const related = edge.kind !== 'targets' && (selectedId === edge.source || selectedId === edge.target)
            return <g key={edge.id} data-activity-edge={edge.id} className={`${css.edge} ${related ? css.relatedEdge : selectedId ? css.dimmedEdge : ''}`}><title>{t(activityRelations[edge.kind])}</title><path d={`M${source.x + 180} ${source.y + 30} C${source.x + 210} ${source.y + 30},${target.x - 30} ${target.y + 30},${target.x} ${target.y + 30}`} fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray={edge.kind === 'targets' ? '4 4' : undefined} markerEnd={`url(#${prefix}-activity-arrow)`} />{related && <text x={(source.x + target.x + 180) / 2} y={(source.y + target.y) / 2 + 23}>{t(activityRelations[edge.kind])}</text>}</g>
          })}
          {graph.nodes.map(node => <g key={node.id} data-activity-node={node.id} role="button" tabIndex={0} aria-label={title(node)} aria-pressed={node.id === selectedId} className={css.interactiveNode} transform={`translate(${node.x},${node.y})`} onClick={() => { select(node.id) }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(node.id) } }}>
            <title>{title(node)}</title><rect width="180" height="61" rx="6" className={`${css.node} ${node.id === selectedId ? css.selected : ''}`} />
            <rect x="8" y="9" width="8" height="8" rx="2" fill={activityKinds[node.kind].color} />
            <text x="22" y="17" className={css.kindLabel}>{t(activityKinds[node.kind].key)}</text><text x="9" y="35" className={css.nodeLabel}>{title(node).length > 14 ? `${title(node).slice(0, 14)}…` : title(node)}</text>
            <text x="9" y="51" className={`${css.kindLabel} ${node.status === 'failed' ? css.failed : node.status === 'running' || node.status === 'planning' ? css.running : ''}`}>{t(activityStatuses[node.status])}</text>
          </g>)}
        </svg>
        <div className={css.legend}><div className={css.kindLegend}>{Object.entries(activityKinds).filter(([kind]) => model.nodes.some(node => node.kind === kind)).map(([kind, style]) => <span key={kind}><i style={{ background: style.color }} />{t(style.key)}</span>)}</div><div className={css.relationLegend}>{t('explorationReferenceOnly')}</div></div>
        <div className={css.controls}><Button variant="ghost" size="sm" aria-label={t('explorationZoomIn')} onClick={() => { zoom(.8) }}>+</Button><Button variant="ghost" size="sm" aria-label={t('explorationZoomOut')} onClick={() => { zoom(1.25) }}>−</Button><Button variant="ghost" size="sm" aria-label={t('explorationFit')} onClick={() => { setView(graph.bounds) }}>⌖</Button></div>
        <div className={css.minimap} aria-label={t('explorationMinimap')}><svg viewBox={`${graph.bounds.x} ${graph.bounds.y} ${graph.bounds.width} ${graph.bounds.height}`} role="img" aria-label={t('explorationMinimap')}>{graph.nodes.map(node => <rect key={node.id} x={node.x} y={node.y} width="180" height="61" fill={activityKinds[node.kind].color} />)}<rect x={view.x} y={view.y} width={view.width} height={view.height} className={css.viewport} /></svg></div>
        <p className={css.help}>{t('explorationHelp')}</p>
      </>}
      {selected && <aside className={css.details} aria-label={t('explorationDetails')}><div className={css.detailsHeader}><h3>{title(selected)}</h3><Button size="sm" variant="ghost" aria-label={t('explorationClose')} onClick={() => { select(undefined) }}>×</Button></div><div className={css.detailsBody}><dl><dt>{t('explorationNodeId')}</dt><dd>{selected.id}</dd><dt>{t('explorationSource')}</dt><dd>{t(activitySources[selected.source])} {selected.sourceId}</dd><dt>{t('status')}</dt><dd>{t(activityStatuses[selected.status])}</dd><dt>{t('explorationAsset')}</dt><dd>{selected.assetIds.map(id => byId.get(`asset:${id}`)?.title ?? id).join(', ') || '—'}</dd></dl>
        {(['upstream', 'downstream'] as const).map(direction => <div key={direction}><h4>{t(direction === 'upstream' ? 'explorationUpstream' : 'explorationDownstream')}</h4>{model.edges.filter(edge => direction === 'upstream' ? edge.target === selected.id : edge.source === selected.id).map((edge) => { const related = byId.get(direction === 'upstream' ? edge.source : edge.target); return related ? <Button key={edge.id} variant="ghost" size="sm" onClick={() => { select(related.id) }}>{t(activityRelations[edge.kind])}: {title(related)}</Button> : null })}</div>)}
        <details key={selected.id} className={css.payload}><summary>{t('explorationPayload')}</summary><pre>{JSON.stringify(selected.payload, null, 2)}</pre></details></div>
      </aside>}
    </div>
  </section>
}
