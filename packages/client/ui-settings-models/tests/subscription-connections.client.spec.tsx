// @vitest-environment jsdom
/** Subscription history preferences use the existing fenced settings mutations. */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SettingsNamespaceView } from '@deepseek-ai/dsh-api-remotes/client'
import { SubscriptionConnections } from '../src/client/SubscriptionConnections.tsx'
import type { SubscriptionOperations } from '../src/client/SubscriptionConnections.tsx'
import type { ModelsOperations, SettingsWriteOutcome } from '../src/client/operations.ts'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { en, zh } from '../src/client/locales.ts'

afterEach(cleanup)

function view(value: JsonValue = {}, revision = 7): SettingsNamespaceView {
  return { ns: 'subscription-engines', value, user: value, base: {}, schema: {},
    revision, autoGenerate: true, applies: 'live', secrets: [] }
}

const subscriptions: SubscriptionOperations = {
  list: async () => [{ engine: 'claude', name: 'Claude', status: 'connected' }, { engine: 'codex', name: 'Codex', status: 'connected' }],
  connect: async () => ({ message: 'Connected' }),
}
const label = (engine: 'claude' | 'codex') => `${engine === 'claude' ? 'Claude / Anthropic' : 'Codex / OpenAI'} ${en.subscriptionSharingTitle}`

function mount(initial: SettingsNamespaceView | null = view(), writable = true,
  writeSettings: ModelsOperations['writeSettings'] = vi.fn<ModelsOperations['writeSettings']>(async () => ({ kind: 'written', view: view({}) })),
  reloadSettings = vi.fn(async () => {})) {
  const props = { operations: subscriptions, t: (key: keyof typeof en) => en[key],
    namespace: initial ?? undefined, writable, writeSettings, reloadSettings }
  const mounted = render(<SubscriptionConnections {...props} />)
  return { ...mounted, writeSettings, reloadSettings,
    refresh: (namespace: SettingsNamespaceView) => { mounted.rerender(<SubscriptionConnections {...props} namespace={namespace} />) } }
}

describe('subscription history sharing preferences', () => {
  it('defaults missing policies to normal confirmation without persisting an implicit choice', async () => {
    const fixture = mount()
    await screen.findAllByText(en.subscriptionConnected)
    expect(screen.getByLabelText<HTMLSelectElement>(label('claude')).value).toBe('ask')
    expect(screen.getByLabelText<HTMLSelectElement>(label('codex')).value).toBe('ask')
    expect(fixture.writeSettings).not.toHaveBeenCalled()
    expect(screen.getByText(en.subscriptionSharingHelp).textContent).toMatchInlineSnapshot('"Applies to this device’s profile, including new conversations, and persists after restart. Normal confirmation returns to conversation-specific permission; previously granted conversation permissions remain separate. Credential files, system instructions and tool results are not included."')
    expect([...screen.getByLabelText<HTMLSelectElement>(label('claude')).options].map(x => [x.value, x.textContent])).toMatchInlineSnapshot(`
      [
        [
          "ask",
          "Use normal confirmation",
        ],
        [
          "allow",
          "Always allow sharing",
        ],
      ]
    `)
  })

  it('writes only the selected provider with its current revision, waits for the authoritative refresh, and reads persisted values on remount', async () => {
    const pending = Promise.withResolvers<SettingsWriteOutcome>()
    const write = vi.fn<ModelsOperations['writeSettings']>(() => pending.promise)
    const fixture = mount(view({ historySharing: { claude: 'ask', codex: 'allow' } }), true, write)
    fireEvent.change(screen.getByLabelText(label('claude')), { target: { value: 'allow' } })
    expect(write).toHaveBeenCalledWith('subscription-engines', [
      { op: 'set', path: ['historySharing', 'claude'], value: 'allow' },
    ], 7)
    expect(screen.getByLabelText<HTMLSelectElement>(label('claude')).value).toBe('ask')
    expect(screen.getByLabelText<HTMLSelectElement>(label('codex')).disabled).toBe(true)
    const committed = view({ historySharing: { claude: 'allow', codex: 'allow' } }, 8)
    await act(async () => { pending.resolve({ kind: 'written', view: committed }); await pending.promise })
    expect(fixture.reloadSettings).toHaveBeenCalledOnce()
    fixture.refresh(committed)
    expect(screen.getByLabelText<HTMLSelectElement>(label('claude')).value).toBe('allow')
    fixture.unmount()
    mount(committed)
    expect(screen.getByLabelText<HTMLSelectElement>(label('claude')).value).toBe('allow')
    expect(screen.getByLabelText<HTMLSelectElement>(label('codex')).value).toBe('allow')
  })

  it('restores normal confirmation for Codex without writing the Claude preference', async () => {
    const fixture = mount(view({ historySharing: { claude: 'allow', codex: 'allow' } }, 11))
    fireEvent.change(screen.getByLabelText(label('codex')), { target: { value: 'ask' } })
    await waitFor(() => { expect(fixture.reloadSettings).toHaveBeenCalledOnce() })
    expect(fixture.writeSettings).toHaveBeenCalledWith('subscription-engines', [
      { op: 'set', path: ['historySharing', 'codex'], value: 'ask' },
    ], 11)
  })

  it.each(['conflict', 'refused'] as const)('shows a %s and never displays a refused preference as committed', async (kind) => {
    const write = vi.fn<ModelsOperations['writeSettings']>(async () => ({ kind, message: 'not permitted' }))
    const fixture = mount(view(), true, write)
    fireEvent.change(screen.getByLabelText(label('claude')), { target: { value: 'allow' } })
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', kind === 'conflict' ? en.subscriptionSharingConflict : 'not permitted')
    expect(fixture.reloadSettings).toHaveBeenCalledOnce()
    expect(screen.getByLabelText<HTMLSelectElement>(label('claude')).value).toBe('ask')
  })

  it('reports a transport failure without changing the stored selection', async () => {
    const write = vi.fn<ModelsOperations['writeSettings']>(async () => { throw new Error('offline') })
    const fixture = mount(view(), true, write)
    fireEvent.change(screen.getByLabelText(label('claude')), { target: { value: 'allow' } })
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'offline')
    expect(fixture.reloadSettings).not.toHaveBeenCalled()
    expect(screen.getByLabelText<HTMLSelectElement>(label('claude')).value).toBe('ask')
  })

  it('disables writes when read-only or when the namespace is unavailable', async () => {
    const fixture = mount(view(), false)
    await screen.findAllByText(en.subscriptionConnected)
    expect(screen.getByLabelText<HTMLSelectElement>(label('claude')).disabled).toBe(true)
    expect(screen.getByText(en.readOnly)).toBeDefined()
    fixture.unmount()
    mount(null, false)
    expect(screen.getByLabelText<HTMLSelectElement>(label('codex')).disabled).toBe(true)
    expect(fixture.writeSettings).not.toHaveBeenCalled()
  })

  it('owns matching translated settings labels and consent descriptions', async () => {
    render(<SubscriptionConnections operations={subscriptions} t={key => zh[key]} namespace={view()} writable={false} />)
    await screen.findAllByText(zh.subscriptionConnected)
    expect(screen.getByLabelText('Claude / Anthropic '+zh.subscriptionSharingTitle)).toBeDefined()
    expect(screen.getByText(zh.subscriptionSharingClaude)).toBeDefined()
    expect(screen.getByText(zh.subscriptionSharingCodex)).toBeDefined()
  })
})
