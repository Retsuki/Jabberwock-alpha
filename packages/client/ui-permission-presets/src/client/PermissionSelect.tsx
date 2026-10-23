import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import {
  IconChevronDownOutlineRegular, Menu, PermissionIconAutoReviewRegular, PermissionIconFullAccessRegular,
  PermissionIconReadOnlyRegular, PermissionIconWorkspaceWriteRegular, RiskConfirmation,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  HostObservable, InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { PermissionSelection, PresetOption } from '@deepseek-ai/dsh-permission-presets/client'
// Type-only: pulls the conversation-owned permission slot declaration and
// the standard session projection hook into this package's Client face.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PermissionCatalogState } from './catalog.ts'
import { PERMISSION_ACCESS_NS } from './locales.ts'
import {
  AUTO_REVIEW_PRESET as AUTO_REVIEW,
  activePermissionCopy, permissionConfirmation,
  FULL_ACCESS_PRESET as FULL_ACCESS,
} from './presentation.ts'
import css from './PermissionSelect.module.css'

/* Permission glyphs follow currentColor so the trigger and menu rows tint the
   shared product artwork with their own text color. */

const permissionGlyphs = new Map<string, ReactNode>([
  ['read-only', <PermissionIconReadOnlyRegular />],
  ['workspace-write', <PermissionIconWorkspaceWriteRegular />],
  [FULL_ACCESS, <PermissionIconFullAccessRegular />],
  [AUTO_REVIEW, <PermissionIconAutoReviewRegular />],
  ['ask', <PermissionIconWorkspaceWriteRegular />],
  ['auto-review', <PermissionIconAutoReviewRegular />],
  ['full-access', <PermissionIconFullAccessRegular />],
  ['default', <PermissionIconWorkspaceWriteRegular />],
  ['acceptEdits', <PermissionIconWorkspaceWriteRegular />],
  ['plan', <PermissionIconReadOnlyRegular />],
  ['bypassPermissions', <PermissionIconFullAccessRegular />],
])

/** Glyph for a permission option value; host-configured names outside the design set get none. */
function permissionGlyph(value: string): ReactNode | undefined {
  return permissionGlyphs.get(value)
}

/** Business face injected by the permission package's slot registration. */
export interface PermissionSelectInjected {
  hooks: {
    /** One process catalog shared with the slash popup. */
    permissionCatalog: HostObservable<PermissionCatalogState>
  }
  /** Submit one current-session preset through the existing command writer. */
  select: (preset: string) => Promise<boolean>
  /** Dismiss an open slash chooser when its active execution provider changes. */
  resetChoices?: () => void
}

/** Complete props derived from the conversation slot, injected hooks, and locale. */
export type PermissionSelectProps =
  PropsRuntime<'conversation.input.permission'>
  & InjectFace<PermissionSelectInjected>
  & PropsLocale<typeof PERMISSION_ACCESS_NS>

export function PermissionSelect(props: PermissionSelectProps) {
  const selection = props.useProjection('permissions')
  const catalog = props.usePermissionCatalog(state => state.value)
  const previousEngine = useRef(selection?.engine)
  useEffect(() => {
    if (previousEngine.current !== selection?.engine) props.resetChoices?.()
    previousEngine.current = selection?.engine
  }, [props.resetChoices, selection?.engine])
  const options = selection?.options ?? catalog?.options
  if (selection === undefined || options === undefined) return null
  return <ActivePermissionSelect key={selection.engine ?? 'standard'} {...props} selection={selection} options={options} />
}

function ActivePermissionSelect({ locked, select, t, selection, options }: PermissionSelectProps & {
  selection: PermissionSelection
  options: readonly PresetOption[]
}) {
  const live = useRef(true)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  const [pick, setPick] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)

  useEffect(() => {
    if (!locked
      && (confirmation === null || options.some(option => option.value === confirmation))) return
    setOpen(false)
    setAcknowledged(false)
    setConfirmation(null)
  }, [options, confirmation, locked, selection])

  const currentValue = pick !== null && options.some(option => option.value === pick)
    ? pick : selection.currentValue
  const current = options.find(option => option.value === currentValue)
  const currentLabel = current === undefined
    ? activePermissionCopy({ value: currentValue, name: currentValue }, selection.engine, t).label
    : activePermissionCopy(current, selection.engine, t).label
  const busy = pick !== null || confirmation !== null

  const items: MenuEntry[] = options.map((option) => {
    const icon = permissionGlyph(option.value)
    const { label, badge, description } = activePermissionCopy(option, selection.engine, t)
    return {
      id: option.value,
      label: badge === undefined
        ? selection.engine === undefined ? label : <span title={description}>{label}</span>
        : (
          <span className={css.optionLabel} aria-label={`${label} ${badge}`}>
            <span className={css.optionLabelText}>{label}</span>
            <span className={css.badge}>{badge}</span>
          </span>
        ),
      ...icon === undefined ? {} : { icon },
    }
  })

  const submit = (id: string): void => {
    setPick(id)
    void select(id)
      .catch(() => false)
      .then(() => { if (live.current) setPick(null) })
  }

  const choose = (id: string): void => {
    setOpen(false)
    if (id === selection.currentValue) return
    if (permissionConfirmation(id, selection.engine, t) !== undefined) {
      setAcknowledged(false)
      setConfirmation(id)
      return
    }
    submit(id)
  }

  const closeConfirmation = (): void => {
    setAcknowledged(false)
    setConfirmation(null)
  }

  const confirmSelection = (id: string): void => {
    closeConfirmation()
    submit(id)
  }

  const gate = confirmation === null ? undefined : permissionConfirmation(confirmation, selection.engine, t)

  return (
    <>
      <Menu
        open={open}
        items={items}
        selectedId={currentValue}
        onSelect={choose}
        onClose={() => { setOpen(false) }}
        side="top"
        portal
        anchor={
          <button
            type="button"
            className={css.trigger}
            aria-label={t('mode', { name: currentLabel })}
            title={current === undefined ? undefined : activePermissionCopy(current, selection.engine, t).description}
            disabled={locked || busy}
            onClick={() => { setOpen(!open) }}
          >
            {permissionGlyph(currentValue) !== undefined && (
              <span className={css.triggerIcon} aria-hidden>{permissionGlyph(currentValue)}</span>
            )}
            <span className={css.triggerLabel}>{currentLabel}</span>
            <span className={clsx(css.chevron, open && css.chevronOpen)} aria-hidden>
              <IconChevronDownOutlineRegular />
            </span>
          </button>
        }
      />
      {confirmation !== null && gate !== undefined && (
        <RiskConfirmation
          open
          title={gate.title}
          description={gate.description}
          acknowledgeLabel={gate.acknowledgeLabel}
          cancelLabel={gate.cancelLabel}
          closeLabel={t('close')}
          confirmLabel={gate.confirmLabel}
          acknowledged={acknowledged}
          disabled={locked}
          onAcknowledgedChange={setAcknowledged}
          onCancel={closeConfirmation}
          onConfirm={() => { confirmSelection(confirmation) }}
        />
      )}
    </>
  )
}
