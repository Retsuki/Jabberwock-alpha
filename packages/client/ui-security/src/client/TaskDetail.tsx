import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { SecurityTaskView } from './navigation.ts'
import type { TaskEdit, TaskEditFields } from './records-state.ts'
/** Task detail combines saved editable drafts and isolated preview examples. */
import { useId, useState, type ReactNode } from 'react'
import { Button, Input, IconChevronLeftOutlineRegular, IconPlusOutlineRegular, IconTrashOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SecurityRecords, SecurityTask } from '../security-records.ts'
import type { PreviewTask } from './TaskList.tsx'
import type { SecurityTranslate } from './presentation.tsx'
import css from './TaskDetail.module.css'
import { TaskPolicyFields } from './TaskPolicyFields.tsx'
import { TaskSessions } from './TaskSessions.tsx'
import { TaskExploration } from './TaskExploration.tsx'
import { TaskTimeline } from './TaskTimeline.tsx'
import { TaskFindings } from './TaskFindings.tsx'
import { TaskRetests } from './TaskRetests.tsx'
import { TaskAssets } from './TaskAssets.tsx'
import { TaskCoverage } from './TaskCoverage.tsx'
import { TaskApprovals } from './TaskApprovals.tsx'
import { TaskReport } from './TaskReport.tsx'

/** Render saved task details or a sample-only preview.
 * @param props - selected task, dictionary, saved draft actions and session renderer.
 * @returns fixed task header, internally scrolling tabs and editable overview cards.
 */
export function TaskDetail({ task, t, back, records, edit, editTask, flush, disabled, renderSlot, beginSetup, initialTab }: {
  task: PreviewTask | SecurityTask
  t: SecurityTranslate
  back: () => void
  records?: SecurityRecords | undefined
  edit?: TaskEdit | undefined
  editTask: (patch: Partial<TaskEditFields>) => void
  flush: () => Promise<boolean>
  disabled: boolean
  beginSetup?: boolean | undefined
  initialTab?: SecurityTaskView | undefined
} & PropsRenderSlots<'security.task.sessions' | 'security.task.planning' | 'security.task.models' | 'security.task.activity' | 'security.task.findings' | 'security.task.report' | 'security.task.coverage'>): ReactNode {
  if (!('sample' in task)) return <DraftTaskDetail renderSlot={renderSlot} task={task} t={t} back={back} records={records} edit={edit} editTask={editTask} flush={flush} disabled={disabled} beginSetup={beginSetup} initialTab={initialTab} />
  return <PreviewTaskDetail task={task} t={t} back={back} />
}

