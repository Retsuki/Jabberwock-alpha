// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type {} from '../src/client/index.ts'
import { TaskModels, type RoleModelsFace, type SecurityModelRole } from '../src/client/TaskModels.tsx'
import { ja } from '../src/client/locales.ts'
import type { SecurityConversationCatalog, SecurityConversationRequest } from '../src/conversation-types.ts'

afterEach(cleanup)

it('shows automatic role selection and saves a manual override without inventing an engine', async () => {
  const modes = { planner: 'auto', worker: 'auto' } as Record<'planner' | 'worker', 'auto' | 'fixed'>
  const selection = { engine: 'claude', model: 'sonnet' } as const
  const loadSecurityEngine: RoleModelsFace['loadSecurityEngine'] = vi.fn(async (_target: SecurityConversationRequest, role: SecurityModelRole = 'main') => ({
    selection, mode: role === 'main' ? 'fixed' : modes[role],
    engines: [{ id: 'claude', name: 'Claude', models: [{ id: 'sonnet', name: 'Sonnet' }] }],
  } satisfies SecurityConversationCatalog))
  const selectSecurityEngine = vi.fn<RoleModelsFace['selectSecurityEngine']>(async (_target, _selection, role: SecurityModelRole = 'main', mode) => {
    if (role !== 'main' && mode) modes[role] = mode
  })
  const unusedFrameworkHook = (): never => { throw new Error('TaskModels does not consume this framework hook') }
  const props: Parameters<typeof TaskModels>[0] = {
    usePanelInfo: unusedFrameworkHook, useRemoteAccess: unusedFrameworkHook, useSessions: unusedFrameworkHook,
    useSessionStatus: unusedFrameworkHook, useSessionRetainInfo: unusedFrameworkHook, useSessionAccess: unusedFrameworkHook,
    useWorkspaces: unusedFrameworkHook, useWorkspaceAccess: unusedFrameworkHook, useResource: unusedFrameworkHook,
    workspaceId: 'workspace' as SecurityConversationRequest['workspaceId'], taskId: 'task', loadSecurityEngine, selectSecurityEngine,
    t: key => key in ja ? ja[key as keyof typeof ja] : key }
  render(<TaskModels {...props} />)
  const planner = await screen.findByRole('combobox', { name: 'プランナー モデルの選び方' })
  await waitFor(() => { expect((planner as HTMLSelectElement).value).toBe('auto') })
  expect(screen.queryByRole('combobox', { name: 'プランナー エンジン' })).toBeNull()
  fireEvent.change(planner, { target: { value: 'fixed' } })
  await waitFor(() => { expect(selectSecurityEngine).toHaveBeenCalledWith({ workspaceId: 'workspace', taskId: 'task' }, selection, 'planner', 'fixed') })
  expect((await screen.findByRole<HTMLSelectElement>('combobox', { name: 'プランナー エンジン' })).value).toBe('claude')
  fireEvent.change(planner, { target: { value: 'auto' } })
  await waitFor(() => { expect(screen.queryByRole('combobox', { name: 'プランナー エンジン' })).toBeNull() })
  expect(screen.getByRole<HTMLSelectElement>('combobox', { name: 'ワーカー モデルの選び方' }).value).toBe('auto')
})

it('persists DeepSeek engine and model per role without changing the other agent roles', async () => {
  const selections: Record<SecurityModelRole, SecurityConversationCatalog['selection']> = {
    main: { engine: 'claude', model: 'sonnet' }, planner: { engine: 'claude', model: 'sonnet' }, worker: { engine: 'claude', model: 'sonnet' },
  }
  const engines: SecurityConversationCatalog['engines'] = [
    { id: 'claude', name: 'Claude', models: [{ id: 'sonnet', name: 'Sonnet' }] },
    { id: 'deepseek-account', name: 'DeepSeek Account', models: [{ id: 'account-model', name: 'Account model' }] },
    { id: 'deepseek-official', name: 'DeepSeek API', models: [{ id: 'api-first', name: 'API first' }, { id: 'api-second', name: 'API second' }] },
  ]
  const loadSecurityEngine: RoleModelsFace['loadSecurityEngine'] = async (_target, role = 'main') => ({ selection: selections[role], mode: 'fixed', engines })
  const selectSecurityEngine = vi.fn<RoleModelsFace['selectSecurityEngine']>(async (_target, selection, role = 'main') => { selections[role] = selection })
  const unused = (): never => { throw new Error('Unused framework hook') }
  const props: Parameters<typeof TaskModels>[0] = {
    usePanelInfo: unused, useRemoteAccess: unused, useSessions: unused, useSessionStatus: unused, useSessionRetainInfo: unused,
    useSessionAccess: unused, useWorkspaces: unused, useWorkspaceAccess: unused, useResource: unused,
    workspaceId: 'workspace' as SecurityConversationRequest['workspaceId'], taskId: 'task', loadSecurityEngine, selectSecurityEngine,
    t: key => key in ja ? ja[key as keyof typeof ja] : key,
  }
  const view = render(<TaskModels {...props} />)
  const roles = [['main', '主エージェント', 'deepseek-account', 'account-model'],
    ['planner', 'プランナー', 'deepseek-official', 'api-second'], ['worker', 'ワーカー', 'deepseek-official', 'api-first']] as const
  for (const [role, label, engine, model] of roles) {
    const picker = await screen.findByRole('combobox', { name: `${label} エンジン` })
    await waitFor(() => { expect(picker.hasAttribute('disabled')).toBe(false) })
    fireEvent.change(picker, { target: { value: engine } })
    await waitFor(() => { expect(screen.getByRole<HTMLSelectElement>('combobox', { name: `${label} モデル` }).value).toBe(engine === 'deepseek-account' ? 'account-model' : 'api-first') })
    if (model === 'api-second') {
      fireEvent.change(screen.getByRole('combobox', { name: `${label} モデル` }), { target: { value: model } })
      await waitFor(() => { expect(selections[role].model).toBe(model) })
    }
    expect(selectSecurityEngine).toHaveBeenLastCalledWith({ workspaceId: 'workspace', taskId: 'task' }, { engine, model }, role, undefined)
  }
  view.unmount()
  render(<TaskModels {...props} />)
  for (const [_role, label, engine, model] of roles) {
    await waitFor(() => { expect(screen.getByRole<HTMLSelectElement>('combobox', { name: `${label} エンジン` }).value).toBe(engine) })
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: `${label} モデル` }).value).toBe(model)
  }
})
