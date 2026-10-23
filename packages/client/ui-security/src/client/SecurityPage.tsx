/** Project, asset, diagnostic, finding and agent screens using the shared application controls. */
import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Input, SegmentedTabs } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { RecordsFace } from './records-state.ts'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SecurityFace } from './state.ts'
import type { SecurityNavigation, SecuritySelection, SecurityView } from './navigation.ts'
import { FindingDetail, FindingsTable, Status } from './presentation.tsx'
import { TaskList } from './TaskList.tsx'
import { ProjectAssets } from './ProjectAssets.tsx'
import css from './SecurityPage.module.css'

type Props = PropsRuntime<'main'> & PropsRenderSlots<'security.task.sessions' | 'security.task.planning' | 'security.task.models' | 'security.task.activity' | 'security.task.findings' | 'security.task.report' | 'security.task.coverage' | 'security.supply-chain'> & PropsLocale<'security'> & InjectFace<SecurityFace & RecordsFace & SecurityNavigation>
type View = SecurityView

/** Render the selected workspace's security section.
 * @param props - localized subscriptions and scoped draft actions.
 * @returns the selected security workspace or an empty state.
 */
export function SecurityPage(props: Props): ReactNode {
  const selection = props.useSecuritySelection(value => value)
  const workspace = props.useWorkspaces(value => value.items.find(item => item.workspaceId === selection?.workspaceId))
  if (!selection || !workspace) return <main className={css.page}><p className={css.empty}>{props.t('empty')}</p></main>
  return <WorkspaceSecurityPage key={`${selection.workspaceId}:${selection.view}:${selection.taskId ?? ''}:${selection.taskView ?? ''}`} {...props} selection={selection} title={workspace.title} />
}

/** Left-aligned underline tabs matching the conversation header tab strip; same keyboard model as `SegmentedTabs`. */
function TopTabs<Value extends string>({ items, value, onChange, label, panelId }: {
  items: readonly { value: Value; label: string; id: string }[]
  value: Value
  onChange: (value: Value) => void
  label: string
  panelId: string
}): ReactNode {
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const last = items.length - 1
    const next = event.key === 'ArrowLeft' ? (index + last) % items.length
      : event.key === 'ArrowRight' ? (index + 1) % items.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? last : undefined
    const item = next === undefined ? undefined : items[next]
    if (next === undefined || !item) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]').item(next).focus()
    onChange(item.value)
  }
  return <div role="tablist" aria-label={label} className={css.tabs}>
    {items.map((item, index) => <button key={item.value} id={item.id} type="button" role="tab" aria-selected={value === item.value} aria-controls={panelId}
      tabIndex={value === item.value ? 0 : -1} className={value === item.value ? `${css.tab} ${css.tabActive}` : css.tab}
      onClick={() => { onChange(item.value) }} onKeyDown={(event) => { onKeyDown(event, index) }}>{item.label}</button>)}
  </div>
}

