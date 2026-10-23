// @vitest-environment jsdom
/**
 * The Skills sidebar tab: registration and disposal against the real tab
 * registry, then the body over the plugin's own Session-bound face, the real
 * per-session catalog cache, and scripted `skills/list` results.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { makeTranslate, RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import { fileAddressFor } from '@deepseek-ai/dsh-util-workspace-path'
import { SkillsBody, SkillsTitle, type SkillsBodyProps, type SkillsInjected } from '../src/client/SkillsBody.tsx'
import { SKILLS_ID, SKILLS_KIND } from '../src/client/SkillsDefinition.ts'
import { en } from '../src/client/locales.ts'
import { bench, CATALOG, listOk, sid, type ListFn, type ListResult, type SkillRow } from './bench.client.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { InjectParams } from '@deepseek-ai/dsh-client-ui-slots'

afterEach(cleanup)

const ROWS: SkillRow[] = [
  { name: 'commit-helper', description: 'commit flow', path: '/skills/commit-helper/SKILL.md', modelInvocable: true },
  { name: 'deploy', description: 'deploy flow', modelInvocable: false },
  { name: 'code-review', description: 'review flow', path: '/skills/code-review/SKILL.md', modelInvocable: true },
]

/** Boot the plugin and mount the Skills body over the face it injects for `sessionId`. */
async function mount(list: ListFn, sessionId = 's1', addressed?: SessionId) {
  const b = await bench(list, addressed)
  const entry = b.presentation.slots.entries('sidebar.right.pane.tab')[0]
  if (entry?.inject === undefined) throw new Error('Skills body was not registered')
  const { catalog } = (entry.inject as (...params: InjectParams<'sidebar.right.pane.tab', undefined>) => Pick<SkillsInjected, 'catalog'>)(sid(sessionId))
  const props = { catalog, t: makeTranslate(en) } as unknown as SkillsBodyProps
  const view = render(createElement(SkillsBody, props))
  return { ...b, catalog, view }
}

const names = (container: HTMLElement): string[] =>
  [...container.querySelectorAll('[data-skills-name]')].map(row => row.getAttribute('data-skills-name')!)

describe('registration', () => {
  it('registers the type with one guide entry, the body and the chip title under the type id', async () => {
    const b = await bench(listOk(CATALOG))
    const definition = b.tabs.get(SKILLS_KIND)
    expect(definition?.id).toBe(SKILLS_ID)
    expect(definition?.priority).toBe('builtin')
    expect(definition?.title('')).toBe('tab.title')
    const [entry, ...rest] = b.tabs.guide()
    expect(rest).toEqual([])
    expect(entry?.kind).toBe(SKILLS_KIND)
    expect(entry?.order).toBe(40)
    expect(entry?.title()).toBe('tab.title')
    expect(entry?.description?.()).toBe('tab.guide.description')
    expect(entry?.icon).toBeDefined()
    const body = b.presentation.slots.entries('sidebar.right.pane.tab')
    expect(body.map(row => [row.options.key, row.component, row.locale])).toEqual([[SKILLS_ID, SkillsBody, 'skill']])
    expect(b.presentation.slots.entries('sidebar.right.pane.tab.title').map(row => [row.options.key, row.component]))
      .toEqual([[SKILLS_ID, SkillsTitle]])
  })

  it('removes the type, the body and the title when the plugin is disposed (HMR safety)', async () => {
    const b = await bench(listOk(CATALOG))
    await b.fiber.dispose()
    expect(b.tabs.get(SKILLS_KIND)).toBeUndefined()
    expect(b.presentation.slots.entries('sidebar.right.pane.tab')).toHaveLength(0)
    expect(b.presentation.slots.entries('sidebar.right.pane.tab.title')).toHaveLength(0)
  })

  it('draws the skill glyph before the tab title', () => {
    const view = render(createElement(SkillsTitle, { useTabInfo: () => ({ tab: { title: 'Skills' } }) } as never))
    expect(view.container.querySelector('svg')).not.toBeNull()
    expect(view.container.textContent).toBe('Skills')
  })
})

