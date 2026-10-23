/** Task-local subscription choices applied by the Host to the next conversation turn. */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SecurityConversationCatalog, SecurityConversationRequest, SecurityConversationSelection } from '../conversation-types.ts'
import type { SetupFace } from './setup-state.ts'
import css from './TaskSessions.module.css'

/** Narrow task-selection commands; catalogs contain only tool-free engines. */
export interface SecurityEngineFace {
  loadSecurityEngine(this: void, target: SecurityConversationRequest): Promise<SecurityConversationCatalog>
  selectSecurityEngine(this: void, target: SecurityConversationRequest, selection: SecurityConversationSelection): Promise<void>
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Session-scoped header controls read running state from the shared Session projection. */
    'security.task.engine': { kind: 'single'; scope: 'session'; owner: SecurityConversationRequest }
  }
}

type Props = PropsRuntime<'security.task.engine'> & PropsLocale<'security'>
  & InjectFace<SecurityEngineFace & Pick<SetupFace, 'hooks'>>

/** Select a saved engine and model without replacing the transcript or composer.
 * @param props - task identity, shared running state and owner-validated selection commands.
 * @returns header selectors and an actionable load/save error.
 */
export function SecurityEnginePicker(props: Props): ReactNode {
  return <TaskEnginePicker key={JSON.stringify([props.workspaceId, props.taskId])} {...props} />
}

function TaskEnginePicker({
  workspaceId, taskId, t, useSession, useSecuritySetup, loadSecurityEngine, selectSecurityEngine,
}: Props): ReactNode {
  const key = JSON.stringify([workspaceId, taskId])
  const sessionBusy = useSession(state => state.running || state.openState !== 'open' || state.removed)
  const setupBusy = useSecuritySetup(state => state[key]?.busy)
  const [catalog, setCatalog] = useState<SecurityConversationCatalog>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const version = useRef(0)
  const load = useCallback(async (): Promise<void> => {
    const request = ++version.current
    setBusy(true); setError(false)
    try {
      const value = await loadSecurityEngine({ workspaceId, taskId })
      if (request === version.current) setCatalog(value)
    } catch (_catalogFailure) { if (request === version.current) setError(true) }
    finally { if (request === version.current) setBusy(false) }
  }, [workspaceId, taskId, loadSecurityEngine])
  useEffect(() => {
    void load()
    return () => { version.current++ }
  }, [load])
  const select = async (selection: SecurityConversationSelection): Promise<void> => {
    if (busy || sessionBusy || setupBusy) return
    const request = ++version.current
    setBusy(true); setError(false)
    try {
      await selectSecurityEngine({ workspaceId, taskId }, selection)
      const value = await loadSecurityEngine({ workspaceId, taskId })
      if (request === version.current) setCatalog(value)
    } catch (_selectionFailure) { if (request === version.current) setError(true) }
    finally { if (request === version.current) setBusy(false) }
  }
  const selected = catalog?.selection
  const engine = catalog?.engines.find(item => item.id === selected?.engine)
  const disabled = Boolean(!catalog || busy || sessionBusy || setupBusy)
  return <div className={css.enginePicker} title={t('securityEngineNextTurn')}>
    <label><span className={css.engineLabel}>{t('securityEngine')}</span><select aria-label={t('securityEngine')}
      value={selected?.engine ?? ''} disabled={disabled} onChange={(event) => {
        const next = catalog?.engines.find(item => item.id === event.target.value)
        const model = next?.models[0]
        if (next && model) void select({ engine: next.id, model: model.id })
      }}>
      {!catalog && <option value="">{t('securityEngineLoading')}</option>}
      {catalog?.engines.map(item => <option key={item.id} value={item.id} disabled={!item.models.length}>{item.name}</option>)}
      {catalog && !catalog.engines.some(item => item.id === 'codex') && <option value="codex" disabled>{t('securityEngineCodexUnavailable')}</option>}
    </select></label>
    <label><span className={css.engineLabel}>{t('model')}</span><select aria-label={t('model')}
      value={selected?.model ?? ''} disabled={disabled || !engine?.models.length} onChange={(event) => {
        if (selected) void select({ engine: selected.engine, model: event.target.value })
      }}>
      {!catalog && <option value="">{t('securityEngineLoading')}</option>}
      {selected && !engine?.models.some(item => item.id === selected.model)
        && <option value={selected.model} disabled>{selected.model}</option>}
      {engine?.models.map(item => <option key={item.id} value={item.id}>{item.id === 'default' ? t('securityEngineDefault') : item.name}</option>)}
    </select></label>
    {error && <span role="alert" className={css.engineError}>{t('securityEngineError')} <Button variant="outline" size="sm" disabled={busy} onClick={() => { void load() }}>{t('securityChatRetry')}</Button></span>}
  </div>
}
