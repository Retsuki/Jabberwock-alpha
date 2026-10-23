import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { SecurityTaskView } from './navigation.ts'
import type { TaskEdit, TaskEditFields } from './records-state.ts'
/** Workspace tasks persisted by the Host, with task-owned conversation details. */
import type { SecurityRecords, SecurityTask } from '../security-records.ts'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { useId, useState, type ReactNode } from 'react'
import {
  Button, Input, Modal, SegmentedTabs,
  IconSearchOutlineRegular, IconSettingsOutlineRegular, IconPlusOutlineRegular,
  IconPlayOutlineRegular, IconPinOutlineRegular,
  IconArchiveOutlineRegular, IconTrashOutlineRegular, IconChevronRightOutlineRegular,
  IconChevronLeftOutlineRegular, IconChevronsUpDownOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SecurityTranslate } from './presentation.tsx'
import css from './TaskList.module.css'
import { TaskDetail } from './TaskDetail.tsx'

type TaskStatus = 'completed' | 'paused' | 'running'
type Category = 'network' | 'web' | 'api'
/** Mounted sample task shared by the list and detail preview. */
export interface PreviewTask {
  id: string
  sample: 'vpn' | 'shop' | 'web' | 'api'
  status: TaskStatus
  category: Category
  progress: string
  findings: [number, number, number, number]
  workers: number
  pinned: boolean
  archived: boolean
}
/** Render saved, unexecuted task drafts with Host-backed creation and list controls.
 * @param props - the security dictionary, saved records and awaited mutation callback.
 * @returns saved task list and creation form; execution controls remain disabled.
 */
