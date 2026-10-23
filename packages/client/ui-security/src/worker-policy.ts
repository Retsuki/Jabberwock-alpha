/** Compile saved scope and explicit operation permissions before each pinned HTTP request. */
import { isIP } from 'node:net'
import ipaddr from 'ipaddr.js'
import { isPublicIpAddress, type PublicAddress } from '@deepseek-ai/dsh-web-fetch-http/network'
import type { SecurityAsset, SecurityTask } from './security-records.ts'

const hostOf = (url: URL): string => url.hostname.replace(/^\[|\]$/g, '')
const domain = (value: string): string => {
  const url = new URL(`https://${value}`)
  if (url.host !== url.hostname || url.pathname !== '/' || url.search || url.hash || url.username || url.password || isIP(hostOf(url)) || !url.hostname.includes('.')) throw new Error('Scope domain is invalid')
  return url.hostname
}
const httpUrl = (value: string, query = false): URL => {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash || (!query && url.search)) throw new Error('Only anonymous HTTP(S) URLs without query or fragment are supported')
  return url
}
/** Validate exact owner-configured loopback HTTP origins.
 * @param origins Explicit local test origins.
 * @returns Validated origins without alias normalization.
 */
export function validateLocalHttpOrigins(origins: readonly string[]): string[] {
  return origins.map((origin) => {
    const url = new URL(origin)
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || Number(url.port) === 0 || url.origin !== origin) {
      throw new Error('Local HTTP origins must be canonical http://127.0.0.1:<port> origins')
    }
    return origin
  })
}
// Saved operation descriptions retain their original GET-only semantics.
// Recognizing a permission never enables a transport or tool the executor does not provide.
const normalizeOperation = (text: string): string => text.normalize('NFKC').trim().replace(/\s+/gu, ' ').replace(/[。.!！]+$/u, '').toLowerCase()
const allowedObservations = new Set([
  'get only', 'http get only', 'read-only http get', '読み取り専用のhttp get',
  'getのみ', 'http getのみ', '公開情報の読み取りのみ', '匿名GETリクエストのみ許可する',
  'バナー確認', '安全なシグネチャ照合', '稼働サービス/バージョンの検出', 'サービス/バージョンの検出', 'httpバナー確認',
  '既知脆弱性の軽量・非破壊な確認（バナー確認、安全なシグネチャ照合）',
  'ポートスキャン、稼働サービス／バージョンの検出',
].map(normalizeOperation))
const unavailableOperations = new Set([
  '実際のエクスプロイト実行（攻撃コードの投入）',
  'dos／高負荷・ストレステスト', 'データの改ざん・削除、設定変更',
  'ログイン総当たり（ブルートフォース）', 'ブルートフォース', 'ログイン',
  '認証情報の送信', 'post', 'put', 'patch', 'delete', 'shell',
  'exploit execution', 'brute force', 'credential submission', 'stress testing',
].map(normalizeOperation))
// Exact saved phrases whose denied operations are absent from the anonymous GET transport.
const fixedCapabilityDenials = new Set([
  'POST・PUT・DELETE等の変更を伴うリクエストは禁止',
  'ログインや認証情報の使用は禁止',
].map(normalizeOperation))
function checkOperations(task: SecurityTask, asset: SecurityAsset, url: URL, method: string, authenticated: boolean): void {
  let methodAllowed = method === 'GET'
  let authAllowed = !authenticated
  const constraints = task.constraints ?? []
  if (task.setup?.operations.confirmed && task.setup.operations.constraints !== JSON.stringify(constraints)) {
    throw new Error('操作制約の確認内容が保存済みの制約と一致しません。主エージェントで操作制約を再確認してください。')
  }
  for (const constraint of constraints) {
    const text = normalizeOperation(constraint.text)
    if (constraint.action === 'allow' && (text === 'offline analysis' || text === normalizeOperation('オフライン解析'))) continue
    if (!text) throw new Error('空の操作制約があります。概要で内容を入力するか削除してください。')
    if (constraint.action === 'allow' && allowedObservations.has(text)) {
      if (method !== 'GET' || authenticated) throw new Error('Saved GET-only constraints prohibit this request')
      continue
    }
    if (/^(?:http )?(?:get|head|options|post|put|patch|delete)$/u.test(text)) {
      const named = text.replace(/^http /u, '').toUpperCase()
      if (named === method && constraint.action === 'deny') throw new Error(`${method}調査は禁止されています。`)
      if (named === method && constraint.action === 'allow') methodAllowed = true
      continue
    }
    if (['認証情報の送信', 'credential submission'].includes(text)) {
      if (constraint.action === 'deny' && authenticated) throw new Error('Credential submission is prohibited')
      if (constraint.action === 'allow') authAllowed = true
      continue
    }
    if (constraint.action === 'deny' && fixedCapabilityDenials.has(text)) {
      if (text === normalizeOperation('POST・PUT・DELETE等の変更を伴うリクエストは禁止') && !['GET', 'HEAD', 'OPTIONS'].includes(method)) throw new Error('State-changing requests are prohibited')
      if (text === normalizeOperation('ログインや認証情報の使用は禁止') && authenticated) throw new Error('Credential submission is prohibited')
      continue
    }
    if (constraint.action === 'deny' && text === normalizeOperation('対象origin外部への接続は禁止')) {
      if ((asset.kind !== 'service' && asset.kind !== 'endpoint') || httpUrl(asset.value).origin !== url.origin) {
        throw new Error(`操作制約「${constraint.text}」には登録されたserviceまたはendpointの同一originが必要です。`)
      }
      continue
    }
    if (constraint.action === 'deny' && unavailableOperations.has(text.replace(/(?:を)?禁止$/u, ''))) {
      if (url.search || !['GET', 'HEAD', 'OPTIONS'].includes(method) || authenticated) throw new Error('Saved operation restrictions cannot be guaranteed for this request')
      continue
    }
    if (text === 'httpsのみ' || text === 'https only') {
      if (constraint.action !== 'allow') throw new Error(`操作制約「${constraint.text}」を実行条件へ変換できません。概要で許可・除外範囲を指定してください。`)
      if (url.protocol !== 'https:') throw new Error(`操作制約「${constraint.text}」によりHTTP接続は許可されていません。`)
      continue
    }
    if (constraint.action === 'deny' && /^(?:http )?get$/u.test(text)) {
      throw new Error(`操作制約「${constraint.text}」によりGET調査は禁止されています。`)
    }
    throw new Error(`操作制約「${constraint.text}」を現在のHTTP調査で保証できません。対応する操作を明記するか、概要の許可・除外範囲で対象を指定してください。`)
  }
  if (!methodAllowed) throw new Error(`Explicit allow constraint required for HTTP ${method}`)
  if (!authAllowed) throw new Error('Explicit credential submission permission required')
}
/** Validate registered target and compile every saved rule before DNS or model access.
 * @param task Current saved task.
 * @param asset Selected registered asset.
 * @param input Proposed URL within the registered asset.
 * @param localHttpOrigins Explicit owner-configured loopback exceptions.
 * @param request Explicit tool request capability; absent retains legacy query rejection.
 * @returns URL and a scope check for the complete pinned DNS answer set.
 */
