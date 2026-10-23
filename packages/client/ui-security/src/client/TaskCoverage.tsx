/** Local SVG asset coverage preview without force-layout dependencies. */
import { useState, type ReactNode } from 'react'
import { Button, IconPlusOutlineRegular, IconRefreshOutlineRegular, IconWorkspaceTreeOutlineRegular, IconGlobeOutlineRegular, IconBranchOutlineRegular, IconCompactOutlineRegular, IconSettingsOutlineRegular, IconBrowseOutlineRegular, IconLinkOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SecurityTranslate } from './presentation.tsx'
import css from './TaskCoverage.module.css'
const kinds = [
  { label: 'taskCoverageCompany', color: '#718198', icon: IconWorkspaceTreeOutlineRegular }, { label: 'taskCoverageDomain', color: '#8766ef', icon: IconGlobeOutlineRegular }, { label: 'taskCoverageSubdomain', color: '#438afa', icon: IconBranchOutlineRegular }, { label: 'taskCoverageIp', color: '#129cb5', icon: IconCompactOutlineRegular }, { label: 'taskCoverageService', color: '#efa20c', icon: IconSettingsOutlineRegular }, { label: 'taskCoverageApp', color: '#c943f0', icon: IconBrowseOutlineRegular }, { label: 'taskCoverageEndpoint', color: '#f24378', icon: IconLinkOutlineRegular },
] as const
type KindIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6
function AssetIcon({ kind, size }: { kind: KindIndex; size: number }): ReactNode {
  const Icon = kinds[kind].icon
  return <Icon size={size} />
}
type CoverageNode = { id: string; label: string; x: number; y: number; kind: KindIndex; status: string }
const initial: CoverageNode[] = [
  { id: 'company', label: 'Acme Corp', x: 660, y: 175, kind: 0, status: 'outside' },
  { id: 'ip', label: '203.0.113.10', x: 690, y: 90, kind: 3, status: 'tested' },
  { id: 'domain', label: 'acme.example', x: 650, y: 350, kind: 1, status: 'outside' },
  { id: 'admin', label: 'admin.acme.example', x: 520, y: 380, kind: 2, status: 'untested' },
  { id: 'admin-service', label: ':443 · Admin · 200', x: 420, y: 420, kind: 4, status: 'untested' },
  { id: 'api', label: 'api.acme.example', x: 730, y: 410, kind: 2, status: 'tested' },
  { id: 'api-service', label: ':443 · API Gateway · 401', x: 820, y: 330, kind: 4, status: 'tested' },
  { id: 'orders', label: '/v1/orders', x: 900, y: 250, kind: 6, status: 'untested' },
  { id: 'www', label: 'www.acme.example', x: 810, y: 470, kind: 2, status: 'tested' },
  { id: 'web-service', label: ':443 · Web · 200', x: 930, y: 530, kind: 4, status: 'tested' },
  { id: 'search', label: '/search', x: 1040, y: 570, kind: 6, status: 'tested' },
]
const links = [['company', 'ip'], ['company', 'domain'], ['domain', 'admin'], ['admin', 'admin-service'], ['domain', 'api'], ['api', 'api-service'], ['api-service', 'orders'], ['domain', 'www'], ['www', 'web-service'], ['web-service', 'search']]
/** Render sample asset relationships with draggable nodes and zoom controls.
 * @param props - localized security copy.
 * @returns coverage legend, interactive sample graph and selected-node summary.
 */
