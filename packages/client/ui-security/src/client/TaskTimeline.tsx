import { executionMessageKeys } from './TaskExecution.copy.ts'
/** Local activity timeline preview without execution or data services. */
import { useState, type ReactNode } from 'react'
import { Button, Input, IconSearchOutlineRegular, IconChevronRightOutlineRegular, IconPauseOutlineRegular, IconPlayOutlineRegular, IconLightOutlineRegular, IconInfoOutlineRegular, IconPlanOutlineRegular, IconShieldOutlineRegular, IconCheckCircleOutlineRegular, IconCompactOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SecurityTranslate } from './presentation.tsx'
import type { ActivityModel, ActivityNode } from './activity-model.ts'
import css from './TaskTimeline.module.css'

const kinds = ['timelineGoal', 'timelineIntent', 'timelineFact', 'timelineFinding', 'timelineHint', 'timelineCompact'] as const
type Kind = typeof kinds[number]
const samples = [
  { id: 'i3', time: '12:55:00', kind: 'timelineIntent', title: 'timelineTitle1', status: 'running', source: 'planner', priority: 'P8' },
  { id: 'f1', time: '12:50:00', kind: 'timelineFinding', title: 'timelineTitle2', status: 'confirmed', source: 'worker #2' },
  { id: 'i10', time: '12:40:00', kind: 'timelineIntent', title: 'timelineTitle3', status: 'running', source: 'planner', priority: 'P8' },
  { id: 'i2', time: '12:30:00', kind: 'timelineIntent', title: 'timelineTitle4', status: 'completed', source: 'planner', priority: 'P9' },
  { id: 'h1', time: '12:20:00', kind: 'timelineHint', title: 'timelineTitle5', status: 'timelineAccepted', source: 'mainagent' },
  { id: 'e1', time: '11:44:00', kind: 'timelineFact', title: 'timelineTitle6', status: 'timelineRecorded', source: 'worker #5' },
  { id: 'g1', time: '11:30:00', kind: 'timelineGoal', title: 'timelineTitle7', status: 'completed', source: 'mainagent' },
  { id: 'c1', time: '10:20:00', kind: 'timelineCompact', title: 'timelineTitle8', status: 'timelineRecorded', source: 'planner' },
] as const
const icons = {
  timelineGoal: IconCheckCircleOutlineRegular,
  timelineIntent: IconPlanOutlineRegular,
  timelineFact: IconInfoOutlineRegular,
  timelineFinding: IconShieldOutlineRegular,
  timelineHint: IconLightOutlineRegular,
  timelineCompact: IconCompactOutlineRegular,
}

/** Render searchable, filterable sample task events.
 * @param props - Owning security dictionary.
 * @returns In-memory activity controls and an independently scrolling timeline.
 */
function PreviewTimeline({ t }: { t: SecurityTranslate }): ReactNode {
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState<Kind | 'all'>('all')
  const [newest, setNewest] = useState(true)
  const [auto, setAuto] = useState(false)
  const [expanded, setExpanded] = useState<string[]>([])
  const query = search.trim().toLocaleLowerCase()
  const filtered = samples.filter(item => (kind === 'all' || item.kind === kind) && `${t(item.title)} ${item.source} ${item.id} ${t(item.kind)}`.toLocaleLowerCase().includes(query))
  const rows = newest ? filtered : [...filtered].reverse()
  return <section className={css.root} aria-label={t('timeline')}>
    <div className={css.toolbar}>
      <Input icon={<IconSearchOutlineRegular size={16} />} className={css.search as string} aria-label={t('timelineSearch')} placeholder={t('timelineSearch')} value={search} onChange={(event) => { setSearch(event.target.value) }} />
      <div className={css.filters} role="group" aria-label={t('timelineCategory')}><button type="button" aria-pressed={kind === 'all'} onClick={() => { setKind('all') }}>{t('timelineAll')}</button>{kinds.map(value => <button type="button" key={value} aria-pressed={kind === value} onClick={() => { setKind(value) }}>{t(value)}</button>)}</div>
      <div className={css.actions}><Button variant="outline" size="sm" onClick={() => { setNewest(!newest) }}>{t(newest ? 'timelineNewest' : 'timelineOldest')}</Button><Button variant="outline" size="sm" aria-pressed={auto} title={t('timelineRefreshNote')} onClick={() => { setAuto(!auto) }}>{auto ? <IconPauseOutlineRegular size={14} /> : <IconPlayOutlineRegular size={14} />}{t(auto ? 'timelineAuto' : 'timelinePaused')}</Button></div>
    </div>
    <div className={css.scroll}>
      <p className={css.date}>{t('timelineDate')}</p>
      {rows.length === 0 ? <p className={css.empty}>{t('timelineEmpty')}</p> : <ol className={css.events}>{rows.map((item) => {
        const Icon = icons[item.kind]
        const open = expanded.includes(item.id)
        return <li key={item.id} className={css.event}>
          <time className={css.time} dateTime={`2026-07-26T${item.time}`}>{item.time}</time>
          <span className={`${css.marker} ${css[item.kind]}`} aria-hidden="true"><Icon size={15} /></span>
          <div className={css.content}><button type="button" className={css.eventButton} aria-expanded={open} aria-controls={`timeline-${item.id}`} onClick={() => { setExpanded(open ? expanded.filter(id => id !== item.id) : [...expanded, item.id]) }}>
            <IconChevronRightOutlineRegular size={14} className={open ? css.chevronOpen : css.chevron} /><span className={css.eventBody}><span className={css.tags}><span className={`${css.kind} ${css[item.kind]}`}>{t(item.kind)}</span><code>#{item.id}</code><span className={`${css.state} ${css[item.status]}`}>{t(item.status)}</span>{'priority' in item && <code>{item.priority}</code>}</span><span className={css.title}>{t(item.title)}</span></span><span className={css.source}>{item.source}</span>
          </button><div id={`timeline-${item.id}`} hidden={!open} className={css.details}><p>{t('timelineDetail')}</p><dl><div><dt>{t('timelineNode')}</dt><dd>#{item.id}</dd></div><div><dt>{t('timelineSource')}</dt><dd>{item.source}</dd></div></dl></div></div>
        </li>
      })}</ol>}
      <p className={css.note}>{t('timelineRefreshNote')}</p>
    </div>
  </section>
}