function PreviewTaskDetail({ task, t, back }: { task: PreviewTask; t: SecurityTranslate; back: () => void }): ReactNode {
  const prefix = useId()
  const [activeTab, setActiveTab] = useState<'overview' | 'conversation' | 'exploration' | 'timeline' | 'findings' | 'retests' | 'assets' | 'coverage' | 'approvals' | 'report'>('overview')
  const [goal, setGoal] = useState('')
  const [goals, setGoals] = useState<string[]>([])
  const [constraint, setConstraint] = useState('')
  const [constraintKind, setConstraintKind] = useState('deny')
  const [constraints, setConstraints] = useState<string[]>([])
  const [asset, setAsset] = useState('')
  const [assetKind, setAssetKind] = useState('domain')
  const [assetAction, setAssetAction] = useState('deny')
  const [rules, setRules] = useState<string[]>([])
  const [scopeInput, setScopeInput] = useState('')
  const [scopeKind, setScopeKind] = useState('domain')
  const [scopes, setScopes] = useState<string[]>([])
  const title = t(`${task.sample}Description`)
  const objective = t(`${task.sample}Objective`)
  const tabs = ['conversation', 'overview', 'exploration', 'timeline', 'findings', 'retests', 'assets', 'coverage', 'approvals', 'report'] as const
  const entries = (items: string[], remove: (value: string) => void): ReactNode => <ul className={css.entries}>{items.map(value => <li key={value}><span>{value}</span><Button variant="ghost" size="sm" aria-label={`${t('remove')}: ${value}`} onClick={() => { remove(value) }}><IconTrashOutlineRegular size={14} /></Button></li>)}</ul>
  return <section className={css.root} aria-label={t('taskOverview')}>
    <header className={css.header}>
      <div className={css.heading}><Button variant="ghost" size="sm" aria-label={t('back')} onClick={back}><IconChevronLeftOutlineRegular size={18} /></Button><h2>{title}</h2><div className={css.meta}><code>{task.id}</code><span className={`${css.status} ${css[task.status]}`}>{t(task.status)}</span></div></div>
      <p className={css.subtitle}>{objective}</p>
      <nav className={css.tabs} aria-label={t('viewTask')}>{tabs.map(tab => <button type="button" key={tab} className={tab === activeTab ? css.active : undefined} aria-current={tab === activeTab ? 'page' : undefined} onClick={() => { setActiveTab(tab) }} title={t(tab)}>{t(tab)}</button>)}</nav>
      <p className={css.preview}>{t('previewLabel')}</p>
    </header>
    <div hidden={activeTab !== 'overview'} className={css.overview}><div className={css.cards}>
      <article className={css.card}><h3>{t('descriptionAndObjective')}</h3><div className={css.columns}><div><span className={css.label}>{t('description')}</span><p>{title}</p></div><div><span className={css.label}>{t('objective')}</span><p>{objective}</p></div></div></article>
      <article className={css.card}><div className={css.sectionHeading}><h3>{t('goalManagement')}</h3><span>{t('goalsHint')}</span></div>
        <form className={css.form} onSubmit={(event) => { event.preventDefault(); if (goal.trim() && !goals.includes(goal.trim())) { setGoals([...goals, goal.trim()]); setGoal('') } }}><Input aria-label={t('addGoal')} placeholder={t('addGoal')} value={goal} onChange={(event) => { setGoal(event.target.value) }} className={css.grow as string} /><Button type="submit" variant="outline" disabled={!goal.trim()}><IconPlusOutlineRegular size={14} />{t('add')}</Button></form>
        {goals.length ? entries(goals, (value) => { setGoals(goals.filter(item => item !== value)) }) : <p className={css.hint}>{t('noGoals')}</p>}
      </article>
      <article className={css.card}><div className={css.sectionHeading}><h3>{t('constraints')}</h3><span>{t('constraintsHint')}</span></div>
        <form className={css.form} onSubmit={(event) => { event.preventDefault(); const value = `${t(constraintKind === 'allow' ? 'allow' : 'deny')}: ${constraint.trim()}`; if (constraint.trim() && !constraints.includes(value)) { setConstraints([...constraints, value]); setConstraint('') } }}><select className={css.select} aria-label={t('constraintAction')} value={constraintKind} onChange={(event) => { setConstraintKind(event.target.value) }}><option value="deny">{t('deny')}</option><option value="allow">{t('allow')}</option></select><Input aria-label={t('constraintInput')} placeholder={t('constraintInput')} value={constraint} onChange={(event) => { setConstraint(event.target.value) }} className={css.grow as string} /><Button type="submit" variant="outline" disabled={!constraint.trim()}><IconPlusOutlineRegular size={14} />{t('add')}</Button></form>
        {constraints.length ? entries(constraints, (value) => { setConstraints(constraints.filter(item => item !== value)) }) : <p className={css.hint}>{t('noConstraints')}</p>}
      </article>
      <article className={css.card}><div className={css.sectionHeading}><h3>{t('assetRules')}</h3><span>{t('assetRulesHint')}</span></div>
        <form className={css.form} onSubmit={(event) => { event.preventDefault(); const value = `${t(assetAction === 'allow' ? 'allow' : 'deny')} · ${t(assetKind === 'ip' ? 'ip' : 'domain')}: ${asset.trim()}`; if (asset.trim() && !rules.includes(value)) { setRules([...rules, value]); setAsset('') } }}><select className={css.select} aria-label={t('assetRuleAction')} value={assetAction} onChange={(event) => { setAssetAction(event.target.value) }}><option value="deny">{t('deny')}</option><option value="allow">{t('allow')}</option></select><select className={css.select} aria-label={t('kind')} value={assetKind} onChange={(event) => { setAssetKind(event.target.value) }}><option value="domain">{t('domain')}</option><option value="ip">{t('ip')}</option></select><Input aria-label={t('assetRuleInput')} placeholder={t('assetRuleInput')} value={asset} onChange={(event) => { setAsset(event.target.value) }} className={css.grow as string} /><Button type="submit" variant="outline" disabled={!asset.trim()}><IconPlusOutlineRegular size={14} />{t('add')}</Button></form>
        {rules.length ? entries(rules, (value) => { setRules(rules.filter(item => item !== value)) }) : <p className={css.hint}>{t('noAssetRules')}</p>}
      </article>
      <article className={css.card}><div className={css.sectionHeading}><h3 id={`${prefix}-coverage`}>{t('assetCoverage')}</h3><span>{t('coverageSample')}</span></div><div className={css.coverage}><strong>42%</strong><span>{t('coverageCounts')}</span></div><div role="progressbar" aria-labelledby={`${prefix}-coverage`} aria-valuenow={42} aria-valuemin={0} aria-valuemax={100} className={css.track}><span /></div><div className={css.badges}>{(['subdomain', 'service', 'endpoint', 'ip'] as const).map((kind, index) => <span key={kind}>{t(kind)} <b>{['4/6', '4/9', '2/8', '1/3'][index]}</b></span>)}</div></article>
      <article className={css.card}><div className={css.sectionHeading}><h3>{t('tokenSummary')}</h3><span>{t('coverageSample')}</span></div>
        <div className={css.tokenMetrics}>{([['inputTokens', '1.6M'], ['outputTokens', '110k'], ['cacheTokens', '1.1M'], ['cacheHitRate', '71%'], ['modelCalls', '60']] as const).map(([label, value]) => <div key={label}><span>{t(label)}</span><strong>{value}</strong></div>)}</div>
        <div className={css.tableScroll}><table className={css.modelTable}><thead><tr><th>{t('model')}</th><th>{t('modelCalls')}</th><th>{t('inputTokens')}</th><th>{t('outputTokens')}</th><th>{t('cacheTokens')}</th><th>{t('cacheHitRate')}</th></tr></thead><tbody><tr><td>claude-opus-4-6</td><td>42</td><td>1.3M</td><td>86k</td><td>940k</td><td className={css.hitRate}>75%</td></tr><tr><td>claude-haiku-4-5</td><td>18</td><td>320k</td><td>24k</td><td>180k</td><td className={css.hitRate}>56%</td></tr></tbody></table></div>
      </article>
      <article className={css.card}><div className={css.sectionHeading}><h3>{t('testScope')}</h3><span>{t('scopeHint')}</span></div><form className={css.form} onSubmit={(event) => { event.preventDefault(); const value = `${t(scopeKind === 'ip' ? 'ip' : 'domain')}: ${scopeInput.trim()}`; if (scopeInput.trim() && !scopes.includes(value)) { setScopes([...scopes, value]); setScopeInput('') } }}><select className={css.select} aria-label={t('scopeKind')} value={scopeKind} onChange={(event) => { setScopeKind(event.target.value) }}><option value="domain">{t('domain')}</option><option value="ip">{t('ip')}</option></select><Input className={css.grow as string} aria-label={t('scopeInput')} placeholder={t('scopeInput')} value={scopeInput} onChange={(event) => { setScopeInput(event.target.value) }} /><Button type="submit" variant="outline" disabled={!scopeInput.trim()}><IconPlusOutlineRegular size={14} />{t('add')}</Button></form>{scopes.length ? entries(scopes, (value) => { setScopes(scopes.filter(item => item !== value)) }) : <p className={css.hint}>{t('noScope')}</p>}</article>
      <article className={css.card}><div className={css.sectionHeading}><h3>{t('heartbeat')}</h3><span>{t('coverageSample')}</span></div><dl className={css.heartbeat}>{([['engineState', t('idle')], ['workerCount', '3'], ['recentActivity', '07:11:00'], ['goalCompletion', '3/3'], ['completedAt', '2026-07-28 07:11:00']] as const).map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{value}</dd></div>)}</dl></article>
      <div className={css.threeColumns}>
        <article className={css.card}><h3>{t('activeInvestigations')}</h3><ul className={css.investigations}>{(['investigationOne', 'investigationTwo', 'investigationThree'] as const).map((key, index) => <li key={key}><span className={css.workerId}>#{index + 1}</span><p>{t(key)}</p><span className={css.investigationState}>{t('doing')}</span></li>)}</ul></article>
        <article className={css.card}><h3>{t('attentionStats')}</h3><dl className={css.stats}>{([['confirmedFindings', '0'], ['activeInvestigations', '3'], ['pendingIntents', '0'], ['blockedIntents', '0']] as const).map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{value}</dd></div>)}</dl></article>
        <article className={css.card}><h3>{t('recentFindings')}</h3><div className={css.emptyFindings}><span className={css.emptyMarker} aria-hidden="true" /><p>{t('noRecentFindings')}</p></div></article>
      </div>
      <div className={css.threeColumns}>{([['pendingIntents', '0'], ['confirmedFindings', '0'], ['totalIntents', '14']] as const).map(([label, value]) => <article key={label} className={`${css.card} ${css.smallMetric}`}><span>{t(label)}</span><strong>{value}</strong><span className={css.hint}>{t('coverageSample')}</span></article>)}</div>
    </div></div>
    <div hidden={activeTab !== 'conversation'} className={css.sessions}><TaskSessions t={t} /></div>
    <div hidden={activeTab !== 'exploration'} className={css.sessions}><TaskExploration t={t} /></div>
    <div hidden={activeTab !== 'timeline'} className={css.sessions}><TaskTimeline t={t} /></div>
    <div hidden={activeTab !== 'findings'} className={css.sessions}><TaskFindings t={t} sample={task.sample === 'web' || task.sample === 'api'} /></div>
    <div hidden={activeTab !== 'retests'} className={css.sessions}><TaskRetests t={t} sample={task.sample === 'web' || task.sample === 'api'} /></div>
    <div hidden={activeTab !== 'assets'} className={css.sessions}><TaskAssets t={t} /></div>
    <div hidden={activeTab !== 'coverage'} className={css.sessions}><TaskCoverage t={t} /></div>
    <div hidden={activeTab !== 'approvals'} className={css.sessions}><TaskApprovals t={t} /></div>
    <div hidden={activeTab !== 'report'} className={css.sessions}><TaskReport t={t} /></div>
  </section>
}

