// @vitest-environment jsdom
/** Scanner facts render without model messages or automatic retries. */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupplyChainRun, SupplyChainFinding } from '../src/supply-chain-types.ts'
import { SupplyChainCard } from '../src/client/SupplyChainChat.tsx'
import { SupplyChainReport } from '../src/client/SupplyChainReport.tsx'
import type {} from '../src/client/index.ts'
import { ja } from '../src/client/locales.ts'
import { supplyChainDefinition } from '../src/client/supply-chain-definition.ts'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent, SessionSeq } from '@deepseek-ai/dsh-session/types'
import { ConversationNodeAssembler } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ChatConversationViewNode } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { SessionLiveEventEntry } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ConversationNodeDefinition, ConversationViewDefinition, ConversationStartMatch } from '@deepseek-ai/dsh-client-ui-conversation/client'

afterEach(cleanup)
const t: Parameters<typeof SupplyChainReport>[0]['t'] = (key, params) => {
  const value = key in ja ? ja[key as keyof typeof ja] : key
  return value.replace(/\{(\w+)\}/g, (token: string, name: string) => {
    const replacement = params?.[name]
    return typeof replacement === 'string' || typeof replacement === 'number' ? String(replacement) : token
  })
}
function run(patch: Partial<SupplyChainRun> = {}): SupplyChainRun {
  return { workspaceId: 'w' as SupplyChainRun['workspaceId'], runId: 'scan-1', requestId: 'request-1', sessionId: 'session-1' as SupplyChainRun['sessionId'], status: 'completed', phase: 'done', createdAt: 1, updatedAt: 2, message: 'Saved facts.', checkedPackages: 15, findings: [], warnings: [], ...patch }
}
function finding(patch: Partial<SupplyChainFinding> = {}): SupplyChainFinding {
  return { package: 'example-package', version: '1.2.3', title: 'Public advisory overview', description: '# Impact\n\nA published issue can affect the documented feature.\n\n```js\nnot rendered\n```\n\nFurther content.', severity: 'high', vulnerableRange: '<2.0.0', advisoryUrl: 'https://github.com/advisories/GHSA-2345-6789-2345', ghsaId: 'GHSA-2345-6789-2345', cveIds: ['CVE-2026-1234'], fixStatus: 'available', fixedVersion: '2.0.0', relationship: 'direct', environment: 'production', publishedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-02-01T00:00:00Z', cvssScore: 0, cweIds: ['CWE-20'], ...patch }
}

describe('supply-chain saved report', () => {
  it('shows a zero-match completed report without claiming safety', () => {
    render(<SupplyChainReport run={run()} t={t} />)
    expect(screen.getByText(ja.supplyChainNoMatches)).toBeDefined()
    expect(screen.getByText(ja.supplyChainCountNote)).toBeDefined()
    expect(screen.getAllByText(ja.supplyChainUnverified).length).toBeGreaterThan(0)
  })
  it.each(['incomplete', 'failed', 'cancelled', 'interrupted'] as const)('retains scope and uncertainty when %s has zero rows', (status) => {
    render(<SupplyChainReport run={run({ status, warnings: ['Registry unavailable'] })} t={t} />)
    expect(screen.getAllByText(ja.supplyChainPartial).length).toBeGreaterThan(0)
    expect(screen.getByText('Registry unavailable')).toBeDefined()
    expect(screen.queryByText(ja.supplyChainNoMatches)).toBeNull()
  })
  it('separates public advisory facts, source dates, dependency facts and unverified project impact', () => {
    render(<SupplyChainReport run={run({ findings: [finding()], lockfile: { path: '/workspace/pnpm-lock.yaml', scope: 'workspace', packageManager: 'pnpm' } })} t={t} />)
    expect(screen.getByRole('columnheader', { name: ja.supplyChainPublished })).toBeDefined()
    expect(screen.getByRole('columnheader', { name: ja.supplyChainUpdated })).toBeDefined()
    expect(screen.getAllByRole('columnheader').map(node => node.textContent)).toMatchInlineSnapshot(`
      [
        "パッケージ / 導入バージョン",
        "深刻度",
        "修正版",
        "アドバイザリー公開日",
        "アドバイザリー更新日",
      ]
    `)
    expect(screen.getByText(ja.supplyChainWorkspaceScope)).toBeDefined()
    expect(screen.getAllByText('A published issue can affect the documented feature.')).toHaveLength(1)
    expect(screen.queryByText(/not rendered/)).toBeNull()
    expect(screen.getByText('0')).toBeDefined()
    expect(screen.getAllByRole('link')[0]?.getAttribute('href')).toBe(finding().advisoryUrl)
    expect(screen.getByText('直接依存 / 本番用')).toBeDefined()
    expect(screen.getByText('このロックファイルには、公開情報の影響範囲に一致する example-package@1.2.3 が含まれています。')).toBeDefined()
  })
  it('keeps missing and invalid dates unknown, distinguishes fix uncertainty, and never activates untrusted source links', () => {
    render(<SupplyChainReport run={run({ findings: [finding({ publishedAt: 'invalid date', updatedAt: 'invalid date', advisoryUrl: 'javascript:alert(1)', description: '<img src=x onerror=alert(1)>', fixStatus: 'unknown' })] })} t={t} />)
    expect(screen.getAllByText(ja.supplyChainUnknownValue).length).toBeGreaterThan(2)
    expect(screen.queryByText('Invalid Date')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getAllByText('<img src=x onerror=alert(1)>')).toHaveLength(1)
  })
})

describe('supply-chain chat card', () => {
  it('shows real running state, opens a report, and cancels only explicitly', async () => {
    const cancelSupplyChain = vi.fn(async () => {})
    render(<SupplyChainCard run={run({ status: 'running', phase: 'advisories' })} t={t} canCancel cancelSupplyChain={cancelSupplyChain} />)
    expect(screen.getByText(ja.supplyChainRunning)).toBeDefined()
    expect(cancelSupplyChain).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText(/レポートを見る · 0/))
    expect(screen.getByText(/レポートを見る · 0/).parentElement?.hasAttribute('open')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: ja.supplyChainStop }))
    expect(cancelSupplyChain).toHaveBeenCalledWith({ workspaceId: 'w', runId: 'scan-1' })
  })
  it('does not offer stop for a copied record from another conversation', () => {
    render(<SupplyChainCard run={run({ status: 'running' })} t={t} canCancel={false} cancelSupplyChain={vi.fn()} />)
    expect(screen.queryByRole('button', { name: ja.supplyChainStop })).toBeNull()
  })
  it('shows cancellation failure and does not pretend the scan stopped', async () => {
    render(<SupplyChainCard run={run({ status: 'running' })} t={t} canCancel cancelSupplyChain={vi.fn(async () => { throw new Error('offline') })} />)
    expect(await (async () => { fireEvent.click(screen.getByRole('button', { name: ja.supplyChainStop })); return screen.findByRole('alert') })()).toHaveProperty('textContent', ja.supplyChainStopFailed)
    expect(screen.getByText(ja.supplyChainRunning)).toBeDefined()
  })
  it('labels a future unknown state without declaring a completed or safe result', () => {
    render(<SupplyChainCard run={run({ status: 'future-state' as SupplyChainRun['status'] })} t={t} canCancel cancelSupplyChain={vi.fn()} />)
    expect(screen.getByText(ja.supplyChainUnknown)).toBeDefined()
    expect(screen.queryByRole('button', { name: ja.supplyChainStop })).toBeNull()
    expect(screen.queryByText(ja.supplyChainCompleted)).toBeNull()
  })
})