/** Render stored task activity, retaining preview records only outside saved tasks. */
export function TaskTimeline({ t, model, auto = false, onAutoChange, refresh, loading, error }: {
  t: SecurityTranslate
  model?: ActivityModel
  auto?: boolean
  onAutoChange?: (value: boolean) => void
  refresh?: () => void
  loading?: boolean
  error?: boolean
}): ReactNode {
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState<ActivityNode['kind'] | 'all'>('all')
  const [newest, setNewest] = useState(true)
  const [expanded, setExpanded] = useState<string[]>([])
  if (!model) return <PreviewTimeline t={t} />
  const labels = { goal: 'timelineGoal', asset: 'timelineAsset', intent: 'timelineIntent', fact: 'timelineFact', observation: 'explorationObservation', finding: 'timelineFinding', hint: 'timelineHint', review: 'timelineReview', execution: 'timelineExecution', message: 'timelineMessage' } as const
  const sources = { planner: 'timelinePlanner', worker: 'timelineWorker', owner: 'timelineOwner', system: 'timelineSystem' } as const
  const states = { pending: 'pending', recorded: 'timelineRecorded', planning: 'timelinePlanning', ready: 'timelineReady', running: 'running', completed: 'completed', failed: 'failed', cancelled: 'timelineCancelled', interrupted: 'timelineInterrupted', 'needs-input': 'timelineNeedsInput', unverified: 'explorationUnverified', supported: 'explorationSupported', contradicted: 'explorationContradicted' } as const
  const shortId = (id: string): string => id.length > 28 ? `${id.slice(0, 16)}…${id.slice(-6)}` : id
  const displayTitle = (text: string): string => Object.hasOwn(executionMessageKeys, text)
    ? t(executionMessageKeys[text as keyof typeof executionMessageKeys]) : text
  const workerOrder = model.nodes.filter(node => node.payload.recordType === 'worker')
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
  const sourceLabel = (item: ActivityNode): string => {
    const worker = item.source === 'worker' ? workerOrder.findIndex(node => node.sourceId === item.sourceId) : -1
    return `${t(sources[item.source])}${worker >= 0 ? ` #${worker + 1}` : ''}`
  }
  const query = search.trim().toLocaleLowerCase()
  const rows = model.events.filter(item => (kind === 'all' || item.kind === kind) && `${item.title} ${displayTitle(item.title)} ${item.source} ${t(sources[item.source])} ${item.sourceId ?? ''} ${item.nodeId} ${item.id}`.toLocaleLowerCase().includes(query)).sort((a, b) => (newest ? b.at - a.at : a.at - b.at) || a.id.localeCompare(b.id))
  const focus = (id: string): void => {
    const event = model.events.find(value => value.nodeId === id)
    if (!event) return
    setSearch(''); setKind('all'); setExpanded(value => value.includes(event.id) ? value : [...value, event.id])
    requestAnimationFrame(() => { document.getElementById(`activity-${event.id}`)?.scrollIntoView({ block: 'center' }) })
  }
  const relation = (id: string): ReactNode => {
    const node = model.nodes.find(value => value.id === id)
    if (!node) return null
    return model.events.some(value => value.nodeId === id)
      ? <button type="button" className={css.related} onClick={() => { focus(id) }}>{t(labels[node.kind])} · {node.title}</button>
      : <details><summary>{t(labels[node.kind])} · {node.title}</summary>
        <pre className={css.payload}>{JSON.stringify(node.payload, null, 2)}</pre></details>
  }
  return <section className={css.root} aria-label={t('timeline')}>
    <div className={css.toolbar}>
      <Input icon={<IconSearchOutlineRegular size={16} />} className={css.search as string} aria-label={t('timelineSearch')} placeholder={t('timelineSearch')} value={search} onChange={(event) => { setSearch(event.target.value) }} />
      <div className={css.filters} role="group" aria-label={t('timelineCategory')}><button type="button" aria-pressed={kind === 'all'} onClick={() => { setKind('all') }}>{t('timelineAll')}</button>{Object.entries(labels).map(([value, label]) => <button type="button" key={value} aria-pressed={kind === value} onClick={() => { setKind(value as ActivityNode['kind']) }}>{t(label)}</button>)}</div>
      <div className={css.actions}><Button variant="outline" size="sm" onClick={() => { setNewest(!newest) }}>{t(newest ? 'timelineNewest' : 'timelineOldest')}</Button><Button variant="outline" size="sm" aria-pressed={auto} onClick={() => { onAutoChange?.(!auto) }}>{auto ? <IconPauseOutlineRegular size={14} /> : <IconPlayOutlineRegular size={14} />}{t(auto ? 'timelineAuto' : 'timelinePaused')}</Button><Button variant="outline" size="sm" disabled={loading} onClick={refresh}>{t('timelineRefresh')}</Button></div>
    </div>
    {error && <p role="alert" className={css.error}>{t('timelineError')}</p>}
    <div className={css.scroll} aria-busy={loading}>
      {rows.length === 0 && !error && <p className={css.empty}>{t(loading ? 'timelineLoading' : model.events.length === 0 ? 'timelineNoRecords' : 'timelineEmpty')}</p>}
      <ol className={css.events}>{rows.map((item, index) => {
        const date = new Date(item.at)
        const previous = rows[index - 1]
        const open = expanded.includes(item.id)
        const Icon = item.kind === 'intent' || item.kind === 'review' ? IconPlanOutlineRegular : item.kind === 'goal' ? IconCheckCircleOutlineRegular : item.kind === 'execution' ? IconPlayOutlineRegular : item.kind === 'message' ? IconLightOutlineRegular : IconInfoOutlineRegular
        return <li key={item.id} id={`activity-${item.id}`}>
          {(!previous || new Date(previous.at).toDateString() !== date.toDateString())
            && <p className={css.date}>{date.toLocaleDateString()}</p>}
          <div className={css.event}><time className={css.time} dateTime={date.toISOString()}>{date.toLocaleTimeString(undefined, { hour12: false })}<small>{t('timelineElapsed').replace('{days}', String(Math.max(0, Math.floor((Date.now() - item.at) / 86400000))))}</small></time>
            <span className={`${css.marker} ${css[labels[item.kind]]}`} aria-hidden="true"><Icon size={15} /></span>
            <div className={css.content}><button type="button" className={css.eventButton} aria-expanded={open} aria-controls={`activity-details-${item.id}`} onClick={() => { setExpanded(value => open ? value.filter(id => id !== item.id) : [...value, item.id]) }}><IconChevronRightOutlineRegular size={14} className={open ? css.chevronOpen : css.chevron} /><span className={css.eventBody}><span className={css.tags}><span className={`${css.kind} ${css[labels[item.kind]]}`}>{t(labels[item.kind])}</span><code title={item.nodeId}>{shortId(item.nodeId)}</code><span className={`${css.state} ${css[item.status]}`}>{t(states[item.status])}</span></span><span className={css.title}>{displayTitle(item.title)}</span></span><span className={css.source} title={item.sourceId}>{sourceLabel(item)}</span></button>
              {open && <div id={`activity-details-${item.id}`} className={css.details}><p className={css.fullTitle}>{item.title}</p><dl><div><dt>{t('timelineNode')}</dt><dd>{item.nodeId}</dd></div><div><dt>{t('timelineSource')}</dt><dd>{item.source} {item.sourceId}</dd></div><div><dt>{t('timelineTimestamp')}</dt><dd>{date.toLocaleString()}</dd></div></dl>
                {item.assetIds.length > 0 && <p>{t('timelineAssets')}: {item.assetIds.join(', ')}</p>}
                <div className={css.relations}><div><p>{t('timelineUpstream')}</p>{model.edges.filter(edge => edge.target === item.nodeId).map(edge => <div key={edge.id}>{relation(edge.source)}</div>)}</div><div><p>{t('timelineDownstream')}</p>{model.edges.filter(edge => edge.source === item.nodeId).map(edge => <div key={edge.id}>{relation(edge.target)}</div>)}</div></div>
                <details><summary>{t('timelinePayload')}</summary><pre className={css.payload}>{JSON.stringify(item.payload, null, 2)}</pre></details></div>}</div></div>
        </li>
      })}</ol>
    </div>
  </section>
}
