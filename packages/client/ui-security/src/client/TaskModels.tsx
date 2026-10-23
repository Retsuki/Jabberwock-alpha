/** Task role model settings independent of Session retention. */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SecurityConversationCatalog, SecurityConversationRequest, SecurityConversationSelection } from '../conversation-types.ts'
import css from './TaskPlanning.module.css'
/** Agent role whose next invocation uses the saved selection. */
export type SecurityModelRole = 'main' | 'planner' | 'worker'
/** Owner-validated role catalogs and immediate selection persistence. */
export interface RoleModelsFace {
  loadSecurityEngine(this: void, target: SecurityConversationRequest, role?: SecurityModelRole): Promise<SecurityConversationCatalog>
  selectSecurityEngine(this: void, target: SecurityConversationRequest,
    selection: SecurityConversationSelection, role?: SecurityModelRole, mode?: 'auto' | 'fixed'): Promise<void>
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Overview model settings for each agent role. */
    'security.task.models': { kind: 'single'; scope: 'root'; owner: SecurityConversationRequest }
  }
}
type Props = PropsRuntime<'security.task.models'> & PropsLocale<'security'> & InjectFace<RoleModelsFace>
/** Render task-local role selectors with automatic persistence.
 * @param props - task identity, dictionary and catalog commands.
 * @returns role controls with save feedback.
 */
export function TaskModels(props: Props): ReactNode {
  return <section className={css.root}><h3>{props.t('roleModelsTitle')}</h3><p className={css.notice}>{props.t('roleModelsNotice')}</p>
    {(['main', 'planner', 'worker'] as const).map(role => <RoleModel key={JSON.stringify([props.workspaceId, props.taskId, role])} {...props} role={role} />)}
  </section>
}
function RoleModel({ workspaceId, taskId, role, t, loadSecurityEngine, selectSecurityEngine,
}: Props & { role: SecurityModelRole }): ReactNode {
  const [catalog, setCatalog] = useState<SecurityConversationCatalog>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const version = useRef(0)
  const load = async (selection?: SecurityConversationSelection, mode?: 'auto' | 'fixed'): Promise<void> => {
    const id = ++version.current
    setBusy(true); setError(false)
    try {
      if (selection) await selectSecurityEngine({ workspaceId, taskId }, selection, role, mode)
      const value = await loadSecurityEngine({ workspaceId, taskId }, role)
      if (version.current === id) setCatalog(value)
    } catch (_requestFailure) { if (version.current === id) setError(true) }
    finally { if (version.current === id) setBusy(false) }
  }
  useEffect(() => { void load(); return () => { version.current++ } }, [workspaceId, taskId, role, loadSecurityEngine])
  const selected = catalog?.selection
  const engine = catalog?.engines.find(item => item.id === selected?.engine)
  const automatic = role !== 'main' && catalog?.mode === 'auto'
  const label = t(role === 'main' ? 'main' : role === 'planner' ? 'plannerGroup' : 'workerGroup')
  return <div className={css.modelRow}><strong>{label}</strong>
    {role !== 'main' && <label>{t('roleModelMode')}<select aria-label={`${label} ${t('roleModelMode')}`} disabled={busy || !catalog} value={catalog?.mode ?? 'auto'} onChange={(event) => {
      if (selected) void load(selected, event.target.value === 'auto' ? 'auto' : 'fixed')
    }}><option value="auto">{t('roleModelAuto')}</option><option value="fixed">{t('roleModelFixed')}</option></select></label>}
    {automatic ? <span className={css.notice}>{t(role === 'planner' ? 'rolePlannerAuto' : 'roleWorkerAuto')}</span> : <>
      <label>{t('securityEngine')}<select aria-label={`${label} ${t('securityEngine')}`} disabled={busy || !catalog} value={selected?.engine ?? ''} onChange={(event) => {
        const next = catalog?.engines.find(item => item.id === event.target.value)
        if (next?.models[0]) void load({ engine: next.id, model: next.models[0].id })
      }}>
        {!catalog && <option value="">{t('securityEngineLoading')}</option>}
        {catalog?.engines.map(item => <option key={item.id} value={item.id} disabled={!item.models.length}>{item.name}</option>)}
        {catalog && !catalog.engines.some(item => item.id === 'codex') && <option value="codex" disabled>{t('securityEngineCodexUnavailable')}</option>}
      </select></label>
      <label>{t('model')}<select aria-label={`${label} ${t('model')}`} disabled={busy || !engine?.models.length} value={selected?.model ?? ''} onChange={(event) => { if (selected) void load({ engine: selected.engine, model: event.target.value }) }}>
        {!catalog && <option value="">{t('securityEngineLoading')}</option>}
        {selected && !engine?.models.some(item => item.id === selected.model)
          && <option value={selected.model} disabled>{selected.model}</option>}
        {engine?.models.map(item => <option key={item.id} value={item.id}>{item.id === 'default' ? t('securityEngineDefault') : item.name}</option>)}
      </select></label>
    </>}
    {busy && <span role="status" className={css.notice}>{t('taskAutoSaving')}</span>}
    {error && <span role="alert">{t('securityEngineError')} <Button variant="outline" size="sm" onClick={() => { void load() }}>{t('planningRetry')}</Button></span>}
  </div>
}
