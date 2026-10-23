/**
 * Permission preset plugin, browser half — a popupSelect DECORATION hung on
 * the host `/permission` command: one flat list of presets, current value
 * marked active, a pick executes the switch. One process catalog directory is
 * shared with the standard composer slot; native Session projections carry
 * provider-specific options. The decoration owns only the
 * bare invocation; the host command keeps its catalog row, the argued path
 * (`/permission <preset>` still switches directly), and the lifecycle
 * logging. Native options and the active mark read the Session projection;
 * standard options read the process catalog; a
 * pick submits the `/permission <preset>` command line, so both surfaces
 * write through one path and the pushed projection frame is the one
 * confirmation. The Full access row carries the same explicit risk gate as
 * the composer chip; the shared popup shell owns the modal mechanics.
 * The General-settings row separately writes the default preset for sessions
 * created later through the host Settings API.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionFace } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type { PresetOption, PermissionSelection } from '@deepseek-ai/dsh-permission-presets/client'
// Direct dependency: catalog settlements are fenced by the actual connection
// generation rather than by a parallel domain counter.
import type {} from '@deepseek-ai/dsh-client-connection/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the settings slot types (this package registers a General row).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the ctx.remote merge and the forwarded-event key face
// (the settings invalidation rides the allowlist) into this program.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { CommandUiContract, SelectOption } from '@deepseek-ai/dsh-client-ui-commands/client'
import type { ClientSessionContext } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { PermissionCatalogDirectory } from './catalog.ts'
import { PermissionSelect } from './PermissionSelect.tsx'
import type { PermissionSelectInjected } from './PermissionSelect.tsx'
import { PermissionRow } from './PermissionRow.tsx'
import type { PermissionRowInjected } from './PermissionRow.tsx'
import {
  accessEn, accessZh, en, PERMISSION_ACCESS_NS, zh,
} from './locales.ts'
import {
  activePermissionCopy, permissionConfirmation,
} from './presentation.ts'
import { PermissionPresetSettingsController } from './settings-store.ts'

export type { PermissionRowInjected, PermissionRowProps } from './PermissionRow.tsx'
export type { PermissionCatalogState } from './catalog.ts'
export type { PermissionSelectInjected, PermissionSelectProps } from './PermissionSelect.tsx'
export type {
  PermissionDefaultOption, PermissionSettingsState,
} from './settings-store.ts'

/** Required services (cordis fiber inject). */
export const inject = [
  'commandUi', 'connection', 'sessions', 'slots', 'locale', 'remote',
  'remote.permissionPresets', 'remote.settings',
  'configForms', 'settingsSchema',
]

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Current-session permission picker and confirmation copy. */
    'permission.access': keyof typeof accessEn
  }
}

/** Read one session's current permissions projection value (undefined = capability absent). */
function selectionOf(session: SessionFace | undefined): PermissionSelection | undefined {
  return session?.projections.faceOf('permissions').getSnapshot() as PermissionSelection | undefined
}

/** Project the active engine's permission choices into the slash menu. */
function optionsOf(
  options: readonly PresetOption[],
  selection: PermissionSelection,
  t: TranslateNS<typeof PERMISSION_ACCESS_NS>,
): SelectOption[] {
  return options.map((option) => {
    const copy = activePermissionCopy(option, selection.engine, t)
    const confirmation = permissionConfirmation(option.value, selection.engine, t)
    return {
      id: option.value,
      label: copy.label,
      ...copy.badge === undefined ? {} : { badge: copy.badge },
      ...copy.description === undefined ? {} : { detail: copy.description },
      ...option.value === selection.currentValue ? { active: true } : {},
      ...confirmation === undefined ? {} : { confirmation },
    }
  })
}

