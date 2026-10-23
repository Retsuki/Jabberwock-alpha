/** Mounted task asset preview with no storage or diagnostic integration. */
import { useId, useState, type ReactNode } from 'react'
import { Button, Input, Modal, IconPlusOutlineRegular, IconSearchOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SecurityTranslate } from './presentation.tsx'
import css from './TaskAssets.module.css'
const categories = [
  { value: 'domain', label: 'taskAssetsDomain' }, { value: 'ip', label: 'taskAssetsIp' }, { value: 'subdomain', label: 'taskAssetsSubdomain' }, { value: 'app', label: 'taskAssetsApp' }, { value: 'service', label: 'taskAssetsService' }, { value: 'endpoint', label: 'taskAssetsEndpoint' },
] as const
type Category = typeof categories[number]['value']
type Asset = { id: string; kind: Category; value: string }
const initial: Asset[] = [{ id: 'sample-ip', kind: 'ip', value: '203.0.113.10' }, { id: 'sample-subdomain', kind: 'subdomain', value: 'www.acme.example' }, { id: 'sample-service', kind: 'service', value: 'https://www.acme.example:443' }]
/** Render task assets and a local-only add dialog.
 * @param props - localized security copy.
 * @returns category counts, simple search and preview asset rows.
 */
export function TaskAssets({ t }: { t: SecurityTranslate }): ReactNode {
  const prefix = useId()
  const [assets, setAssets] = useState(initial)
  const [category, setCategory] = useState<Category>('domain')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [draftKind, setDraftKind] = useState<Category>('domain')
  const rows = assets.filter(asset => asset.kind === category
    && asset.value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  return <section className={css.root} aria-label={t('taskAssetsTitle')}>
    <header className={css.heading}><div><h3>{t('taskAssetsTitle')}</h3><p>{t('taskAssetsCount')} · {assets.length}</p></div><Button variant="primary" onClick={() => { setDraftKind(category); setOpen(true) }}><IconPlusOutlineRegular size={14} />{t('taskAssetsAdd')}</Button></header>
    <div className={css.tabs} role="group" aria-label={t('kind')}>{categories.map(item => <button key={item.value} type="button" aria-pressed={category === item.value} className={category === item.value ? css.active : undefined} onClick={() => { setCategory(item.value) }}>{t(item.label)} <span>{assets.filter(asset => asset.kind === item.value).length}</span></button>)}</div>
    <Input icon={<IconSearchOutlineRegular size={15} />} className={css.search as string} placeholder={t('taskAssetsSearch')} aria-label={t('taskAssetsSearch')} aria-describedby={`${prefix}-search-hint`} value={search} onChange={(event) => { setSearch(event.target.value) }} /><p id={`${prefix}-search-hint`} className={css.hint}>{t('taskAssetsSearchHint')}</p>
    <div className={css.tableWrap}><table className={css.table}><thead><tr><th>{t('taskAssetsName')}</th><th>{t('taskAssetsSource')}</th><th>{t('taskAssetsActions')}</th></tr></thead><tbody>{rows.map(asset => <tr key={asset.id}><td>{asset.value}</td><td>{t('coverageSample')}</td><td><Button variant="ghost" size="sm" onClick={() => { setAssets(assets.filter(item => item.id !== asset.id)) }}>{t('taskAssetsRemove')}</Button></td></tr>)}</tbody></table>{rows.length === 0 && <p className={css.empty}>{t('taskAssetsEmpty')}</p>}</div>
    <p className={css.hint}>{t('taskAssetsPreview')}</p>
    <Modal open={open} title={t('taskAssetsAdd')} closeLabel={t('close')} onClose={() => { setOpen(false) }}><form className={css.form} onSubmit={(event) => { event.preventDefault(); if (!draft.trim()) return; setAssets([...assets, { id: `local-${Date.now()}`, kind: draftKind, value: draft.trim() }]); setCategory(draftKind); setSearch(''); setDraft(''); setOpen(false) }}><p className={css.hint}>{t('taskAssetsPreview')}</p><label>{t('kind')}<select className={css.select} value={draftKind} onChange={(event) => { const value = categories.find(item => item.value === event.target.value)?.value; if (value) setDraftKind(value) }}>{categories.map(item => <option key={item.value} value={item.value}>{t(item.label)}</option>)}</select></label><label>{t('taskAssetsName')}<Input placeholder={t('taskAssetsValue')} value={draft} onChange={(event) => { setDraft(event.target.value) }} /></label><div className={css.formActions}><Button type="button" onClick={() => { setOpen(false) }}>{t('taskAssetsCancel')}</Button><Button variant="primary" type="submit" disabled={!draft.trim()}>{t('taskAssetsAdd')}</Button></div></form></Modal>
  </section>
}
