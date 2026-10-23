/** Read-only diagnostic subviews preserve the prototype's evidence and workflow information. */
import { useId, useState, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { DiagnosticTask } from './model/diagnostics/types.ts'
import type { ProjectData } from './model/types.ts'
import { buildReport, getDiagnosticFindings, getDiagnosticTargets, getDiagnosticTickets } from './model/diagnostics/selectors.ts'
import { FindingDetail, FindingsTable, Status, type SecurityTranslate } from './presentation.tsx'
import css from './SecurityPage.module.css'

type Tab = 'overview' | 'conversation' | 'exploration' | 'timeline' | 'findings' | 'retests' | 'assets' | 'coverage' | 'approvals' | 'report'
const TAB_KEYS: Tab[] = ['overview', 'conversation', 'exploration', 'timeline', 'findings', 'retests', 'assets', 'coverage', 'approvals', 'report']

/**
 * Render diagnostic evidence in the original ten information sections.
 * @param props - selected task, its project data and list navigation.
 * @returns a local preview; no execution, approval or communication APIs are invoked.
 */
export function DiagnosticDetail({ data, task, back, t }: {
  data: ProjectData
  task: DiagnosticTask
  back: () => void
  t: SecurityTranslate
}): ReactNode {
  const [tab, setTab] = useState<Tab>('overview')
  const [findingId, setFindingId] = useState<string>()
  const id = useId()
  const findings = getDiagnosticFindings(data, task)
  const targets = getDiagnosticTargets(data, task)
  const tickets = getDiagnosticTickets(data, task)
  const finding = findings.find(item => item.id === findingId)
  const empty = <p className={css.empty}>{t('empty')}</p>
  return <section className={css.stack}>
    <div><Button onClick={back}>{t('back')}</Button><h2>{task.name}</h2><div className={css.toolbar}><Status value={task.status} t={t} /><span>{task.createdAt}</span></div></div>
    <nav aria-label={t('tasks')} className={css.tabbar}>{TAB_KEYS.map(key => <Button key={key} variant={tab === key ? 'outline' : 'ghost'} aria-current={tab === key ? 'page' : undefined} aria-controls={`${id}-content`} onClick={() => { setTab(key); setFindingId(undefined) }}>{t(key)}</Button>)}</nav>
    <div id={`${id}-content`} className={css.stack}>
      {tab === 'overview' && <>
        <article className={css.card}><h3>{t('objective')}</h3><p>{task.objective || t('empty')}</p><p>{task.description}</p></article>
        <div className={css.cards}>
          <article className={css.card}><h3>{t('assets')}</h3><strong className={css.metric}>{targets.length}</strong></article>
          <article className={css.card}><h3>{t('investigations')}</h3><strong className={css.metric}>{tickets.length}</strong></article>
          <article className={css.card}><h3>{t('findings')}</h3><strong className={css.metric}>{findings.length}</strong></article></div>
        <article className={css.card}><h3>{t('goals')}</h3>{task.goals.map(goal => <div className={css.row} key={goal.id}><span>{goal.text}</span><Status value={goal.status} t={t} /></div>)}{!task.goals.length && empty}</article>
        <article className={css.card}><h3>{t('constraints')}</h3>{task.constraints.map(constraint => <div className={css.row} key={constraint.id}><Status value={constraint.kind} t={t} /><span>{constraint.text}</span></div>)}{task.assetRules.map(rule => <p key={rule.id}>{rule.action} · {rule.pattern} · {rule.note}</p>)}{!task.constraints.length && !task.assetRules.length && empty}</article>
        <article className={css.card}><h3>{t('usage')}</h3>{task.usage.map(usage => <p className={css.mono} key={usage.model}>{usage.model} · {usage.calls} · {usage.inputTokens} / {usage.outputTokens} / {usage.cacheTokens}</p>)}{!task.usage.length && empty}</article>
      </>}
      {tab === 'conversation' && <><p className={css.muted}>{t('notConnected')}</p>{task.sessions.map(session => <details className={css.card} key={session.id} open={session.kind === 'main'}>
        <summary>{session.title} · {t(session.kind)}</summary>{session.status && <Status value={session.status} t={t} />}
        {session.messages.map(message => <article className={css.message} key={message.id}>
          <div className={css.toolbar}><TagRole role={message.role} />
            <time>{message.at}</time></div>
          <p>{message.text}</p>
          {message.tool && <pre className={css.pre}>{message.tool.name}{'\n'}{message.tool.args}{'\n'}{message.tool.result ?? message.tool.error}</pre>}</article>)}
      </details>)}{!task.sessions.length && empty}</>}
      {tab === 'exploration' && <>
        <article className={css.card}><h3>{t('planner')}</h3>{task.planner.rounds.map(round => <details key={round.id}><summary>{round.round} · {round.summary}</summary><time>{round.at}</time><ul>{round.decisions.map(decision => <li key={decision}>{decision}</li>)}</ul></details>)}{!task.planner.rounds.length && empty}</article>
        <article className={css.card}><h3>{t('investigations')}</h3>{tickets.map(ticket => <details className={css.message} key={ticket.id}><summary>{ticket.id} · {ticket.title}</summary><Status value={ticket.status} t={t} /><p>{ticket.description}</p><p>{ticket.targets.join(', ')}</p><Status value={ticket.priority} t={t} /><p>{ticket.category}</p></details>)}{!tickets.length && empty}</article>
        <article className={css.card}><h3>{t('facts')}</h3>{task.facts.map(fact => <div className={css.message} key={fact.id}><p>{fact.text}</p><p className={css.muted}>{fact.ticketId} · {fact.assetValue} · {fact.at}</p>{fact.evidence && <pre className={css.pre}>{fact.evidence}</pre>}</div>)}{!task.facts.length && empty}</article>
      </>}
      {tab === 'timeline' && <>{task.events.map(event => <article className={css.card} key={event.id}><div className={css.toolbar}><time>{event.at}</time><span className={css.muted}>{event.source} · {event.kind}</span></div><h3>{event.text}</h3>{event.status && <Status value={event.status} t={t} />}<p>{event.detail}</p>{Object.entries(event.refs ?? {}).map(([key, value]) => <span className={css.mono} key={key}>{key}: {value} </span>)}</article>)}{!task.events.length && empty}</>}
      {tab === 'findings' && (finding ? <FindingDetail finding={finding} back={() => { setFindingId(undefined) }} t={t} /> : <FindingsTable findings={findings} open={setFindingId} t={t} />)}
      {tab === 'retests' && <>{task.retests.map(retest => <article className={css.card} key={retest.id}><h3>{findings.find(item => item.id === retest.findingId)?.title ?? retest.findingId}</h3><div className={css.toolbar}><Status value={retest.status} t={t} />{retest.result && <Status value={retest.result} t={t} />}<time>{retest.startedAt}</time></div><p>{retest.fixVersion} {retest.note}</p><p>{retest.evidenceSummary}</p><pre className={css.pre}>{retest.log.join('\n')}</pre></article>)}{!task.retests.length && empty}</>}
      {tab === 'assets' && <div className={css.tableWrap}><table className={css.table}><thead><tr><th>{t('target')}</th><th>{t('kind')}</th><th>{t('status')}</th></tr></thead><tbody>{targets.map(target => <tr key={target.id}><td>{target.value}</td><td><Status value={target.kind} t={t} /></td><td><Status value={target.status} t={t} /></td></tr>)}</tbody></table>{!targets.length && empty}</div>}
      {tab === 'coverage' && <p className={css.empty}>{t('coverageDeferred')}</p>}
      {tab === 'approvals' && <><p className={css.muted}>{t('notConnected')}</p>{task.approvals.map(approval => <article className={css.card} key={approval.id}><div className={css.toolbar}><h3>{approval.action}</h3><Status value={approval.status} t={t} /></div><p>{approval.target}</p><p>{approval.reason}</p><p className={css.muted}>{approval.requestedBy} · {approval.ticketId} · {approval.at}</p><p>{approval.decisionNote}</p></article>)}{!task.approvals.length && empty}</>}
      {tab === 'report' && <article className={css.card}><pre className={css.pre}>{task.report?.markdown ?? buildReport(data, task)}</pre></article>}
    </div>
  </section>
}

function TagRole({ role }: { role: string }): ReactNode { return <span className={css.muted}>{role}</span> }