it('projects persisted snapshots into one chat card without a model turn', () => {
  const started = run({ status: 'running', phase: 'lockfile' })
  const event: SessionEvent<'user/message'> = { type: 'user/message', surfaceOp: 'append', seq: 0 as SessionSeq, time: 1, data: createUserMessage({ source: { kind: 'security-supply-chain', form: 'notice', visibleInHistory: true, summary: 'Scan facts', owner: started.sessionId, run: started }, content: [{ type: 'text', text: 'Scan facts' }] }) }
  const match: ConversationStartMatch = { role: 'start', event, location: { kind: 'unresolved' } }
  const context: Parameters<typeof supplyChainDefinition.start>[0] = { key: 'security-supply-chain:scan-1', kind: 'security-supply-chain', id: started.runId, matches: [match], start: match, state: undefined, current: new Map() }
  const reader: Parameters<typeof supplyChainDefinition.start>[2] = { previous: () => undefined }
  expect(supplyChainDefinition.match(event)).toEqual({ id: 'scan-1', role: 'start' })
  const state = supplyChainDefinition.start(context, match, reader)
  const completed = run()
  const update = { ...match, event: { ...event, data: createUserMessage({ source: { kind: 'security-supply-chain', form: 'notice', visibleInHistory: true, summary: 'Scan facts', owner: completed.sessionId, run: completed }, content: [{ type: 'text', text: 'Saved facts' }] }) } }
  expect(supplyChainDefinition.update({ ...context, state }, update)).toEqual(completed)
  expect(supplyChainDefinition.buildViewNode?.({ ...context, state: completed })).toMatchObject({ kind: 'security-supply-chain', target: 'chat', data: completed })
  expect(supplyChainDefinition.match({ ...event, data: createUserMessage({ source: { kind: 'security-supply-chain', form: 'notice', visibleInHistory: true, summary: 'Scan facts', owner: 'other' as SupplyChainRun['sessionId'], run: started }, content: [] }) })).toBeNull()
})