export function compileWorkerPolicy(
  task: SecurityTask, asset: SecurityAsset, input: string, localHttpOrigins: readonly string[] = [],
  request?: { method: string; authenticated: boolean },
): { url: URL; local: boolean; checkAddresses(addresses: readonly PublicAddress[]): void } {
  const url = httpUrl(input, !!request)
  const local = validateLocalHttpOrigins(localHttpOrigins).includes(url.origin)
  if (local && input !== url.origin && !input.startsWith(`${url.origin}/`)) throw new Error('Local Worker URL must use its canonical origin')
  checkOperations(task, asset, url, request?.method ?? 'GET', request?.authenticated ?? false)
  if (!task.assetIds.includes(asset.id)) throw new Error('Worker target is not a selected asset')
  if (asset.kind === 'domain' || asset.kind === 'subdomain') {
    const expected = domain(asset.value)
    if (url.hostname !== expected && (asset.kind !== 'domain' || !url.hostname.endsWith(`.${expected}`))) throw new Error('Worker URL must use the registered hostname or authorized domain descendants')
  } else if (asset.kind === 'ip') {
    if (!isIP(asset.value) || hostOf(url) !== asset.value || (!isPublicIpAddress(asset.value) && !local)) throw new Error('Worker URL must use the exact public registered IP')
  } else if (asset.kind === 'endpoint' || asset.kind === 'service') {
    const registered = httpUrl(asset.value, !!request)
    if (asset.kind === 'service' ? url.origin !== registered.origin : url.href !== registered.href) throw new Error('Worker URL must equal the registered endpoint or use the registered service origin')
  } else throw new Error('This asset type does not define an executable HTTP target')
  const rules = (task.scopeRules ?? []).map((rule) => {
    const value = rule.value.trim()
    if (!value) throw new Error('Complete or remove all scope rules before execution')
    switch (rule.kind) {
      case 'domain': {
        const expected = domain(value)
        return { action: rule.action, addressDependent: false, matches: (_addresses: readonly PublicAddress[]) => url.hostname === expected || url.hostname.endsWith(`.${expected}`) }
      }
      case 'url': {
        const expected = httpUrl(value, !!request).href
        return { action: rule.action, addressDependent: false, matches: (_addresses: readonly PublicAddress[]) => url.href === expected }
      }
      case 'ip': {
        if (!isIP(value)) throw new Error('Scope IP is invalid')
        const expected = ipaddr.process(value).toString()
        return { action: rule.action, addressDependent: true, matches: (addresses: readonly PublicAddress[]) =>
          addresses.some(address => ipaddr.process(address.address).toString() === expected) }
      }
      case 'cidr': {
        const range = ipaddr.parseCIDR(value)
        return { action: rule.action, addressDependent: true, matches: (addresses: readonly PublicAddress[]) =>
          addresses.some((address) => {
            const parsed = ipaddr.process(address.address)
            return parsed.kind() === range[0].kind() && parsed.match(range)
          }) }
      }
    }
  })
  if (rules.some(rule => !rule.addressDependent && rule.action === 'deny' && rule.matches([]))) throw new Error('Worker target matches an excluded scope rule')
  const allows = rules.filter(rule => rule.action === 'allow')
  if (allows.length && allows.every(rule => !rule.addressDependent) && !allows.some(rule => rule.matches([]))) throw new Error('Worker target is outside allowed scope')
  return { url, local, checkAddresses(addresses) {
    if (local && (!addresses.length || addresses.some(address => address.address !== '127.0.0.1' || address.family !== 4))) throw new Error('Local Worker target must use only the exact IPv4 loopback address')
    if (!local && (!addresses.length || addresses.some(address => !isPublicIpAddress(address.address)))) throw new Error('Worker target resolves to a non-public address')
    if (rules.some(rule => rule.action === 'deny' && rule.matches(addresses))) throw new Error('Worker target matches an excluded scope rule')
    if (rules.some(rule => rule.action === 'allow') && !addresses.every(address => rules.some(rule => rule.action === 'allow' && rule.matches([address])))) throw new Error('Worker target is outside allowed scope')
  } }
}