/**
 * Client plugin body: register the /permission popup picker over the
 * permissions projection.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const command = ctx.get('commandUi') as CommandUiContract
  const sessions = ctx.sessions
  ctx.effect(
    () => ctx.locale.register(PERMISSION_ACCESS_NS, { zh: accessZh, en: accessEn }),
    'ui-permission: current-session dictionaries',
  )
  const t = ctx.locale.bind(PERMISSION_ACCESS_NS)
  const sessionFor = (session: ClientSessionContext): SessionFace | undefined =>
    sessions.binding(session.sessionId)?.session
  const submit = async (sessionId: SessionId, preset: string): Promise<boolean> => {
    const live = sessions.binding(sessionId)?.session
    if (live === undefined) throw new Error('this session is not materialized yet')
    const result = await live.command(`/permission ${preset}`)
    if (!result.ok) {
      throw new Error(`permission switch failed: ${result.error.code}: ${result.error.message}`)
    }
    if (!result.value.matched) throw new Error('the host offers no /permission command')
    return true
  }

  const optionEngines = new WeakMap<SelectOption, PermissionSelection['engine']>()
  const catalog = new PermissionCatalogDirectory(ctx)
  ctx.effect(() => () => { catalog.dispose() }, 'ui-permission: process catalog directory')
  ctx.effect(
    // Only an invalidation makes displayed options stale; publishing the result
    // of a read a displayed picker waits for must leave it open with its failure
    // and retry state intact.
    () => catalog.invalidations.subscribe(() => { command.dismiss('permission') }),
    'ui-permission: dismiss stale slash choices',
  )

  ctx.effect(() => ctx.locale.register('settings.permission', { zh, en }), 'ui-permission: settings row dictionaries')

  // The shared ConfigForm mirror updates after document commits and reconnects.
  const controller = new PermissionPresetSettingsController(
    ctx.configForms.describe(), ctx, catalog)
  const load = (): Promise<void> => controller.load()
  const select = (preset: string): Promise<void> => controller.select(preset)
  const injected = (): PermissionRowInjected => ({
    hooks: { permission: controller.store },
    load,
    select,
  })

  ctx.effect(() => () => { controller.dispose() }, 'ui-permission: settings row directory')

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'permission',
    order: -20,
    locale: 'settings.permission',
    inject: injected,
  }, PermissionRow))

  ctx.slots.inject('conversation.input.permission', () => ctx.slots.register({
    name: 'conversation.input.permission',
    locale: PERMISSION_ACCESS_NS,
    inject: (sessionId: SessionId): PermissionSelectInjected => ({
      hooks: { permissionCatalog: catalog.store },
      select: preset => submit(sessionId, preset),
      resetChoices: () => { command.dismiss('permission') },
    }),
  }, PermissionSelect))

  ctx.effect(() => command.decorate({
    name: 'permission',
    // The Session's current value alone decides availability. A missing catalog
    // surfaces through `options()`, which keeps the picker's own retry entry
    // reachable after a failed read instead of hiding the command.
    available: session => selectionOf(sessionFor(session)) !== undefined,
    ui: {
      kind: 'popupSelect',
      options: async (session) => {
        const selection = selectionOf(sessionFor(session))
        if (selection === undefined) throw new Error('permission presets are not available on this host')
        const loaded = selection.options === undefined ? await catalog.load() : undefined
        const current = selectionOf(sessionFor(session))
        if (current === undefined) throw new Error('permission presets are no longer available')
        const options = current.options ?? loaded?.options
        if (options === undefined) throw new Error('permission provider changed; open the picker again')
        const choices = optionsOf(options, current, t)
        for (const option of choices) optionEngines.set(option, current.engine)
        return choices
      },
      onSelect: (option, session) => {
        const current = selectionOf(sessionFor(session))
        if (current === undefined || !optionEngines.has(option) || optionEngines.get(option) !== current.engine) {
          throw new Error('permission provider changed; open the picker again')
        }
        return submit(session.sessionId, option.id).then(() => undefined)
      },
    },
  }), 'ui-permission: /permission decoration')
}
