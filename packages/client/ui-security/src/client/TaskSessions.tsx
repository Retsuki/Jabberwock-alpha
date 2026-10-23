/** In-memory conversation previews for the selected security task. */
import { useState, type ReactNode } from 'react'
import { Button, IconPlusOutlineRegular, IconPaperclipOutlineRegular, IconPaperPlaneOutlineRegular, IconCheckCircleFillRegular, IconUserOutlineRegular, IconPlanOutlineRegular, IconShieldOutlineRegular, IconUsersOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SecurityTranslate } from './presentation.tsx'
import type { SecurityKey } from './locales.ts'
import css from './TaskSessions.module.css'

type Session = { id: string; title: SecurityKey; group: 'main' | 'planner' | 'audit' | 'worker'; running?: boolean; number?: number }
type Message = { id: string; role: 'user' | 'assistant'; text: string }
const mainSession: Session = { id: 'main-1', title: 'mainSession', group: 'main', number: 1 }
const samples: Session[] = [
  mainSession,
  { id: 'planner', title: 'plannerSession', group: 'planner' },
  { id: 'audit', title: 'auditSession', group: 'audit' },
  ...(['workerDomains', 'workerAuth', 'workerAdmin', 'workerSearch', 'workerApi', 'workerSources', 'workerComponents', 'workerConfig', 'workerNetwork', 'workerPermissions'] as const).map((title, index) => ({ id: `worker-${index + 1}`, title, group: 'worker' as const, number: index + 1, running: [2, 4, 9].includes(index) })),
]

/** Render selectable sessions and a composer that never sends data to an AI.
 * @param props - localized security copy.
 * @returns task session navigation, sample history and local message composer.
 */
export function TaskSessions({ t }: { t: SecurityTranslate }): ReactNode {
  const [sessions, setSessions] = useState(samples)
  const [selectedId, setSelectedId] = useState('main-1')
  const [messages, setMessages] = useState<Record<string, Message[]>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [sent, setSent] = useState<Record<string, boolean>>({})
  const selected = sessions.find(session => session.id === selectedId) ?? mainSession
  const title = (session: Session): string => `${t(session.title)}${session.group === 'main' ? ` #${session.number}` : ''}`
  const draft = drafts[selectedId] ?? ''
  const history: Message[] = selected.id === 'main-1' ? [
    { id: 'sample-1', role: 'assistant', text: t('sampleMainOne') },
    { id: 'sample-2', role: 'user', text: t('sampleUserOne') },
    { id: 'sample-3', role: 'assistant', text: t('sampleMainTwo') },
    { id: 'sample-4', role: 'user', text: t('sampleUserTwo') },
    { id: 'sample-5', role: 'assistant', text: t('sampleMainThree') },
  ] : selected.group === 'planner' ? [{ id: 'sample-planner', role: 'assistant', text: t('samplePlanner') }]
    : selected.group === 'audit' ? [{ id: 'sample-audit', role: 'assistant', text: t('sampleAudit') }]
      : selected.group === 'worker' ? [{ id: 'sample-worker', role: 'assistant', text: `${title(selected)} — ${t('sampleWorker')}` }] : []
  const addSession = (): void => {
    const number = sessions.filter(session => session.group === 'main').length + 1
    const id = `main-${number}`
    setSessions([...sessions, { id, title: 'mainSession', group: 'main', number }]); setSelectedId(id)
  }
  return <section className={css.root} aria-label={t('sessionList')}>
    <aside className={css.sidebar}>
      <header className={css.sidebarHeader}><span>{t('sessionList')}</span><div className={css.usage}>{t('taskTotal')} · {t('inputTokens')} <b>512k</b> {t('cacheTokens')} <b>300k</b> {t('outputTokens')} <b>40k</b></div></header>
      <div className={css.sessionScroll}>{(['main', 'planner', 'audit', 'worker'] as const).map(group => <div className={css.group} key={group}>
        <div className={css.groupHeading}><span className={css.groupLabel}>{group === 'main' ? <IconUserOutlineRegular size={14} /> : group === 'planner' ? <IconPlanOutlineRegular size={14} /> : group === 'audit' ? <IconShieldOutlineRegular size={14} /> : <IconUsersOutlineRegular size={14} />}{t(group === 'main' ? 'main' : group === 'planner' ? 'plannerGroup' : group === 'audit' ? 'auditGroup' : 'workersGroup')}</span>{group === 'main' && <Button variant="ghost" size="sm" onClick={addSession}><IconPlusOutlineRegular size={12} />{t('newSession')}</Button>}</div>
        {sessions.filter(session => session.group === group).map(session => <button key={session.id} type="button" className={`${css.session} ${selectedId === session.id ? css.selected : ''}`} aria-pressed={selectedId === session.id} onClick={() => { setSelectedId(session.id) }} title={title(session)}>
          {group === 'worker' && (session.running ? <span className={css.runningDot} aria-label={t('doing')} /> : <IconCheckCircleFillRegular className={css.doneIcon} size={14} />)}
          {group === 'worker' && <code>#{session.number}</code>}<span className={css.sessionTitle}>{title(session)}</span>{session.running && <span className={css.live}>{t('livePreview')}</span>}
        </button>)}
      </div>)}</div>
    </aside>
    <div className={css.conversation}>
      <header className={css.conversationHeader}><strong>{title(selected)}</strong><span className={css.model}>Claude Opus 4.8</span><span className={css.conversationMeta}>{t('sampleConversation')}</span></header>
      <div className={css.messages} key={selectedId}>
        {history.length === 0 && !(messages[selectedId]?.length) && <p className={css.empty}>{t('newSessionEmpty')}</p>}
        {[...history, ...(messages[selectedId] ?? [])].map(message => <div key={message.id} className={`${css.message} ${message.role === 'user' ? css.user : css.assistant}`}><div className={css.bubble}>{message.text}</div>{message.role === 'user' && <IconUserOutlineRegular size={18} className={css.avatar} />}<span className={css.messageMeta}>{message.role === 'user' ? t('localMessage') : t('sampleConversation')}</span></div>)}
      </div>
      <form className={css.composerArea} onSubmit={(event) => { event.preventDefault(); if (!draft.trim()) return; setMessages({ ...messages, [selectedId]: [...(messages[selectedId] ?? []), { id: `local-${(messages[selectedId]?.length ?? 0) + 1}`, role: 'user', text: draft.trim() }] }); setDrafts({ ...drafts, [selectedId]: '' }); setSent({ ...sent, [selectedId]: true }) }}>
        <div className={css.composer}><textarea aria-label={t('sessionMessage')} placeholder={t('sessionMessage')} value={draft} onChange={(event) => { setDrafts({ ...drafts, [selectedId]: event.target.value }) }} rows={2} /><div className={css.composerTools}><span title={t('attachmentUnavailable')}><Button type="button" variant="ghost" size="sm" disabled aria-label={t('attachmentUnavailable')}><IconPaperclipOutlineRegular size={16} /></Button></span><Button type="submit" variant="primary" size="sm" disabled={!draft.trim()} aria-label={t('sendPreview')}><IconPaperPlaneOutlineRegular size={16} /></Button></div></div>
        <p className={css.composerNote} role="status">{t(sent[selectedId] ? 'messagePreviewOnly' : 'composerPreviewOnly')}</p>
      </form>
    </div>
  </section>
}