export function TaskCoverage({ t }: { t: SecurityTranslate }): ReactNode {
  const [nodes, setNodes] = useState(initial)
  const [zoom, setZoom] = useState(1)
  const [selectedId, setSelectedId] = useState<string>()
  const [dragId, setDragId] = useState<string>()
  const selected = nodes.find(node => node.id === selectedId)
  const statusKey = (status: string): 'taskCoverageTested' | 'taskCoverageUntested' | 'taskCoverageOutside' => status === 'tested' ? 'taskCoverageTested' : status === 'untested' ? 'taskCoverageUntested' : 'taskCoverageOutside'
  return <section className={css.root} aria-label={t('taskCoverageTitle')}><div className={css.canvas}>
    <svg className={css.graph} viewBox={`${650 - 650 / zoom} ${350 - 350 / zoom} ${1300 / zoom} ${700 / zoom}`} role="img" aria-label={t('taskCoverageTitle')} onPointerMove={(event) => { if (!dragId) return; const point = event.currentTarget.createSVGPoint(); point.x = event.clientX; point.y = event.clientY; const matrix = event.currentTarget.getScreenCTM(); if (!matrix) return; const local = point.matrixTransform(matrix.inverse()); setNodes(nodes.map(node => node.id === dragId ? { ...node, x: local.x, y: local.y } : node)) }} onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); setDragId(undefined) }} onPointerCancel={() => { setDragId(undefined) }}><title>{t('taskCoverageSample')}</title>
      {links.map(([sourceId, targetId]) => { const source = nodes.find(node => node.id === sourceId); const target = nodes.find(node => node.id === targetId); if (!source || !target) throw new Error('Sample coverage link has no asset'); return <line key={`${sourceId}-${targetId}`} x1={source.x} y1={source.y} x2={target.x} y2={target.y} className={css.edge} /> })}
      {nodes.map(node => <g key={node.id} transform={`translate(${node.x},${node.y})`} className={css.node} role="button" tabIndex={0} aria-label={`${node.label}: ${t(statusKey(node.status))}`} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(node.id) } }} onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId); setDragId(node.id); setSelectedId(node.id) }}><title>{node.label} · {t(statusKey(node.status))}</title><circle r={node.kind === 0 || node.kind === 1 ? 25 : 17} fill={node.status === 'tested' ? kinds[node.kind].color : node.status === 'outside' ? 'var(--dsw-alias-bg-layer-1)' : '#8b9ab0'} stroke={selectedId === node.id ? '#548efa' : node.status === 'tested' ? '#12b88c' : '#a2adbd'} strokeWidth={selectedId === node.id ? 3 : 1.7} strokeDasharray={node.status === 'outside' ? '4 3' : undefined} opacity={node.status === 'outside' ? .65 : 1} /><foreignObject x="-12" y="-12" width="24" height="24" className={css.nodeIcon}><div className={css.nodeIconInner}><AssetIcon kind={node.kind} size={node.kind < 2 ? 23 : 19} /></div></foreignObject><rect x={-Math.min(220, node.label.length * 6.5) / 2} y={node.kind < 2 ? 31 : 23} width={Math.min(220, node.label.length * 6.5)} height="18" rx="3" className={css.labelBackground} /><text y={node.kind < 2 ? 44 : 36} textAnchor="middle" className={css.nodeLabel}>{node.label}</text></g>)}
    </svg>
    <div className={css.legend}><div className={css.legendHeading}><span>{t('taskCoverageCount')}</span><Button variant="ghost" size="sm" aria-label={t('taskCoverageReset')} onClick={() => { setNodes(initial); setZoom(1); setSelectedId(undefined) }}><IconRefreshOutlineRegular size={14} /></Button></div><div className={css.kinds}>{kinds.map(kind => <span key={kind.label}><i style={{ background: kind.color }}><kind.icon size={12} /></i>{t(kind.label)}</span>)}</div><div className={css.statuses}><span><i className={css.tested} />{t('taskCoverageTested')}</span><span><i className={css.untested} />{t('taskCoverageUntested')}</span><span><i className={css.outside} />{t('taskCoverageOutside')}</span></div><p>{t('taskCoverageHint')}</p><p className={css.sample}>{t('taskCoverageSample')}</p></div>
    <div className={css.controls}><Button variant="ghost" size="sm" aria-label={t('taskCoverageZoomIn')} onClick={() => { setZoom(Math.min(2.5, zoom * 1.2)) }}><IconPlusOutlineRegular size={16} /></Button><Button variant="ghost" size="sm" aria-label={t('taskCoverageZoomOut')} onClick={() => { setZoom(Math.max(.6, zoom / 1.2)) }}><span aria-hidden="true">−</span></Button></div>
    {selected && <div className={css.selection}><span>{t('taskCoverageSelection')}</span><strong>{selected.label}</strong><span>{t(kinds[selected.kind].label)} · {t(statusKey(selected.status))}</span></div>}
  </div></section>
}