it('replays all progress snapshots into one card and retains saved results after rebuilding the conversation', () => {
  interface Snapshot { nodes: ReadonlyMap<string, ChatConversationViewNode> }
  const view: ConversationViewDefinition<ChatConversationViewNode, Snapshot> = {
    target: 'chat', create: () => {
      let nodes = new Map<string, ChatConversationViewNode>()
      return { empty: { nodes }, replace: ({ nodes: rows }) => { nodes = new Map(rows.map(node => [node.key, node])); return { nodes } },
        apply: ({ upserts }) => { nodes = new Map(nodes); for (const node of upserts) nodes.set(node.key, node); return { nodes } } }
    },
  }
  const entry = (value: SupplyChainRun, seq: number): SessionLiveEventEntry => ({ type: 'event', event: {
    seq: seq as SessionSeq, time: seq, type: 'user/message', surfaceOp: 'append', data: createUserMessage({ source: { kind: 'security-supply-chain', form: 'notice', visibleInHistory: true, summary: 'Scan facts', owner: value.sessionId, run: value }, content: [{ type: 'text', text: 'Scan facts' }] }),
  } })
  const events = [entry(run({ status: 'running', phase: 'lockfile' }), 0), entry(run({ status: 'running', phase: 'advisories' }), 1), entry(run({ findings: [finding()] }), 2)]
  const build = () => {
    const definitions = { entries: (): readonly ConversationNodeDefinition[] => [supplyChainDefinition], fallbackEntry: () => undefined }
    const assembler = new ConversationNodeAssembler(definitions, { entries: () => [view] })
    assembler.replaceWindow(events, false); assembler.activateTarget('chat')
    return assembler.snapshot('chat') as Snapshot
  }
  const first = build(), replay = build()
  expect(first.nodes.size).toBe(1)
  expect([...first.nodes.values()][0]?.data).toEqual(run({ findings: [finding()] }))
  expect(replay).toEqual(first)
})


it('retains absent public advisory dates and an explicitly unavailable fix as separate facts', () => {
  const noDates = finding({ fixStatus: 'unavailable' })
  delete noDates.publishedAt
  delete noDates.updatedAt
  delete noDates.fixedVersion
  render(<SupplyChainReport run={run({ findings: [noDates] })} t={t} />)
  const cells = screen.getAllByRole('cell')
  expect(cells[2]?.textContent).toBe(ja.supplyChainNoFix)
  expect(cells[3]?.textContent).toBe(ja.supplyChainUnknownValue)
  expect(cells[4]?.textContent).toBe(ja.supplyChainUnknownValue)
})

