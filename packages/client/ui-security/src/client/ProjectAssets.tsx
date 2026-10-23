/** Project asset UI preview; edits are persisted through the workspace Host. */
import { useId, useState, type ReactNode } from 'react'
import {
  Button, Input, Modal, IconRefreshOutlineRegular, IconPlusOutlineRegular,
  IconTrashOutlineRegular, IconSearchOutlineRegular, IconWorkspaceTreeOutlineRegular,
  IconGlobeOutlineRegular, IconBranchOutlineRegular, IconCompactOutlineRegular,
  IconBrowseOutlineRegular, IconSettingsOutlineRegular, IconLinkOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { SecurityRecords, SecurityCompany } from '../security-records.ts'
import { parseTargets, normalizeTarget } from './model/parse-targets.ts'
import type { SecurityTranslate } from './presentation.tsx'
import css from './ProjectAssets.module.css'

const categories = [
  { key: 'company', label: 'projectAssetsCompany', icon: IconWorkspaceTreeOutlineRegular },
  { key: 'domain', label: 'projectAssetsDomain', icon: IconGlobeOutlineRegular },
  { key: 'ip', label: 'projectAssetsIp', icon: IconCompactOutlineRegular },
  { key: 'subdomain', label: 'projectAssetsSubdomain', icon: IconBranchOutlineRegular },
  { key: 'app', label: 'projectAssetsApp', icon: IconBrowseOutlineRegular },
  { key: 'service', label: 'projectAssetsService', icon: IconSettingsOutlineRegular },
  { key: 'endpoint', label: 'projectAssetsEndpoint', icon: IconLinkOutlineRegular },
] as const
type Category = typeof categories[number]['key']
type Company = SecurityCompany
type Dialog = { mode: 'new' } | { mode: 'edit' | 'append'; companyId: string }
/** Render saved project assets and editable registration scopes without execution.
 * @param props - localized security dictionary.
 * @returns category navigation, scoped asset rows and local editing dialogs.
 */
export function ProjectAssets({ t, records, save: persist, reload, disabled }: {
  t: SecurityTranslate
  records: SecurityRecords
  disabled: boolean
  reload: () => void
  save: (content: Pick<SecurityRecords, 'companies' | 'assets' | 'tasks'>) => Promise<boolean>
}): ReactNode {
  const prefix = useId()
  const { companies, assets } = records
  const [category, setCategory] = useState<Category>('company')
  const [search, setSearch] = useState('')
  const [dialog, setDialog] = useState<Dialog>()
  const [draftName, setDraftName] = useState('')
  const [draftScope, setDraftScope] = useState('')
  const [draftEvidence, setDraftEvidence] = useState('')
  const [assetOpen, setAssetOpen] = useState(false)
  const [assetValue, setAssetValue] = useState('')
  const [assetEditId, setAssetEditId] = useState<string>()
  const [assetCompany, setAssetCompany] = useState('')
  const [assetKind, setAssetKind] = useState<Exclude<Category, 'company'>>('domain')
  const parsed = parseTargets(draftScope, [])
  const valid = parsed.valid.filter(target => target.kind !== 'url')
  const invalid = [...parsed.invalid, ...parsed.valid.filter(target => target.kind === 'url').map(target => target.value)]
  const query = search.trim().toLocaleLowerCase()
  const company = dialog && dialog.mode !== 'new' ? companies.find(item => item.id === dialog.companyId) : undefined
  const filteredCompanies = companies.filter(item => `${item.name} ${item.scope.map(target => target.value).join(' ')}`
    .toLocaleLowerCase().includes(query))
  const filteredAssets = assets.filter(item => item.kind === category && item.value.toLocaleLowerCase().includes(query))
  const openCompany = (item: Company, mode: 'edit' | 'append'): void => {
    setDialog({ mode, companyId: item.id }); setDraftName(item.name)
    setDraftScope(mode === 'edit' ? item.scope.map(target => target.value).join('\n') : '')
    setDraftEvidence(item.evidence)
  }
  const save = async (): Promise<void> => {
    if (!dialog || invalid.length || disabled || (dialog.mode !== 'append' && !draftName.trim())) return
    const scope = valid.map(target => ({ kind: target.kind === 'url' ? 'domain' as const : target.kind, value: target.value }))
    let nextCompanies = companies
    if (dialog.mode === 'new') {
      if (!draftName.trim()) return
      nextCompanies = [...companies, { id: randomUUID(), name: draftName.trim(), scope, evidence: draftEvidence.trim() }]
    } else {
      nextCompanies = companies.map((item) => {
        if (item.id !== dialog.companyId) return item
        const nextScope = dialog.mode === 'edit' ? scope : [...item.scope, ...scope.filter(target =>
          !item.scope.some(existing => normalizeTarget(existing.value) === normalizeTarget(target.value)))]
        return { ...item, name: dialog.mode === 'edit' ? draftName.trim() : item.name, scope: nextScope, evidence: draftEvidence.trim() }
      })
    }
    if (await persist({ ...records, companies: nextCompanies })) setDialog(undefined)
  }
  const modalTitle = dialog?.mode === 'new' ? t('projectAssetsNewCompany')
    : `${t(dialog?.mode === 'append' ? 'projectAssetsAppendTitle' : 'projectAssetsEditTitle')} · ${company?.name ?? ''}`
  return <section className={css.root} aria-label={t('projectAssetsTitle')}>
    <header className={css.header}><h2>{t('projectAssetsTitle')}</h2><div className={css.headerActions}>
      <span>{t('projectAssetsTotal')} {assets.length}</span>
      <Button variant="outline" onClick={reload} disabled={disabled}><IconRefreshOutlineRegular size={14} />{t('projectAssetsRefresh')}</Button>
      <Button variant="primary" disabled={disabled} onClick={() => {
        setDialog({ mode: 'new' }); setDraftName(''); setDraftScope(''); setDraftEvidence('')
      }}><IconPlusOutlineRegular size={14} />{t('projectAssetsNewCompany')}</Button>
      <Button variant="outline" disabled={disabled || companies.length === 0} onClick={() => {
        setAssetCompany(companies[0]?.id ?? ''); setAssetEditId(undefined); setAssetValue(''); setAssetKind(category === 'company' ? 'domain' : category); setAssetOpen(true)
      }}><IconPlusOutlineRegular size={14} />{t('recordsAddAsset')}</Button>
    </div></header>
    <div className={css.toolbar}>
      <div className={css.tabs} role="group" aria-label={t('kind')}>{categories.map(item => <button key={item.key}
        type="button" aria-pressed={category === item.key} className={category === item.key ? css.active : undefined}
        onClick={() => { setCategory(item.key) }}><item.icon size={14} />{t(item.label)}
        <span>{item.key === 'company' ? companies.length : assets.filter(asset => asset.kind === item.key).length}</span>
      </button>)}</div>
      <Input icon={<IconSearchOutlineRegular size={14} />} className={css.search as string}
        aria-label={t('projectAssetsSearch')} placeholder={t('projectAssetsSearch')} value={search}
        onChange={(event) => { setSearch(event.target.value) }} />
    </div>
    <div className={css.tableFrame}><div className={css.tableScroll}><table className={css.table}>
      <thead><tr><th>{t(category === 'company' ? 'projectAssetsCompany' : 'name')}</th>
        <th>{t(category === 'company' ? 'projectAssetsAssetCount' : 'projectAssetsCompany')}</th>
        <th>{t(category === 'company' ? 'projectAssetsScope' : 'projectAssetsSource')}</th><th>{t('actions')}</th></tr></thead>
      <tbody>{category === 'company' ? filteredCompanies.map(item => <tr key={item.id}>
        <td><div className={css.companyName}><span className={css.avatar}>{item.name.slice(0, 1)}</span>{item.name}</div></td>
        <td className={css.count}>{assets.filter(asset => asset.companyId === item.id).length}</td>
        <td><div className={css.chips}>{item.scope.map(target => <span key={target.value}>{target.value}</span>)}</div></td>
        <td><div className={css.actions}><Button variant="outline" size="sm" disabled={disabled} onClick={() => { openCompany(item, 'edit') }}>
          {t('projectAssetsEdit')}</Button><Button variant="outline" size="sm" disabled={disabled} onClick={() => { openCompany(item, 'append') }}>
          {t('projectAssetsAppend')}</Button><Button variant="ghost" size="sm" aria-label={`${t('projectAssetsDelete')}: ${item.name}`}
          disabled={disabled} onClick={() => {
            void persist({ ...records,
              companies: companies.filter(value => value.id !== item.id), assets: assets.filter(value => value.companyId !== item.id),
            })
          }}>
          <IconTrashOutlineRegular size={14} /></Button></div></td>
      </tr>) : filteredAssets.map(item => <tr key={item.id}><td>{item.value}</td>
        <td>{companies.find(owner => owner.id === item.companyId)?.name}</td><td>{t('recordsManual')}</td>
        <td><div className={css.actions}><Button variant="outline" size="sm" disabled={disabled} onClick={() => {
          setAssetEditId(item.id); setAssetCompany(item.companyId); setAssetKind(item.kind); setAssetValue(item.value); setAssetOpen(true)
        }}>{t('projectAssetsEdit')}</Button><Button variant="ghost" size="sm" aria-label={`${t('projectAssetsDelete')}: ${item.value}`}
          disabled={disabled} onClick={() => {
            void persist({ ...records, assets: assets.filter(asset => asset.id !== item.id) })
          }}><IconTrashOutlineRegular size={14} /></Button></div></td>
      </tr>)}</tbody>
    </table>{(category === 'company' ? filteredCompanies.length : filteredAssets.length) === 0
      && <p className={css.empty}>{t('projectAssetsEmpty')}</p>}</div></div>
    <p role="status" className={css.preview}>{t('recordsScopeNotice')}</p>
    <Modal open={dialog !== undefined} className={css.modal as string} title={modalTitle} closeLabel={t('close')}
      description={t('recordsScopeNotice')}
      onClose={() => { setDialog(undefined) }}>
      <form className={css.form} onSubmit={(event) => { event.preventDefault(); void save() }}>
        {dialog?.mode !== 'append' && <label>{t('projectAssetsCompanyName')}<Input value={draftName}
          onChange={(event) => { setDraftName(event.target.value) }} /></label>}
        <label htmlFor={`${prefix}-scope`}>{t('projectAssetsScope')}</label><p className={css.hint}>{t('projectAssetsScopeHint')}</p>
        <textarea id={`${prefix}-scope`} className={css.textarea} rows={6} value={draftScope}
          onChange={(event) => { setDraftScope(event.target.value) }} />
        <div className={css.parsed}><span>{t('projectAssetsDetected')} {valid.length}</span>
          {(['domain', 'ip', 'cidr'] as const).map(kind => <span className={css.parsedChip} key={kind}>
            {t(kind)} {valid.filter(target => target.kind === kind).length}</span>)}</div>
        {invalid.length > 0 && <p className={css.error}>{t('projectAssetsInvalid')}: {invalid.join(', ')}</p>}
        {parsed.duplicates.length > 0 && <p className={css.hint}>{t('projectAssetsDuplicates')}: {parsed.duplicates.join(', ')}</p>}
        <label>{t('projectAssetsEvidence')}<Input placeholder={t('projectAssetsEvidenceHint')} value={draftEvidence}
          onChange={(event) => { setDraftEvidence(event.target.value) }} /></label>
        <p className={css.hint}>{t('recordsScopeNotice')}</p>
        <div className={css.footer}><Button type="button" onClick={() => { setDialog(undefined) }}>{t('cancel')}</Button>
          <Button type="submit" variant="primary" disabled={disabled || invalid.length > 0 || (dialog?.mode !== 'append' && !draftName.trim())}>
            {t(dialog?.mode === 'append' ? 'projectAssetsSaveAppend' : dialog?.mode === 'new' ? 'create' : 'projectAssetsReplace')}
          </Button></div>
      </form>
    </Modal>
    <Modal open={assetOpen} title={t(assetEditId ? 'projectAssetsEdit' : 'recordsAddAsset')} closeLabel={t('close')} onClose={() => { setAssetOpen(false) }}>
      <form className={css.form} onSubmit={(event) => { event.preventDefault(); if (disabled || !assetValue.trim() || !assetCompany) return
        const edited = {
          id: assetEditId ?? randomUUID(), companyId: assetCompany, kind: assetKind, value: assetValue.trim(),
        }
        void persist({ ...records,
          assets: assetEditId ? assets.map(asset => asset.id === assetEditId ? edited : asset) : [...assets, edited],
        })
          .then((saved) => { if (saved) setAssetOpen(false) })
      }}>
        <label>{t('projectAssetsCompany')}<select value={assetCompany} onChange={(event) => { setAssetCompany(event.target.value) }}>
          {companies.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label>{t('kind')}<select value={assetKind} onChange={(event) => {
          const value = categories.find(item => item.key === event.target.value)?.key
          if (value && value !== 'company') setAssetKind(value)
        }}>{categories.filter(item => item.key !== 'company').map(item => <option key={item.key} value={item.key}>{t(item.label)}</option>)}</select></label>
        <label>{t('name')}<Input value={assetValue} onChange={(event) => { setAssetValue(event.target.value) }} /></label>
        <Button type="submit" variant="primary" disabled={disabled || !assetValue.trim() || !assetCompany}>{t('create')}</Button>
      </form>
    </Modal>
  </section>
}