export function TaskList({
  t, records, save, disabled, taskEdits, canEdit, editTask, flushTasks, renderSlot, initialTaskId, initialTaskView,
}: {
  initialTaskId?: string | undefined
  initialTaskView?: SecurityTaskView | undefined
  t: SecurityTranslate
  records: SecurityRecords
  disabled: boolean
  save: (content: Pick<SecurityRecords, 'companies' | 'assets' | 'tasks'>) => Promise<boolean>
  taskEdits?: Record<string, TaskEdit> | undefined
  canEdit: boolean
  editTask: (id: string, patch: Partial<TaskEditFields>) => void
  flushTasks: () => Promise<boolean>
} & PropsRenderSlots<'security.task.sessions' | 'security.task.planning' | 'security.task.models' | 'security.task.activity' | 'security.task.findings' | 'security.task.report' | 'security.task.coverage'>): ReactNode {
  const prefix = useId()
  const tasks = records.tasks
  const [archived, setArchived] = useState('current')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')

  const [selected, setSelected] = useState<string[]>([])
  const [descending, setDescending] = useState(false)
  const [sorted, setSorted] = useState(false)
  const [pageSize, setPageSize] = useState(20)
  const [page, setPage] = useState(0)
  const [dialog, setDialog] = useState<string>()
  const [draft, setDraft] = useState('')
  const [createdTaskId, setCreatedTaskId] = useState<string>()
  const [draftAssets, setDraftAssets] = useState<string[]>([])
  const [detailId, setDetailId] = useState<string | undefined>(initialTaskId)
  const description = (task: SecurityTask): string => task.description
  const objective = (task: SecurityTask): string => task.objective
  const query = search.trim().toLocaleLowerCase()
  const filtered = tasks.filter(task => task.archived === (archived === 'archived')
    && (status === 'all' || task.status === status)
    && `${task.id} ${task.name} ${description(task)} ${objective(task)}`.toLocaleLowerCase().includes(query))
  if (sorted) filtered.sort((a, b) => descending ? b.id.localeCompare(a.id) : a.id.localeCompare(b.id))
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / pageSize) - 1))
  const rows = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
  const update = (id: string, patch: Pick<SecurityTask, 'archived'> | Pick<SecurityTask, 'pinned'>): void => {
    if (disabled) return
    void save({ ...records, tasks: tasks.map(task => task.id === id ? { ...task, ...patch, updatedAt: Date.now() } : task) })
  }
  const toggle = (id: string): void => { setSelected(ids => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]) }
  const detailTask = tasks.find(task => task.id === detailId)
  if (detailTask) return <TaskDetail
    initialTab={detailTask.id === initialTaskId ? initialTaskView ?? 'sessions' : undefined} renderSlot={renderSlot} key={detailTask.id} task={detailTask} records={records} t={t} back={() => { setDetailId(undefined) }}
    edit={taskEdits?.[detailTask.id]} editTask={(patch) => { editTask(detailTask.id, patch) }}
    flush={flushTasks} disabled={!canEdit} beginSetup={createdTaskId === detailTask.id} />
  return <section className={css.root} aria-label={t('tasks')}>
    <div className={css.topline}>
      <SegmentedTabs label={t('tasks')} value={archived} onChange={(value) => { setArchived(value); setPage(0) }} items={[
        { value: 'current', label: t('currentTasks'), id: `${prefix}-current`, panelId: `${prefix}-table` },
        { value: 'archived', label: t('archivedTasks'), id: `${prefix}-archived`, panelId: `${prefix}-table` },
      ]} />
      <span className={css.preview}>{t('recordsTaskNotice')}</span>
    </div>
    <div className={css.frame} id={`${prefix}-table`}>
      <div className={css.toolbar}>
        <Input icon={<IconSearchOutlineRegular size={16} />} className={css.search as string} aria-label={t('searchTasks')} placeholder={t('searchTasks')} value={search} onChange={(event) => { setSearch(event.target.value); setPage(0) }} />
        <select className={css.select} aria-label={t('status')} value={status} onChange={(event) => { setStatus(event.target.value); setPage(0) }}>
          <option value="all">{t('allStatuses')}</option>{(['draft'] as const).map(value => <option key={value} value={value}>{t(value)}</option>)}
        </select>
        <span className={css.count}>{filtered.length}/{tasks.filter(task => task.archived === (archived === 'archived')).length}</span>
        <div className={css.toolbarActions}>
          <Button variant="outline" disabled title={t('recordsNotConnected')}><IconSettingsOutlineRegular size={14} />{t('concurrency')}</Button>
          <Button variant="outline" disabled title={t('recordsNotConnected')}>{t('categories')}</Button>
          <Button variant="primary" disabled={disabled} onClick={() => { setDialog(t('addTask')) }}><IconPlusOutlineRegular size={14} />{t('addTask')}</Button>
        </div>
      </div>
      <div className={css.scroll}>
        <table className={css.table}>
          <colgroup>{[3, 11, 8, 12, 13, 12, 8, 11, 6, 16].map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup>
          <thead><tr>
            <th className={css.check}><input type="checkbox" aria-label={t('selectTasks')} checked={rows.length > 0 && rows.every(task => selected.includes(task.id))} onChange={(event) => { setSelected(event.target.checked ? [...new Set([...selected, ...rows.map(task => task.id)])] : selected.filter(id => !rows.some(task => task.id === id))) }} /></th>
            <th><Button variant="ghost" className={css.sort} onClick={() => { setSorted(true); setDescending(!descending) }}>{t('taskId')}<IconChevronsUpDownOutlineRegular size={14} /></Button></th>
            <th>{t('taskName')}</th><th>{t('description')}</th><th>{t('objective')}</th><th>{t('status')}</th><th>{t('progress')}</th><th>{t('vulnerabilityCounts')}</th><th>{t('workers')}</th><th className={css.actionHeading}>{t('actions')}</th>
          </tr></thead>
          <tbody>{rows.map(task => <tr key={task.id}>
            <td><input type="checkbox" aria-label={`${t('selectTasks')}: ${task.id}`} checked={selected.includes(task.id)} onChange={() => { toggle(task.id) }} /></td>
            <td><button className={css.id} onClick={() => { setDetailId(task.id) }}>{task.id}</button></td>
            <td className={css.name}>{task.name}{task.pinned && <IconPinOutlineRegular size={14} className={css.pinned} />}</td>
            <td><span className={css.ellipsis} title={description(task)}>{description(task)}</span></td>
            <td><span className={css.ellipsis} title={objective(task)}>{objective(task)}</span></td>
            <td><span className={`${css.badge} ${css[task.status]}`}>{t(task.status)}</span></td>
            <td className={css.numeric}>0/0</td>
            <td className={css.numeric}>0/0/0/0</td>
            <td className={css.numeric}>0</td>
            <td><div className={css.actions}>
              <Button variant="ghost" size="sm" title={t('viewTask')} aria-label={`${t('viewTask')}: ${task.id}`} onClick={() => { setDetailId(task.id) }}><IconChevronRightOutlineRegular size={16} /></Button>
              <Button variant="ghost" size="sm" disabled title={t('recordsNotConnected')} aria-label={t('recordsNotConnected')}><IconPlayOutlineRegular size={16} /></Button>
              <Button variant="ghost" size="sm" disabled={disabled} aria-label={t('pinTask')} title={t('pinTask')} aria-pressed={task.pinned} onClick={() => { update(task.id, { pinned: !task.pinned }) }}><IconPinOutlineRegular size={16} /></Button>
              <Button variant="ghost" size="sm" disabled={disabled} aria-label={t('archiveTask')} title={t('archiveTask')} onClick={() => { update(task.id, { archived: !task.archived }) }}><IconArchiveOutlineRegular size={16} /></Button>
              <Button variant="outline" size="sm" className={css.delete} aria-label={t('remove')} title={t('remove')} disabled={disabled} onClick={() => { void save({ ...records, tasks: tasks.filter(item => item.id !== task.id) }) }}><IconTrashOutlineRegular size={16} /></Button>
            </div></td>
          </tr>)}</tbody>
        </table>
        {rows.length === 0 && <p className={css.empty}>{t('empty')}</p>}
      </div>
      <footer className={css.footer}>
        <select className={css.select} aria-label={t('perPage')} value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(0) }}>{[20, 50, 100].map(value => <option key={value} value={value}>{value}</option>)}</select>
        <span>{t('perPage')}</span><span>{filtered.length ? currentPage * pageSize + 1 : 0}–{Math.min((currentPage + 1) * pageSize, filtered.length)} / {filtered.length}</span>
        <div className={css.pager}><Button variant="ghost" size="sm" disabled={currentPage === 0} aria-label={t('previousPage')} onClick={() => { setPage(currentPage - 1) }}><IconChevronLeftOutlineRegular size={16} /></Button><Button variant="ghost" size="sm" disabled={(currentPage + 1) * pageSize >= filtered.length} aria-label={t('nextPage')} onClick={() => { setPage(currentPage + 1) }}><IconChevronRightOutlineRegular size={16} /></Button></div>
      </footer>
    </div>
    <Modal open={dialog !== undefined} title={dialog ?? ''} closeLabel={t('close')} onClose={() => { setDialog(undefined) }}>
      <p className={css.modalNote}>{t('setupCreateNotice')}</p>
      <form onSubmit={(event) => {
        event.preventDefault(); if (!draft.trim() || !draftAssets.length || disabled) return
        const now = Date.now()
        const id = randomUUID()
        void save({ ...records, tasks: [...tasks, { id, name: draft.trim(), description: '',
          objective: '', assetIds: draftAssets, status: 'draft', archived: false, pinned: false, createdAt: now, updatedAt: now }] })
          .then((saved) => { if (saved) { setDialog(undefined); setDraft(''); setDraftAssets([]); setCreatedTaskId(id); setDetailId(id) } })
      }}>
        <label className={css.draft}>{t('taskName')}<Input value={draft} onChange={(event) => { setDraft(event.target.value) }} /></label>
        <fieldset className={css.assetChoices}><legend>{t('recordsTaskAssets')}</legend>{records.assets.map(asset => <label key={asset.id} className={css.assetChoice}>
          <input type="checkbox" checked={draftAssets.includes(asset.id)} onChange={(event) => {
            setDraftAssets(event.target.checked ? [...draftAssets, asset.id] : draftAssets.filter(id => id !== asset.id))
          }} />{asset.value}</label>)}{records.assets.length === 0 && <p>{t('recordsNoAssets')}</p>}</fieldset>
        <Button type="submit" variant="primary" disabled={disabled || !draft.trim() || !draftAssets.length}>{t('setupCreate')}</Button>
      </form>
    </Modal>
  </section>
}