it('opens the assets page directly from the single security navigation button', async () => {
  const { WorkspaceSecurity } = await import('../src/client/WorkspaceSecurity.tsx')
  type Props = Parameters<typeof WorkspaceSecurity>[0]
  const unused = (): never => { throw new Error('Unused framework hook') }
  const openSecurity = vi.fn()
  const props: Props = { workspaceId: 'workspace' as Props['workspaceId'], displayTitle: 'Example project', t,
    openSecurity, useSecuritySelection: selector => selector(undefined), usePanelInfo: selector => selector({ activePanelId: null }),
    useRemoteAccess: unused, useSessions: unused, useSessionStatus: unused, useSessionRetainInfo: unused,
    useSessionAccess: unused, useWorkspaces: unused, useWorkspaceAccess: unused, useResource: unused }
  render(<WorkspaceSecurity {...props} />)
  fireEvent.click(screen.getByRole('button', { name: ja.title }))
  expect(openSecurity).toHaveBeenCalledWith('workspace', 'Example project', 'assets')
  expect(screen.queryByRole('button', { name: ja.supplyChainTitle })).toBeNull()
})
it('sends only the saved package name for individual definition repair and keeps retry identity', async () => {
  const repair = vi.fn<NonNullable<Parameters<typeof SupplyChainReport>[0]['repairSupplyChain']>>().mockRejectedValueOnce(new Error('unconfirmed')).mockResolvedValue(run())
  render(<SupplyChainReport run={run({ inputDigest: 'a'.repeat(64), lockfile: { path: '/example/package-lock.json', packageManager: 'npm', scope: 'project' }, findings: [finding()] })} t={t} repairSupplyChain={repair} />)
  fireEvent.click(screen.getByRole('button', { name: `${ja.supplyChainRepair} · example-package` }))
  await screen.findByRole('alert')
  const first = repair.mock.calls[0]?.[0]
  if (!first) throw new Error('Expected a repair request')
  expect(first).toMatchObject({ workspaceId: 'w', runId: 'scan-1', packages: ['example-package'] })
  expect(Object.keys(first).sort()).toEqual(['packages', 'requestId', 'runId', 'workspaceId'])
  fireEvent.click(screen.getByRole('button', { name: `${ja.supplyChainRepair} · example-package` }))
  await waitFor(() => { expect(repair).toHaveBeenCalledTimes(2) })
  expect(repair.mock.calls[1]?.[0].requestId).toBe(first.requestId)
  expect(screen.getByText(ja.supplyChainRepairNote)).toBeDefined()
})
it('does not offer automatic repair for unsupported transitive or unknown fixes', () => {
  render(<SupplyChainReport run={run({ findings: [finding({ relationship: 'transitive' })] })} t={t} repairSupplyChain={vi.fn()} />)
  expect(screen.queryByRole('button', { name: `${ja.supplyChainRepair} · example-package` })).toBeNull()
  expect(screen.getByText(ja.supplyChainRepairUnsupported)).toBeDefined()
  expect(screen.getByRole('button', { name: ja.supplyChainRepairAll }).hasAttribute('disabled')).toBe(true)
})

