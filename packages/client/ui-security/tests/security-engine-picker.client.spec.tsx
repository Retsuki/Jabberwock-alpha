// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type {} from '../src/client/index.ts'
import { SecurityEnginePicker, type SecurityEngineFace } from '../src/client/SecurityEnginePicker.tsx'
import { ja } from '../src/client/locales.ts'
import type { SecurityConversationCatalog } from '../src/conversation-types.ts'

afterEach(cleanup)
const unused = (): never => { throw new Error('Unused framework hook') }
type Props = Parameters<typeof SecurityEnginePicker>[0]
type SessionState = Parameters<Parameters<Props['useSession']>[0]>[0]
const session: SessionState = {
  sessionId: 'session' as SessionState['sessionId'], pendingSubmissions: [], running: false, subagent: null, removed: false,
  openState: 'open', openError: null, hasMore: false, loadingOlder: false, promptError: null, blank: false,
  lastAgentError: null, promptAttempted: false, awaitingFirstTurn: false,
}
function props(loadSecurityEngine: SecurityEngineFace['loadSecurityEngine'], selectSecurityEngine: SecurityEngineFace['selectSecurityEngine']): Props {
  return { workspaceId: 'workspace' as Props['workspaceId'], taskId: 'task', sessionId: session.sessionId,
    usePanelInfo: unused, useRemoteAccess: unused, useSessions: unused, useSessionStatus: unused,
    useSessionRetainInfo: unused, useSessionAccess: unused, useWorkspaces: unused, useWorkspaceAccess: unused, useResource: unused,
    useSession: selector => selector(session), useProjection: unused, useAccess: unused, useConversation: unused,
    useChat: unused, useTrajectory: unused, useInput: unused,
    inputActions: { captureInsertion: unused, insertText: unused, setDraft: unused, persistDraft: unused,
      addAttachments: unused, removeAttachment: unused, pruneAttachments: unused, submit: unused },
    useSecuritySetup: selector => selector({}), loadSecurityEngine, selectSecurityEngine,
    t: key => key in ja ? ja[key as keyof typeof ja] : key }
}
it('selects the connected DeepSeek account and API independently and retains task ownership', async () => {
  let catalog: SecurityConversationCatalog = { selection: { engine: 'claude', model: 'sonnet' }, engines: [
    { id: 'claude', name: 'Claude', models: [{ id: 'sonnet', name: 'Sonnet' }] },
    { id: 'deepseek-account', name: 'DeepSeek Account', models: [{ id: 'account-model', name: 'Account model' }] },
    { id: 'deepseek-official', name: 'DeepSeek API', models: [{ id: 'api-first', name: 'API first' }, { id: 'api-second', name: 'API second' }] },
  ] }
  const save = vi.fn<SecurityEngineFace['selectSecurityEngine']>(async (_target, selection) => { catalog = { ...catalog, selection } })
  render(<SecurityEnginePicker {...props(async () => catalog, save)} />)
  await act(async () => {})
  fireEvent.change(screen.getByRole('combobox', { name: 'エンジン' }), { target: { value: 'deepseek-account' } })
  await act(async () => {})
  expect(save).toHaveBeenLastCalledWith({ workspaceId: 'workspace', taskId: 'task' }, { engine: 'deepseek-account', model: 'account-model' })
  fireEvent.change(screen.getByRole('combobox', { name: 'エンジン' }), { target: { value: 'deepseek-official' } })
  await act(async () => {})
  fireEvent.change(screen.getByRole('combobox', { name: 'モデル' }), { target: { value: 'api-second' } })
  await act(async () => {})
  expect(save).toHaveBeenLastCalledWith({ workspaceId: 'workspace', taskId: 'task' }, { engine: 'deepseek-official', model: 'api-second' })
  expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'モデル' }).value).toBe('api-second')
})
it('does not invent a DeepSeek model when its connected catalog is empty', async () => {
  const save = vi.fn<SecurityEngineFace['selectSecurityEngine']>()
  const catalog: SecurityConversationCatalog = { selection: { engine: 'claude', model: 'sonnet' }, engines: [
    { id: 'claude', name: 'Claude', models: [{ id: 'sonnet', name: 'Sonnet' }] },
    { id: 'deepseek-account', name: 'DeepSeek Account', models: [] },
  ] }
  render(<SecurityEnginePicker {...props(async () => catalog, save)} />)
  await act(async () => {})
  expect(screen.getByRole('option', { name: 'DeepSeek Account' }).hasAttribute('disabled')).toBe(true)
  fireEvent.change(screen.getByRole('combobox', { name: 'エンジン' }), { target: { value: 'deepseek-account' } })
  await act(async () => {})
  expect(save).not.toHaveBeenCalled()
  expect(screen.queryByRole('option', { name: 'deepseek-chat' })).toBeNull()
})
