/**
 * The Skills tab: the Session's skill catalog as a searchable list.
 *
 * The component holds no catalog. It reads the settled snapshot from its injected
 * face, asks the face to load when none is settled, and redraws when the face
 * announces a settlement or an invalidation.
 */
import { useEffect, useReducer, useState } from 'react'
import type { ReactNode } from 'react'
import type { SkillEntry } from '@deepseek-ai/dsh-api-remotes/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  IconRefreshOutlineRegular, IconSearchOutlineRegular, IconSkillOutlineRegular, Input, rankByName, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import css from './SkillsBody.module.css'

/** One Session's skill catalog as the Skills tab reads it. */
export interface SkillCatalogFace {
  /**
   * Whether the Session lists skills at all.
   * @returns false for an addressed subagent Session.
   */
  readonly isAvailable: () => boolean
  /**
   * Read the settled catalog without starting a fetch.
   * @returns the catalog, or undefined while none is settled; the same array until the next settlement.
   */
  readonly peek: () => readonly SkillEntry[] | undefined
  /**
   * Observe settlements and invalidations of this Session's catalog.
   * @param listener - called after each one.
   * @returns the unsubscribe function.
   */
  readonly subscribe: (listener: () => void) => () => void
  /**
   * Fetch the catalog through the shared per-Session cache.
   * @returns a promise that resolves once the fetch settled or an invalidation superseded it, and rejects with the fetch failure.
   */
  readonly load: () => Promise<void>
  /** Drop this Session's cached catalog; subscribers load the current one. */
  readonly reload: () => void
  /**
   * Open a skill's SKILL.md in the right Sidebar.
   * @param skill - a catalog entry; one without a path is ignored.
   */
  readonly open: (skill: SkillEntry) => void
}

/** The registrant's share of the body's props. */
export interface SkillsInjected {
  readonly catalog: SkillCatalogFace
}

/** The body's composed props. */
export type SkillsBodyProps = PropsRuntime<'sidebar.right.pane.tab'> & SkillsInjected & PropsLocale<'skill'>

/**
 * The Skills tab body.
 * @param props - the Session's catalog face and copy.
 * @returns the search header and the list or the state that replaces it.
 */
export function SkillsBody({ catalog, t }: SkillsBodyProps): ReactNode {
  const [query, setQuery] = useState('')
  const [attempt, bump] = useReducer((count: number) => count + 1, 0)
  const [failure, setFailure] = useState<Error | undefined>()
  const available = catalog.isAvailable()
  useEffect(() => catalog.subscribe(bump), [catalog])
  useEffect(() => {
    if (!available || catalog.peek() !== undefined) return
    let live = true
    setFailure(undefined)
    catalog.load().catch((error: unknown) => {
      if (live) setFailure(error instanceof Error ? error : new Error(String(error)))
    })
    return () => { live = false }
  }, [catalog, available, attempt])

  if (!available) {
    return <div className={css.status}><p className={css.statusLine}>{t('tab.subagent')}</p></div>
  }
  const skills = catalog.peek()
  const matches = skills === undefined ? [] : rankByName(skills, query)
  const reload = (): void => {
    catalog.reload()
    bump()
  }
  const content = (): ReactNode => {
    if (failure !== undefined) {
      return (
        <div className={css.status} role="alert" data-skills-row="failed">
          <p className={css.statusLine}>{t('tab.error', { message: failure.message })}</p>
          <button type="button" className={css.retry} onClick={() => { setFailure(undefined); bump() }}>
            {t('tab.retry')}
          </button>
        </div>
      )
    }
    if (skills === undefined) return <p className={css.note} role="status" data-skills-row="loading">{t('tab.loading')}</p>
    if (skills.length === 0) return <p className={css.note} data-skills-row="empty">{t('tab.empty')}</p>
    if (matches.length === 0) return <p className={css.note} data-skills-row="no-match">{t('tab.noMatch')}</p>
    return (
      <ul className={css.list}>
        {matches.map(skill => (
          <li key={`${skill.name}\0${skill.path ?? ''}`} className={css.item} data-skills-name={skill.name}>
            <SkillItem skill={skill} open={catalog.open} t={t} />
          </li>
        ))}
      </ul>
    )
  }
  return (
    <div className={css.root} data-skills-state="list">
      <div className={css.header}>
        <Input
          className={css.search as string}
          type="search"
          icon={<IconSearchOutlineRegular />}
          aria-label={t('tab.search')}
          placeholder={t('tab.search')}
          value={query}
          onChange={(event) => { setQuery(event.currentTarget.value) }}
        />
        <Tooltip label={t('tab.reload')} side="bottom" delayMs={500}>
          <button type="button" className={css.tool} aria-label={t('tab.reload')} onClick={reload}>
            <IconRefreshOutlineRegular />
          </button>
        </Tooltip>
      </div>
      <div className={css.body}>{content()}</div>
    </div>
  )
}

/** One skill's row: a button when its SKILL.md can be opened, a disabled row otherwise. */
function SkillItem({ skill, open, t }: { skill: SkillEntry; open: SkillCatalogFace['open']; t: SkillsBodyProps['t'] }): ReactNode {
  if (skill.path === undefined) {
    return (
      <div className={css.row} aria-disabled="true" title={t('tab.noFile')}>
        <SkillRowContent skill={skill} t={t} />
      </div>
    )
  }
  return (
    <button type="button" className={css.row} onClick={() => { open(skill) }}>
      <SkillRowContent skill={skill} t={t} />
    </button>
  )
}

/** One skill's name, user-only marker, and description. */
function SkillRowContent({ skill, t }: { skill: SkillEntry; t: SkillsBodyProps['t'] }): ReactNode {
  return (
    <>
      <span className={css.head}>
        <span className={css.name}>{`/${skill.name}`}</span>
        {!skill.modelInvocable && <span className={css.marker}>{t('menu.userOnly')}</span>}
      </span>
      <span className={css.description}>{skill.description}</span>
    </>
  )
}

/**
 * The Skills type's chip title: the skill glyph before the type's label.
 * @param props - the tab information hook.
 * @returns the glyph followed by the tab's title text.
 */
export function SkillsTitle({ useTabInfo }: PropsRuntime<'sidebar.right.pane.tab.title'>): ReactNode {
  const { tab } = useTabInfo()
  return (
    <>
      <IconSkillOutlineRegular className={css.titleIcon} />
      {tab.title}
    </>
  )
}