function DraftTaskDetail({ task, t, back, records, edit, editTask, flush, disabled, renderSlot, beginSetup, initialTab }: {
  task: SecurityTask
  t: SecurityTranslate
  back: () => void
  records?: SecurityRecords | undefined
  edit?: TaskEdit | undefined
  editTask: (patch: Partial<TaskEditFields>) => void
  flush: () => Promise<boolean>
  disabled: boolean
  beginSetup?: boolean | undefined
  initialTab?: SecurityTaskView | undefined
} & PropsRenderSlots<'security.task.sessions' | 'security.task.planning' | 'security.task.models' | 'security.task.activity' | 'security.task.findings' | 'security.task.report' | 'security.task.coverage'>): ReactNode {
  const tabs = ['conversation', 'overview', 'exploration', 'timeline', 'findings', 'retests', 'assets', 'coverage', 'approvals', 'report'] as const
  const [tab, setTab] = useState<typeof tabs[number]>(initialTab === 'sessions' || beginSetup ? 'conversation' : initialTab ?? 'overview')
  const [initialWorkerId, setInitialWorkerId] = useState<string>()
  const value = { ...task, ...edit?.patch }
  const stateKey = !edit ? 'taskAutoSaved' : edit.state === 'invalid' ? 'taskAutoInvalid'
    : edit.state === 'failed' ? 'taskAutoFailed' : edit.state === 'saving' ? 'taskAutoSaving' : 'taskAutoPending'
  return <section className={css.root} aria-label={t('taskOverview')}>
    <header className={css.header}><div className={css.heading}><Button variant="ghost" size="sm"
      onClick={() => { void flush().then((saved) => { if (saved) back() }) }} aria-label={t('back')}>
      <IconChevronLeftOutlineRegular size={18} /></Button><h2>{value.name || t('taskName')}</h2>
    <div className={css.meta}><code>{task.id}</code><span>{t('draft')}</span></div></div>
    <p className={css.subtitle}>{value.objective}</p><nav className={css.tabs} aria-label={t('viewTask')}>
      {tabs.map(tabValue => <button key={tabValue} type="button" className={tab === tabValue ? css.active : undefined}
        aria-current={tab === tabValue ? 'page' : undefined} onClick={() => { void flush(); setTab(tabValue) }}>{t(tabValue)}</button>)}</nav>
    <p className={css.preview}>{t('recordsTaskNotice')}</p>
    <div className={css.autosave} role={edit?.state === 'failed' || edit?.state === 'invalid' ? 'alert' : 'status'}>
      {t(stateKey)}{edit?.state === 'failed' && <Button variant="outline" size="sm" disabled={disabled}
        onClick={() => { void flush() }}>{t('taskAutoRetry')}</Button>}
    </div>
    </header>{tab === 'conversation' && records ? <div className={css.sessions}>{renderSlot('security.task.sessions', { workspaceId: records.workspaceId, taskId: task.id, beginSetup, initialWorkerId, openOverview: () => { void flush(); setTab('overview') } })}</div> : (tab === 'timeline' || tab === 'exploration') && records ? <div className={css.sessions}>{renderSlot('security.task.activity', { workspaceId: records.workspaceId, taskId: task.id, task, assets: records.assets, view: tab })}</div> : (tab === 'findings' || tab === 'retests') && records ? <div className={css.sessions}>{renderSlot('security.task.findings', { workspaceId: records.workspaceId, taskId: task.id, assets: records.assets, view: tab })}</div> : tab === 'coverage' && records ? <div className={css.sessions}>{renderSlot('security.task.coverage', { workspaceId: records.workspaceId, taskId: task.id, openWorker: (runId) => { setInitialWorkerId(runId); setTab('conversation') } })}</div> : tab === 'report' && records ? <div className={css.sessions}>{renderSlot('security.task.report', { workspaceId: records.workspaceId, taskId: task.id, task, assets: records.assets })}</div> : <div className={css.overview}><div className={css.cards}>
      {tab === 'overview' && <article className={css.card} onBlur={() => { void flush() }}>
        <h3>{t('descriptionAndObjective')}</h3><div className={css.editFields}>
          <label>{t('taskName')}<Input aria-label={t('taskName')} value={value.name} disabled={disabled}
            onChange={(event) => { editTask({ name: event.target.value }) }} /></label>
          <label>{t('description')}<textarea aria-label={t('description')} value={value.description} disabled={disabled}
            onChange={(event) => { editTask({ description: event.target.value }) }} rows={3} /></label>
          <label>{t('objective')}<textarea aria-label={t('objective')} value={value.objective} disabled={disabled}
            onChange={(event) => { editTask({ objective: event.target.value }) }} rows={3} /></label>
        </div>
      </article>}
      {tab === 'overview' && records && <article className={css.card}>{renderSlot('security.task.models', { workspaceId: records.workspaceId, taskId: task.id })}</article>}
      {tab === 'overview' && value.setup && <article className={css.card}>
        <h3>{t('setupSavedSettings')}</h3><div className={css.columns}>
          <div><span className={css.label}>{t('setupCompletion')}</span><p>{value.setup.completionCondition || t('setupUnconfirmed')}</p></div>
          <div><span className={css.label}>{t('checklistLimits')}</span><p>{value.setup.limits || t('setupUnconfirmed')}</p></div>
        </div><p className={css.hint}>{t('setupEditInChat')}</p>
      </article>}
      {tab === 'overview' && records && <article className={css.card}>{renderSlot('security.task.planning', { workspaceId: records.workspaceId, taskId: task.id })}</article>}
      {tab === 'overview' && <TaskPolicyFields task={value} t={t} editTask={editTask} flush={flush} disabled={disabled} />}
      {(tab === 'overview' || tab === 'assets') ? <article className={css.card} onBlur={() => { void flush() }}>
        <h3>{t('recordsTaskAssets')}</h3>{records?.assets.length ? <div className={css.assetChoices}>
          {records.assets.map(asset => <label key={asset.id}><input type="checkbox" aria-label={asset.value}
            checked={value.assetIds.includes(asset.id)} disabled={disabled} onChange={(event) => {
              editTask({ assetIds: event.target.checked ? [...value.assetIds, asset.id] : value.assetIds.filter(id => id !== asset.id) })
            }} />{asset.value}</label>)}
        </div> : <p>{t('recordsNoAssets')}</p>}
      </article> : <article className={css.card}><h3>{t(tab)}</h3><p>{t('recordsNoResults')}</p></article>}
    </div></div>}
  </section>
}
