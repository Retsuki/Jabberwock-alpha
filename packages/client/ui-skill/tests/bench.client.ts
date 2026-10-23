/** Shared bench for the ui-skill specs: a booted plugin over fake Remote, Session, and presentation faces. */
import { Context } from '@deepseek-ai/cordis'
import { onTestFinished, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { SidebarRightTabRegistry } from '@deepseek-ai/dsh-client-ui-sidebar-right/src/client/tab-registry.ts'
import { TestRemote, TestSessions } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionFixture } from '@deepseek-ai/dsh-client-test-runtime'
import type { RemoteFailure } from '@deepseek-ai/dsh-api-remotes/client'
import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { apply, inject } from '../src/client/index.ts'
import { UserTextRegistry } from '../../ui-conversation/src/client/conversation/user-text-registry.ts'

export const sid = (id: string) => id as SessionId

export type SkillRow = { name: string; description: string; whenToUse?: string; path?: string; modelInvocable?: boolean }
export type ListResult =
  | { ok: true; value: { skills: SkillRow[] } }
  | { ok: false; error: RemoteFailure }
export type ListFn = (payload: object, signal?: AbortSignal) => Promise<ListResult>

export interface PresentationCapture {
  slots: SlotRegistry
  dictionaries: Array<{ namespace: string; dictionaries: unknown }>
  localeDisposed: boolean
}

/** Provide the presentation registries and capture the plugin's registrations. */
export function providePresentation(ctx: Context): PresentationCapture {
  const slots = new SlotRegistry(ctx)
  const userText = new UserTextRegistry(ctx)
  ctx.provide('uiConversation', { userText } as never)
  slots.register({
    name: 'root',
    children: {
      'tool.call.toolview': { kind: 'keyed', scope: 'session' },
      'conversation.user.text.node': { kind: 'keyed', scope: 'session', inline: true },
      'sidebar.right.pane.tab': { kind: 'keyed', scope: 'session' },
      'sidebar.right.pane.tab.title': { kind: 'keyed', scope: 'session' },
    },
  } as never, () => null)
  const capture: PresentationCapture = {
    slots,
    dictionaries: [],
    localeDisposed: false,
  }
  ctx.provide('locale', {
    register(namespace: string, dictionaries: unknown) {
      capture.dictionaries.push({ namespace, dictionaries })
      return () => { capture.localeDisposed = true }
    },
    // Minimal bound-translate fake: zh dictionary lookup, key passthrough on miss.
    bind: () => (key: string) => key === 'menu.userOnly' ? '仅用户' : key,
  })
  return capture
}

/** Boot the plugin over fake slash/connection faces; returns the captured source and its ctx. */
export async function bench(list: ListFn, addressed?: SessionId, opening: Pick<SessionFixture, 'initialOpen' | 'snapshot'> = {}) {
  const ctx = new Context()
  const openResource = vi.fn()
  ctx.provide('sidebarRight', { openResource })
  const tabs = new SidebarRightTabRegistry(ctx)
  ctx.provide('sidebarRightTabs', tabs)
  let captured: InputTriggerSource | undefined
  ctx.provide('inputTriggers', { registerSource: (src: InputTriggerSource) => { captured = src; return () => {} } })
  const sessions = new TestSessions(async (action) => { await action() }, ctx)
  ctx.provide('sessions', sessions)
  onTestFinished(async () => {
    await sessions.disposeScopes()
    await ctx.fiber.dispose()
  })
  for (const id of ['s1', 's2', 'preview', 'first', 'second', 'child']) {
    await sessions.add({ id, ...opening })
    sessions.retainFor(ctx, id === addressed
      ? { parentSessionId: sid('parent'), childSessionId: addressed, mode: 'continuable' }
      : sid(id))
  }
  const remote = new TestRemote(ctx, { skills: { list } })
  const presentation = providePresentation(ctx)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  onTestFinished(async () => { await fiber.dispose() })
  await fiber.await()
  return { ctx, source: captured!, remote, fiber, openResource, sessions, presentation, tabs }
}

export const CATALOG: SkillRow[] = [
  { name: 'commit-helper', description: 'commit flow', modelInvocable: true },
  { name: 'code-review', description: 'review flow', whenToUse: 'reviews', modelInvocable: true },
  { name: 'deploy', description: 'deploy flow', modelInvocable: true },
]

export const listOk = (skills: SkillRow[]): ListFn => () => Promise.resolve({ ok: true as const, value: { skills } })