it('starts into a running history row and enters the shared chat only after a row click', async () => {
  const { SupplyChainList } = await import('../src/client/SupplyChainList.tsx')
  type Props = Parameters<typeof SupplyChainList>[0]
  const unused = (): never => { throw new Error('Unused framework hook') }
  const listSupplyChain = vi.fn<Props['listSupplyChain']>().mockResolvedValue([])
  const startSupplyChain = vi.fn<Props['startSupplyChain']>().mockResolvedValue(run({ status: 'running' }))
  const release = vi.fn()
  const reference: Awaited<ReturnType<Props['retainSupplyChain']>> = {
    sessionId: run().sessionId, get binding(): Awaited<ReturnType<Props['retainSupplyChain']>>['binding'] { throw new Error('Binding is unused by this fixture') },
    ready: new Promise(() => {}), release, [Symbol.dispose]: release,
  }
  const retainSupplyChain = vi.fn<Props['retainSupplyChain']>().mockResolvedValue(reference)
  const props: Props = { workspaceId: 'w' as Props['workspaceId'], t, listSupplyChain, startSupplyChain, retainSupplyChain, removeSupplyChain: vi.fn(),
    SessionProvider: ({ children }) => <>{children}</>, renderSlot: () => <div data-testid="retained-chat" />, usePanelInfo: unused,
    useRemoteAccess: unused, useSessions: unused, useSessionStatus: unused, useSessionRetainInfo: unused,
    useSessionAccess: unused, useWorkspaces: unused, useWorkspaceAccess: unused, useResource: unused }
  render(<SupplyChainList {...props} />)
  await screen.findByText(ja.supplyChainHistoryEmpty)
  listSupplyChain.mockResolvedValue([run({ status: 'running' })])
  fireEvent.click(screen.getByRole('button', { name: ja.supplyChainStart }))
  const row = await screen.findByRole('button', { name: `${ja.supplyChainTitle} · scan-1` })
  expect(retainSupplyChain).not.toHaveBeenCalled()
  expect(screen.getByText(ja.supplyChainRunning)).toBeDefined()
  fireEvent.click(row)
  await screen.findByTestId('retained-chat')
  expect(retainSupplyChain).toHaveBeenCalledTimes(1)
  cleanup()
  expect(release).toHaveBeenCalledTimes(1)
})
it('retries an unconfirmed history start with the original request identity', async () => {
  const { SupplyChainList } = await import('../src/client/SupplyChainList.tsx')
  type Props = Parameters<typeof SupplyChainList>[0]
  const unused = (): never => { throw new Error('Unused framework hook') }
  const startSupplyChain = vi.fn<Props['startSupplyChain']>().mockRejectedValueOnce(new Error('unconfirmed')).mockResolvedValue(run())
  const props: Props = { workspaceId: 'w' as Props['workspaceId'], t, listSupplyChain: async () => [], startSupplyChain, retainSupplyChain: vi.fn(), removeSupplyChain: vi.fn(),
    SessionProvider: ({ children }) => <>{children}</>, renderSlot: () => null, usePanelInfo: unused,
    useRemoteAccess: unused, useSessions: unused, useSessionStatus: unused, useSessionRetainInfo: unused,
    useSessionAccess: unused, useWorkspaces: unused, useWorkspaceAccess: unused, useResource: unused }
  render(<SupplyChainList {...props} />)
  await screen.findByText(ja.supplyChainHistoryEmpty)
  fireEvent.click(screen.getByRole('button', { name: ja.supplyChainStart }))
  await screen.findByRole('alert')
  const identity = startSupplyChain.mock.calls[0]?.[1]
  fireEvent.click(screen.getByRole('button', { name: ja.supplyChainStart }))
  await waitFor(() => { expect(startSupplyChain).toHaveBeenCalledTimes(2) })
  expect(startSupplyChain.mock.calls[1]?.[1]).toBe(identity)
})
it('keeps original findings immutable and preserves the follow-up ID without a potentially deleted link', () => {
  render(<SupplyChainReport run={run({ inputDigest: 'a'.repeat(64), lockfile: { path: '/example/package-lock.json', packageManager: 'npm', scope: 'project' }, findings: [finding()], repair: {
    requestId: 'repair-1', status: 'completed', phase: 'done', startedAt: 1, updatedAt: 2, message: 'Definitions updated', packages: ['example-package'], changes: [], files: [], warnings: [], resultRunId: 'scan-2', applied: true, definitionOnly: true, runtimeTests: 'not-run',
  } })} t={t} repairSupplyChain={vi.fn()} />)
  expect(screen.queryByRole('button', { name: `${ja.supplyChainRepair} · example-package` })).toBeNull()
  expect(screen.getByRole('button', { name: ja.supplyChainRepairAll }).hasAttribute('disabled')).toBe(true)
  expect(screen.getByText('scan-2')).toBeDefined()
  expect(screen.queryByRole('link', { name: ja.supplyChainRepairRecheck })).toBeNull()
  expect(document.querySelector('a[href="#supply-chain-scan-2"]')).toBeNull()
  expect(screen.getByText(ja.supplyChainRepairUnverified)).toBeDefined()
  expect(screen.getByText(ja.supplyChainRepairApplied)).toBeDefined()
  expect(screen.queryByText(ja.supplyChainRepairUnsupported)).toBeNull()
})
it('uses the existing conversation factory without declaring its owned session slot again', async () => {
  const { SupplyChainConversation, SupplyChainReadOnlyComposer } = await import('../src/client/SupplyChainList.tsx')
  type Props = Parameters<typeof SupplyChainConversation>[0]
  const renderFactorySlot = vi.fn<Props['renderFactorySlot']>().mockReturnValue(<div>Saved scanner conversation</div>)
  render(<SupplyChainConversation {...{ renderFactorySlot } as Props} />)
  expect(renderFactorySlot).toHaveBeenCalledWith('conversation.content', { variant: 'embedded', phase: 'active', hero: false }, expect.any(Object))
  cleanup()
  render(<SupplyChainReadOnlyComposer />)
  expect(screen.queryByRole('textbox')).toBeNull()
})
it('activates the security registrations alongside the already-owned Conversation factory', async () => {
  const { SlotCore } = await import('@deepseek-ai/dsh-client-ui-slots')
  const { apply } = await import('../src/client/index.ts')
  const core = new SlotCore()
  const unused = (): never => { throw new Error('Unused slot hook') }
  const releases: (() => void)[] = []
  releases.push(core.register({ name: 'root', children: {
    main: { kind: 'keyed', scope: 'root' },
    'sidebar.workspaces.project.children': { kind: 'list', scope: 'root' },
    'conversation.chat.node': { kind: 'keyed', scope: 'session', inject: { hooks: { turnData: unused, disclosure: unused, groupAction: unused } } },
    'conversation.chat.turnTail': { kind: 'list', scope: 'session' },
  } }, (() => null) as never))
  const { createSnapshotStore } = await import('@deepseek-ai/dsh-client-store')
  releases.push(core.registerFactory({ name: 'conversation.content', scope: 'session-maybe', locale: 'conversation',
    inject: () => ({ selectWorkspace: async () => {}, hooks: { composerBlock: createSnapshotStore(undefined) } }),
    slots: { views: { scope: 'session' }, widthControls: { scope: 'root' } }, children: {
      'conversation.session': { kind: 'single', scope: 'session' },
      'conversation.overview': { kind: 'single', scope: 'session' },
      'conversation.composer': { kind: 'chain', scope: 'session' },
      'conversation.composer.bar': { kind: 'single', scope: 'session-maybe' },
      'conversation.input.dock': { kind: 'list', scope: 'session' },
      'conversation.hero.brand.mark': { kind: 'single', scope: 'root' },
      'conversation.hero.workspace': { kind: 'single', scope: 'root' },
      'conversation.hero.agentPreset': { kind: 'single', scope: 'session-maybe' },
      'conversation.hero.options': { kind: 'list', scope: 'session' },
    } }, (() => null) as never))
  const release = (): void => {}
  const { Context } = await import('@deepseek-ai/cordis')
  const context = new Context()
  releases.push(context.provide('slots', {
    register: core.register.bind(core), inject: (_name: string, effect: () => (() => void)) => { releases.push(effect()) },
  } as never))
  releases.push(context.provide('locale', { register: () => release, addLanguage: () => release } as never))
  releases.push(context.provide('remote', {} as never))
  releases.push(context.provide('layout', {} as never))
  releases.push(context.provide('sessions', {} as never))
  releases.push(context.provide('uiWorkspace', { sidebarSessions: { register: () => release } } as never))
  releases.push(context.provide('uiConversation', { events: { register: () => release } } as never))
  try { expect(() => { apply(context) }).not.toThrow() }
  finally { for (const dispose of releases.reverse()) dispose() }
})