function WorkspaceSecurityPage({
  t, useSecurity, useSecurityRecords, loadSecurityRecords, saveSecurityRecords,
  editSecurityTask, flushSecurityTasks, selection, title, openSecurity, renderSlot,
}: Props & { selection: SecuritySelection; title: string }): ReactNode {
  const state = useSecurity(value => value)
  const entry = useSecurityRecords(value => value[selection.workspaceId])
  const durable = selection.view === 'assets' || selection.view === 'tasks' || selection.view === 'supply-chain'
  useEffect(() => { if (durable) void loadSecurityRecords(selection.workspaceId) }, [durable, selection.workspaceId, loadSecurityRecords])
  const save = (content: Parameters<RecordsFace['saveSecurityRecords']>[1]): Promise<boolean> =>
    saveSecurityRecords(selection.workspaceId, content)
  const unavailable = !entry?.records || entry.loading || entry.saving || Boolean(entry.error) || Object.keys(entry.edits ?? {}).length > 0
  const projectId = selection.projectId
  const view = selection.view
  const topView = view === 'assets' || view === 'tasks' ? view : 'supply-chain'
  const [detail, setDetail] = useState<string | undefined>()
  const [search, setSearch] = useState('')
  const prefix = useId()
  const project = { id: projectId, name: title }
  const data = state.data[project.id]
  const changeView = (next: View): void => { openSecurity(selection.workspaceId, title, next) }
  const includes = (value: string): boolean => value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  const findingList = data?.tickets.flatMap(ticket => ticket.result?.findings ?? []) ?? []
  const finding = view === 'findings' ? findingList.find(item => item.id === detail) : undefined

  return <main className={css.page}>
    <header className={css.header} data-window-drag>
      <div className={css.titleRow}><h1 className={css.title}>{project.name}</h1></div>
      <TopTabs label={t('title')} value={topView} onChange={changeView} items={[
        { value: 'assets', label: t('assets'), id: `${prefix}-assets-top` },
        { value: 'tasks', label: t('tasks'), id: `${prefix}-tasks-top` },
        { value: 'supply-chain', label: t('supplyChainTitle'), id: `${prefix}-supply-chain-top` },
      ]} panelId={`${prefix}-content`} />
    </header>
    {!durable && <div role="note" className={css.notice}>{t('demo')}</div>}
    {!durable && state.storageError && <p role="alert" className={css.notice}>{t(state.storageError === 'read' ? 'readError' : 'writeError')}</p>}
    {durable && entry?.error && <div role="alert" className={css.notice}>
      {t(entry.error === 'write' ? 'recordsWriteError' : 'recordsReadError')}
      <Button variant="outline" onClick={() => { void loadSecurityRecords(selection.workspaceId) }}>{t('recordsReload')}</Button>
    </div>}
    <div id={`${prefix}-content`} role="tabpanel" aria-labelledby={`${prefix}-${topView}-top`} className={`${css.body} ${view === 'tasks' || view === 'assets' || view === 'supply-chain' ? css.taskBody : ''}`}>
      {view === 'supply-chain' ? renderSlot('security.supply-chain', { workspaceId: selection.workspaceId }) : view === 'tasks' ? (entry?.records && <TaskList initialTaskId={selection.taskId} initialTaskView={selection.taskView} renderSlot={renderSlot} t={t} records={entry.records} save={save} disabled={unavailable}
        taskEdits={entry.edits} canEdit={!entry.loading && !entry.error}
        editTask={(id, patch) => { editSecurityTask(selection.workspaceId, id, patch) }}
        flushTasks={() => flushSecurityTasks(selection.workspaceId)} />) : view === 'assets' ? (entry?.records && <ProjectAssets t={t} records={entry.records} save={save} reload={() => { void loadSecurityRecords(selection.workspaceId) }} disabled={unavailable} />) : !data ? <p className={css.empty}>{t('empty')}</p> : <section className={css.stack}>
        <SegmentedTabs<View> label={t('title')} value={view} onChange={changeView} items={[
          { value: 'assets', label: t('assets'), id: `${prefix}-assets`, panelId: `${prefix}-panel` },
          { value: 'tasks', label: t('tasks'), id: `${prefix}-tasks`, panelId: `${prefix}-panel` },
          { value: 'findings', label: t('findings'), id: `${prefix}-findings`, panelId: `${prefix}-panel` },
          { value: 'agents', label: t('agents'), id: `${prefix}-agents`, panelId: `${prefix}-panel` },
        ]} />
        <section id={`${prefix}-panel`} role="tabpanel" aria-labelledby={`${prefix}-${view}`} className={css.stack}>
          {!detail && <div className={css.toolbar}><Input className={css.searchInput as string} aria-label={t('search')} placeholder={t('search')} value={search} onChange={(event) => { setSearch(event.target.value) }} />
          </div>}
          {view === 'findings' && (finding ? <FindingDetail finding={finding} back={() => { setDetail(undefined) }} t={t} /> : <FindingsTable findings={findingList.filter(item => includes(`${item.title} ${item.target}`))} open={setDetail} t={t} />)}
          {view === 'agents' && <div className={css.projects}>{data.agents.filter(item => includes(`${item.name} ${item.activity}`)).map(agent => <article className={css.card} key={agent.id}>
            <div className={css.toolbar}><h3>{agent.name}</h3><Status value={agent.status} t={t} /></div><p>{agent.activity}</p><h4>{t('investigations')}</h4>
            <ul>{agent.taskIds.map(id => <li key={id}>{data.tickets.find(item => item.id === id)?.title ?? id}</li>)}</ul>
          </article>)}{!data.agents.some(item => includes(`${item.name} ${item.activity}`)) && <p className={css.empty}>{t('empty')}</p>}</div>}
        </section>
      </section>}
    </div>
  </main>
}