describe('SkillsBody', () => {
  it('shows loading, then the list with /name, description and the user-only marker', async () => {
    const gate = Promise.withResolvers<ListResult>()
    const { view } = await mount(() => gate.promise)
    expect(view.container.querySelector('[data-skills-row="loading"]')?.textContent).toBe(en['tab.loading'])
    await act(async () => { gate.resolve({ ok: true, value: { skills: ROWS } }) })
    await waitFor(() => { expect(names(view.container)).toEqual(['commit-helper', 'deploy', 'code-review']) })
    const deploy = view.container.querySelector('[data-skills-name="deploy"]')!
    expect(deploy.textContent).toContain('/deploy')
    expect(deploy.textContent).toContain('deploy flow')
    expect(deploy.textContent).toContain('user-only')
    const commit = view.container.querySelector('[data-skills-name="commit-helper"]')!
    expect(commit.textContent).toContain('/commit-helper')
    expect(commit.textContent).not.toContain('user-only')
  })

  it('ranks matches with the shared name ranker and says so when nothing matches', async () => {
    const { view } = await mount(listOk(ROWS))
    await waitFor(() => { expect(names(view.container)).toHaveLength(3) })
    const search = view.getByRole('searchbox', { name: en['tab.search'] })
    fireEvent.change(search, { target: { value: 'de' } })
    expect(names(view.container)).toEqual(['deploy', 'code-review'])
    fireEvent.change(search, { target: { value: 'zzz' } })
    expect(view.container.querySelector('[data-skills-row="no-match"]')?.textContent).toBe(en['tab.noMatch'])
  })

  it('says so when the catalog is empty', async () => {
    const { view } = await mount(listOk([]))
    await waitFor(() => { expect(view.container.querySelector('[data-skills-row="empty"]')?.textContent).toBe(en['tab.empty']) })
  })

  it('shows the failure with its message and retries on request', async () => {
    let fail = true
    const list = vi.fn<ListFn>(payload => fail
      ? Promise.resolve({ ok: false, error: new RemoteError('gateway/internal', 'boom', {}) })
      : listOk(ROWS)(payload))
    const { view } = await mount(list)
    await waitFor(() => { expect(view.container.querySelector('[data-skills-row="failed"]')).not.toBeNull() })
    expect(view.container.querySelector('[data-skills-row="failed"]')?.textContent).toContain('skills/list failed: gateway/internal: boom')
    fail = false
    fireEvent.click(view.getByRole('button', { name: en['tab.retry'] }))
    await waitFor(() => { expect(names(view.container)).toHaveLength(3) })
    expect(list).toHaveBeenCalledTimes(2)
    expect(view.container.querySelector('[data-skills-row="failed"]')).toBeNull()
  })

  it('ignores a failure that settles after the body unmounted', async () => {
    const gate = Promise.withResolvers<ListResult>()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { view, catalog } = await mount(() => gate.promise)
    const settled = catalog.load().catch(() => {})
    view.unmount()
    gate.resolve({ ok: false, error: new RemoteError('gateway/internal', 'late', {}) })
    await settled
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it('wraps a non-Error rejection in an Error', async () => {
    const { view, catalog } = await mount(listOk(ROWS))
    vi.spyOn(catalog, 'load').mockRejectedValueOnce('plain failure')
    fireEvent.click(view.getByRole('button', { name: en['tab.reload'] }))
    await waitFor(() => { expect(view.container.querySelector('[data-skills-row="failed"]')?.textContent).toContain('plain failure') })
  })

  it('opens the SKILL.md of a clicked row through the right Sidebar; a row without a path is not a button', async () => {
    const { view, openResource } = await mount(listOk(ROWS))
    await waitFor(() => { expect(names(view.container)).toHaveLength(3) })
    fireEvent.click(view.container.querySelector('[data-skills-name="code-review"] button')!)
    expect(openResource).toHaveBeenCalledExactlyOnceWith(fileAddressFor(sid('s1'), undefined, '/skills/code-review/SKILL.md'))
    const virtual = view.container.querySelector('[data-skills-name="deploy"]')!
    expect(virtual.querySelector('button')).toBeNull()
    expect(virtual.firstElementChild?.getAttribute('aria-disabled')).toBe('true')
    expect(virtual.firstElementChild?.getAttribute('title')).toBe(en['tab.noFile'])
    fireEvent.click(virtual.firstElementChild!)
    expect(openResource).toHaveBeenCalledTimes(1)
  })

  it('reload drops the cached catalog and fetches the current one', async () => {
    let rows = ROWS
    const list = vi.fn<ListFn>(payload => listOk(rows)(payload))
    const { view } = await mount(list)
    await waitFor(() => { expect(names(view.container)).toHaveLength(3) })
    rows = [ROWS[0]!]
    fireEvent.click(view.getByRole('button', { name: en['tab.reload'] }))
    await waitFor(() => { expect(names(view.container)).toEqual(['commit-helper']) })
    expect(list).toHaveBeenCalledTimes(2)
  })

  it.each(['preset', 'plugin', 'reset'] as const)('refetches after the %s invalidation fires', async (kind) => {
    let rows = ROWS
    const list = vi.fn<ListFn>(payload => listOk(rows)(payload))
    const { view, remote, ctx } = await mount(list)
    await waitFor(() => { expect(names(view.container)).toHaveLength(3) })
    rows = [ROWS[2]!]
    act(() => {
      if (kind === 'preset') remote.emit('agent-preset/selected', [sid('s1'), 'minimal'])
      else if (kind === 'plugin') remote.emit('plugin-manager/changed', [{ reason: 'plugin' }])
      else ctx.emit('connection/reset')
    })
    await waitFor(() => { expect(names(view.container)).toEqual(['code-review']) })
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('does not show a failure for a fetch an invalidation superseded', async () => {
    const first = Promise.withResolvers<ListResult>()
    const list = vi.fn<ListFn>().mockReturnValueOnce(first.promise).mockImplementation(listOk(ROWS))
    const { view, remote } = await mount(list)
    await waitFor(() => { expect(list).toHaveBeenCalledTimes(1) })
    act(() => { remote.emit('agent-preset/selected', [sid('s1'), 'minimal']) })
    await waitFor(() => { expect(names(view.container)).toHaveLength(3) })
    first.resolve({ ok: true, value: { skills: [] } })
    expect(view.container.querySelector('[data-skills-row="failed"]')).toBeNull()
    expect(names(view.container)).toHaveLength(3)
  })

  it('shows the unavailable state for an addressed subagent Session and never fetches', async () => {
    const list = vi.fn<ListFn>(listOk(ROWS))
    const { view } = await mount(list, 'child', sid('child'))
    expect(view.container.textContent).toBe(en['tab.subagent'])
    expect(view.container.querySelector('input')).toBeNull()
    expect(list).not.toHaveBeenCalled()
  })

  it('stops listening to the catalog when it unmounts', async () => {
    const { catalog } = await mount(listOk(ROWS))
    const unsubscribe = vi.fn()
    const watched = { ...catalog, subscribe: (listener: () => void) => {
      const off = catalog.subscribe(listener)
      return () => { unsubscribe(); off() }
    } }
    const view = render(createElement(SkillsBody, { catalog: watched, t: makeTranslate(en) } as unknown as SkillsBodyProps))
    view.unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
