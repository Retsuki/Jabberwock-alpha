/** Editable task policies saved as draft settings; execution does not consume them. */
import { useState, type ReactNode } from 'react'
import { Button, Input, IconPlusOutlineRegular, IconTrashOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { SecurityTask } from '../security-records.ts'
import type { TaskEditFields } from './records-state.ts'
import type { SecurityTranslate } from './presentation.tsx'
import css from './TaskPolicyFields.module.css'

const scopeKinds = ['domain', 'ip', 'cidr', 'url'] as const
/** Render goal, operation constraint and allow/exclude draft fields.
 * @param props - Current draft, localized labels and existing autosave actions.
 * @returns Three policy cards with stable row IDs and editable empty rows.
 */
export function TaskPolicyFields({ task, t, editTask, flush, disabled }: {
  task: SecurityTask
  t: SecurityTranslate
  editTask: (patch: Partial<TaskEditFields>) => void
  flush: () => Promise<boolean>
  disabled: boolean
}): ReactNode {
  const [emptyGoal] = useState(() => ({ id: randomUUID(), text: '' }))
  const [emptyConstraint] = useState(() => ({ id: randomUUID(), action: 'deny' as const, text: '' }))
  const [emptyRule] = useState(() => ({ id: randomUUID(), action: 'deny' as const, kind: 'domain' as const, value: '', note: '' }))
  const goals = task.goals?.length ? task.goals : [emptyGoal]
  const constraints = task.constraints?.length ? task.constraints : [emptyConstraint]
  const rules = task.scopeRules?.length ? task.scopeRules : [emptyRule]
  return <>
    <article className={css.card} onBlur={() => { void flush() }}>
      <div className={css.heading}><h3>{t('goalManagement')}</h3><Button variant="outline" size="sm" disabled={disabled}
        onClick={() => { editTask({ goals: [...goals, { id: randomUUID(), text: '' }] }) }}>
        <IconPlusOutlineRegular size={14} />{t('policyAddGoal')}</Button></div>
      <div className={css.rows}>{goals.map((goal, index) => <div className={css.textRow} key={goal.id}>
        <Input className={css.input as string} aria-label={`${t('policyGoal')} ${index + 1}`} value={goal.text} disabled={disabled}
          placeholder={t('policyGoalPlaceholder')} onChange={(event) => {
            editTask({ goals: goals.map(item => item.id === goal.id ? { ...item, text: event.target.value } : item) })
          }} /><Button variant="ghost" size="sm" disabled={disabled || !task.goals?.length} aria-label={`${t('remove')} ${t('policyGoal')} ${index + 1}`}
          onClick={() => { editTask({ goals: goals.filter(item => item.id !== goal.id) }) }}><IconTrashOutlineRegular size={15} /></Button>
      </div>)}</div>
    </article>
    <article className={css.card} onBlur={() => { void flush() }}>
      <div className={css.heading}><h3>{t('constraints')}</h3><Button variant="outline" size="sm" disabled={disabled}
        onClick={() => { editTask({ constraints: [...constraints, { id: randomUUID(), action: 'deny', text: '' }] }) }}>
        <IconPlusOutlineRegular size={14} />{t('policyAddConstraint')}</Button></div>
      <div className={css.rows}>{constraints.map((constraint, index) => <div className={css.constraintRow} key={constraint.id}>
        <select aria-label={`${t('constraintAction')} ${index + 1}`} value={constraint.action} disabled={disabled}
          onChange={(event) => { const action = event.target.value === 'allow' ? 'allow' : 'deny'
            editTask({ constraints: constraints.map(item => item.id === constraint.id ? { ...item, action } : item) })
          }}><option value="deny">{t('deny')}</option><option value="allow">{t('allow')}</option></select>
        <Input className={css.input as string} aria-label={`${t('policyConstraint')} ${index + 1}`} value={constraint.text}
          disabled={disabled} placeholder={t('policyConstraintPlaceholder')} onChange={(event) => {
            editTask({ constraints: constraints.map(item => item.id === constraint.id ? { ...item, text: event.target.value } : item) })
          }} /><Button variant="ghost" size="sm" disabled={disabled || !task.constraints?.length} aria-label={`${t('remove')} ${t('policyConstraint')} ${index + 1}`}
          onClick={() => { editTask({ constraints: constraints.filter(item => item.id !== constraint.id) }) }}>
          <IconTrashOutlineRegular size={15} /></Button>
      </div>)}</div>
    </article>
    <article className={css.card} onBlur={() => { void flush() }}>
      <div className={css.heading}><h3>{t('policyScopeTitle')}</h3><Button variant="outline" size="sm" disabled={disabled}
        onClick={() => { editTask({ scopeRules: [...rules, { id: randomUUID(), action: 'deny', kind: 'domain', value: '', note: '' }] }) }}>
        <IconPlusOutlineRegular size={14} />{t('policyAddScope')}</Button></div>
      <p className={css.notice}>{t('policyEnforcementNotice')}</p>
      <div className={css.rows}>{rules.map((rule, index) => <div className={css.scopeRow} key={rule.id}>
        <select aria-label={`${t('assetRuleAction')} ${index + 1}`} value={rule.action} disabled={disabled}
          onChange={(event) => { const action = event.target.value === 'allow' ? 'allow' : 'deny'
            editTask({ scopeRules: rules.map(item => item.id === rule.id ? { ...item, action } : item) })
          }}><option value="deny">{t('policyExclude')}</option><option value="allow">{t('allow')}</option></select>
        <select aria-label={`${t('kind')} ${index + 1}`} value={rule.kind} disabled={disabled} onChange={(event) => {
          const kind = scopeKinds.find(value => value === event.target.value)
          if (kind) editTask({ scopeRules: rules.map(item => item.id === rule.id ? { ...item, kind } : item) })
        }}>{scopeKinds.map(kind => <option key={kind} value={kind}>{t(kind)}</option>)}</select>
        <Input className={css.input as string} aria-label={`${t('policyScopeValue')} ${index + 1}`} value={rule.value}
          disabled={disabled} placeholder={t('policyScopePlaceholder')} onChange={(event) => {
            editTask({ scopeRules: rules.map(item => item.id === rule.id ? { ...item, value: event.target.value } : item) })
          }} />
        <Input className={css.input as string} aria-label={`${t('policyNote')} ${index + 1}`} value={rule.note}
          disabled={disabled} placeholder={t('policyNote')} onChange={(event) => {
            editTask({ scopeRules: rules.map(item => item.id === rule.id ? { ...item, note: event.target.value } : item) })
          }} /><Button variant="ghost" size="sm" disabled={disabled || !task.scopeRules?.length}
          aria-label={`${t('remove')} ${t('policyScopeValue')} ${index + 1}`}
          onClick={() => { editTask({ scopeRules: rules.filter(item => item.id !== rule.id) }) }}>
          <IconTrashOutlineRegular size={15} /></Button>
      </div>)}</div>
    </article>
  </>
}
