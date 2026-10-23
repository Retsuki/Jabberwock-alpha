import { describe, expect, it } from 'vitest'
import { compileWorkerPolicy, validateLocalHttpOrigins } from '../src/worker-policy.ts'
import type { SecurityAsset, SecurityTask } from '../src/security-records.ts'
const asset: SecurityAsset = { id: 'a', companyId: 'c', kind: 'domain', value: 'example.org' }
const task: SecurityTask = { id: 't', name: 'test', description: '', objective: '', status: 'draft', assetIds: ['a'], archived: false, pinned: false, createdAt: 0, updatedAt: 0 }
const publicIp = [{ address: '93.184.216.34', family: 4 as const }]
describe('bounded Worker scope compilation', () => {
  it('allows registered root domains and descendants without accepting suffix lookalikes', () => {
    const policy = compileWorkerPolicy(task, asset, 'https://example.org/')
    expect(() =>{  policy.checkAddresses(publicIp) }).not.toThrow()
    expect(() => compileWorkerPolicy(task, asset, 'https://other.example.org/path')).not.toThrow()
    expect(() => compileWorkerPolicy(task, asset, 'https://example.org.attacker.org/')).toThrow('registered hostname')
  })
  it('keeps registered subdomains exact and service paths on the same origin', () => {
    expect(() => compileWorkerPolicy(task, { ...asset, kind: 'subdomain' }, 'https://other.example.org/')).toThrow('registered hostname')
    const service: SecurityAsset = { ...asset, kind: 'service', value: 'https://example.org:8443/' }
    expect(() => compileWorkerPolicy(task, service, 'https://example.org:8443/status')).not.toThrow()
    expect(() => compileWorkerPolicy(task, service, 'https://example.org/status')).toThrow('service origin')
    expect(() => compileWorkerPolicy(task, service, 'https://other.example.org:8443/status')).toThrow('service origin')
  })
  it('denies excluded hostnames and URLs before DNS', () => {
    for (const rule of [
      { id: 'deny', action: 'deny' as const, kind: 'domain' as const, value: 'admin.example.org', note: '' },
      { id: 'deny', action: 'deny' as const, kind: 'url' as const, value: 'https://admin.example.org/private', note: '' },
    ]) expect(() => compileWorkerPolicy({ ...task, scopeRules: [rule] }, asset, 'https://admin.example.org/private')).toThrow('excluded')
    expect(() => compileWorkerPolicy({ ...task, scopeRules: [{ id: 'allow', action: 'allow', kind: 'domain', value: 'www.example.org', note: '' }] }, asset, 'https://admin.example.org/')).toThrow('outside allowed')
  })
  it('rejects credentials, query, fragment and unsupported protocols before transport', () => {
    for (const url of ['https://a:b@example.org/', 'https://example.org/?a=b', 'https://example.org/#a', 'file:///etc/passwd']) expect(() => compileWorkerPolicy(task, asset, url)).toThrow()
  })
  it('rejects any private address in the answer set', () => {
    const policy = compileWorkerPolicy(task, asset, 'https://example.org/')
    expect(() =>{  policy.checkAddresses([...publicIp, { address: '127.0.0.1', family: 4 }]) }).toThrow('non-public')
  })
  it('prioritizes exclusions over matching allow rules', () => {
    const policy = compileWorkerPolicy({ ...task, scopeRules: [
      { id: 'allow', action: 'allow', kind: 'domain', value: 'example.org', note: '' },
      { id: 'deny', action: 'deny', kind: 'cidr', value: '93.184.216.0/24', note: '' },
    ] }, asset, 'https://example.org/')
    expect(() =>{  policy.checkAddresses(publicIp) }).toThrow('excluded')
  })
  it('requires every resolved address to match an allow rule', () => {
    const policy = compileWorkerPolicy({ ...task, scopeRules: [{ id: 'allow', action: 'allow', kind: 'ip', value: '93.184.216.34', note: '' }] }, asset, 'https://example.org/')
    expect(() =>{  policy.checkAddresses([...publicIp, { address: '1.1.1.1', family: 4 }]) }).toThrow('outside allowed')
  })
  it('blocks unsupported natural language constraints and malformed rules', () => {
    expect(() => compileWorkerPolicy({ ...task, constraints: [{ id: 'x', action: 'allow', text: '個人情報を絶対に取得しない' }] }, asset, 'https://example.org/')).toThrow('個人情報を絶対に取得しない')
    expect(() => compileWorkerPolicy({ ...task, scopeRules: [{ id: 'x', action: 'deny', kind: 'cidr', value: 'invalid', note: '' }] }, asset, 'https://example.org/')).toThrow()
  })
  it('requires registered endpoint URLs to match exactly', () => {
    const endpoint: SecurityAsset = { ...asset, kind: 'endpoint', value: 'https://example.org/status' }
    expect(() => compileWorkerPolicy(task, endpoint, 'https://example.org/')).toThrow('equal')
    expect(() =>{  compileWorkerPolicy(task, endpoint, endpoint.value).checkAddresses(publicIp) }).not.toThrow()
  })
})

describe('saved operation constraints', () => {
  const constrained: SecurityTask = { ...task, constraints: [
    { id: 'scan', action: 'allow', text: 'ポートスキャン、稼働サービス／バージョンの検出' },
    { id: 'observe', action: 'allow', text: '既知脆弱性の軽量・非破壊な確認（バナー確認、安全なシグネチャ照合）' },
    ...['実際のエクスプロイト実行（攻撃コードの投入）', 'DoS／高負荷・ストレステスト', 'データの改ざん・削除、設定変更', 'ログイン総当たり（ブルートフォース）'].map((text, i) => ({ id: `deny${i}`, action: 'deny' as const, text })),
  ] }
  it('allows anonymous public GET observation under supported owner restrictions', () => {
    expect(() => { compileWorkerPolicy(constrained, asset, 'https://example.org/').checkAddresses(publicIp) }).not.toThrow()
    for (const url of ['https://user:secret@example.org/', 'https://example.org/?exploit=payload', 'file:///etc/passwd', 'https://evil.org/']) {
      expect(() => compileWorkerPolicy(constrained, asset, url)).toThrow()
    }
    expect(() => { compileWorkerPolicy(constrained, asset, 'https://example.org/').checkAddresses([{ address: '127.0.0.1', family: 4 }]) }).toThrow('non-public')
  })
  it('normalizes width and whitespace without interpreting extra conditions', () => {
    expect(() => compileWorkerPolicy({ ...task, constraints: [{ id: 'observe', action: 'allow', text: '  ＨＴＴＰ   ＧＥＴ ＯＮＬＹ。 ' }] }, asset, 'https://example.org/')).not.toThrow()
    expect(() => compileWorkerPolicy({ ...task, constraints: [{ id: 'observe', action: 'allow', text: '稼働サービス／バージョンの検出' }] }, asset, 'https://example.org/')).not.toThrow()
  })
  it('enforces HTTPS-only and GET prohibition before transport', () => {
    const httpsOnly: SecurityTask = { ...task, constraints: [{ id: 'https', action: 'allow', text: 'HTTPSのみ' }] }
    expect(() => compileWorkerPolicy(httpsOnly, asset, 'https://example.org/')).not.toThrow()
    expect(() => compileWorkerPolicy(httpsOnly, asset, 'http://example.org/')).toThrow('HTTP接続')
    expect(() => compileWorkerPolicy({ ...task, constraints: [{ id: 'observe', action: 'allow', text: 'GET only' }, { id: 'get', action: 'deny', text: 'GET' }] }, asset, 'https://example.org/')).toThrow('GET調査は禁止')
  })
  it('never ignores unknown, mixed, blank or contradictory operation descriptions', () => {
    for (const text of ['GET only except admins', 'GETのみ、個人情報は取得しない', '', '個人情報取得禁止', 'ポートスキャン']) {
      expect(() => compileWorkerPolicy({ ...task, constraints: [{ id: 'x', action: 'allow', text }] }, asset, 'https://example.org/')).toThrow()
    }
    expect(() => compileWorkerPolicy({ ...task, constraints: [{ id: 'x', action: 'deny', text: '公開情報の読み取りのみ' }] }, asset, 'https://example.org/')).toThrow('保証できません')
  })
  it('requires confirmed operation fingerprints to match while retaining old task compatibility', () => {
    const setup = { completionCondition: '', permission: { confirmed: true, assetIds: ['a'] }, scope: { confirmed: true, assetIds: ['a'], rules: '[]' }, operations: { confirmed: true, constraints: JSON.stringify(constrained.constraints) }, limits: '' }
    expect(() => compileWorkerPolicy({ ...constrained, setup }, asset, 'https://example.org/')).not.toThrow()
    expect(() => compileWorkerPolicy({ ...constrained, setup: { ...setup, operations: { confirmed: true, constraints: 'do not access /private' } } }, asset, 'https://example.org/')).toThrow('一致しません')
    expect(() => compileWorkerPolicy(task, asset, 'https://example.org/')).not.toThrow()
  })
})


describe('owner-only exact local test origin', () => {
  const origin = 'http://127.0.0.1:38123'
  const service: SecurityAsset = { ...asset, kind: 'service', value: origin }
  const loopback = [{ address: '127.0.0.1', family: 4 as const }]
  it('rejects aliases, private LAN, implicit/default ports and non-origin config', () => {
    expect(validateLocalHttpOrigins([origin])).toEqual([origin])
    for (const value of ['http://localhost:38123', 'http://127.1:38123', 'http://2130706433:38123', 'http://127.0.0.1', 'http://127.0.0.1:80', 'http://127.0.0.1:0', 'http://127.0.0.1:038123', 'http://127.0.0.1:38123/', 'https://127.0.0.1:38123', 'http://192.168.1.1:38123', 'http://[::1]:38123', origin + '?x', origin + '#x', 'http://u:p@127.0.0.1:38123']) {
      expect(() => validateLocalHttpOrigins([value])).toThrow()
    }
  })
  it('requires explicit origin and retains selected asset, exact port and endpoint boundaries', () => {
    expect(() => { compileWorkerPolicy(task, service, origin).checkAddresses(loopback) }).toThrow('non-public')
    expect(compileWorkerPolicy(task, service, origin, [origin]).local).toBe(true)
    expect(() => { compileWorkerPolicy(task, service, origin + '/status', [origin]).checkAddresses(loopback) }).not.toThrow()
    expect(() => compileWorkerPolicy({ ...task, assetIds: [] }, service, origin, [origin])).toThrow('selected')
    expect(() => compileWorkerPolicy(task, service, 'http://127.0.0.1:38124', [origin])).toThrow('service origin')
    expect(() => compileWorkerPolicy(task, { ...service, kind: 'endpoint', value: origin + '/status' }, origin, [origin])).toThrow('equal')
    expect(() => { compileWorkerPolicy(task, { ...service, kind: 'ip', value: '127.0.0.1' }, origin, [origin]).checkAddresses(loopback) }).not.toThrow()
    for (const value of ['http://127.1:38123/', 'http://2130706433:38123/', 'http://127.0.0.1:038123/']) expect(() => compileWorkerPolicy(task, service, value, [origin])).toThrow('canonical')
  })
  it('keeps exclusions, operation constraints and all-address pinning in effect', () => {
    const denied: SecurityTask = { ...task, scopeRules: [{ id: 'd', kind: 'ip', action: 'deny', value: '127.0.0.1', note: '' }] }
    expect(() => { compileWorkerPolicy(denied, service, origin, [origin]).checkAddresses(loopback) }).toThrow('excluded')
    expect(() => compileWorkerPolicy({ ...task, constraints: [{ id: 'x', action: 'allow', text: 'HTTPSのみ' }] }, service, origin, [origin])).toThrow('HTTP接続')
    const policy = compileWorkerPolicy(task, service, origin, [origin])
    for (const addresses of [[], [...loopback, ...publicIp], [{ address: '127.0.0.2', family: 4 as const }], [{ address: '127.0.0.1', family: 6 as const }]]) expect(() => { policy.checkAddresses(addresses) }).toThrow('exact IPv4')
  })
})


describe('saved anonymous GET capability descriptions', () => {
  const service: SecurityAsset = { ...asset, kind: 'service', value: 'https://example.org:8443' }
  const saved: NonNullable<SecurityTask['constraints']> = [
    { id: 'a', action: 'allow', text: '匿名GETリクエストのみ許可する' },
    { id: 'b', action: 'deny', text: 'POST・PUT・DELETE等の変更を伴うリクエストは禁止' },
    { id: 'c', action: 'deny', text: 'ログインや認証情報の使用は禁止' },
    { id: 'd', action: 'deny', text: '対象origin外部への接続は禁止' },
  ]
  it('compiles the saved descriptions only for the immutable anonymous GET capabilities', () => {
    expect(() => { compileWorkerPolicy({ ...task, constraints: saved }, service, service.value + '/status').checkAddresses(publicIp) }).not.toThrow()
    for (const constraint of saved.slice(0, 3)) {
      expect(() => compileWorkerPolicy({ ...task, constraints: [constraint] }, service, service.value)).not.toThrow()
      expect(() => compileWorkerPolicy({ ...task, constraints: [constraint] }, service, 'https://user:secret@example.org:8443')).toThrow()
    }
  })
  it('enforces explicit origin and rejects domain/IP targets without a registered origin', () => {
    const constraints = saved.slice(3)
    for (const value of ['https://other.example.org:8443', 'http://example.org:8443', 'https://example.org:8444']) {
      expect(() => compileWorkerPolicy({ ...task, constraints }, service, value)).toThrow('同一origin')
    }
    for (const target of [asset, { ...asset, kind: 'ip' as const, value: '93.184.216.34' }]) {
      expect(() => compileWorkerPolicy({ ...task, constraints }, target, 'https://' + target.value)).toThrow('同一origin')
    }
    expect(() => compileWorkerPolicy({ ...task, constraints }, { ...service, kind: 'endpoint', value: service.value + '/status' }, service.value + '/status')).not.toThrow()
  })
  it('never accepts reversed permissions, extra conditions or unknown natural-language constraints', () => {
    for (const constraint of [
      ...saved.map(value => ({ ...value, action: value.action === 'allow' ? 'deny' as const : 'allow' as const })),
      ...saved.map(value => ({ ...value, text: value.text + '、個人情報は取得しない' })),
    ]) expect(() => compileWorkerPolicy({ ...task, constraints: [constraint] }, service, service.value)).toThrow()
  })
})


describe('HTTP tool permissions', () => {
  const tool = { method: 'GET', authenticated: false }
  it('accepts query URLs only through tool admission and keeps URL rules exact', () => {
    expect(() => compileWorkerPolicy(task, asset, 'https://example.org/?q=test', [], tool)).not.toThrow()
    const scoped = { ...task, scopeRules: [{ id: 'q', action: 'allow' as const, kind: 'url' as const, value: 'https://example.org/?q=test', note: '' }] }
    expect(() => compileWorkerPolicy(scoped, asset, 'https://example.org/?q=test', [], tool)).not.toThrow()
    expect(() => compileWorkerPolicy(scoped, asset, 'https://example.org/?q=other', [], tool)).toThrow('outside allowed')
    expect(() => compileWorkerPolicy({ ...task, constraints: [{ id: 'x', action: 'deny', text: 'exploit execution' }] }, asset, 'https://example.org/?payload=x', [], tool)).toThrow('cannot be guaranteed')
  })
  it('requires explicit method and credential permission and enforces denials', () => {
    const post = { method: 'POST', authenticated: true }
    expect(() => compileWorkerPolicy(task, asset, 'https://example.org/', [], post)).toThrow('Explicit allow')
    const allowed = { ...task, constraints: [{ id: 'p', action: 'allow' as const, text: 'POST' }, { id: 'a', action: 'allow' as const, text: '認証情報の送信' }] }
    expect(() => compileWorkerPolicy(allowed, asset, 'https://example.org/', [], post)).not.toThrow()
    expect(() => compileWorkerPolicy({ ...allowed, constraints: [...allowed.constraints, { id: 'g', action: 'allow', text: 'GET only' }] }, asset, 'https://example.org/', [], post)).toThrow('GET-only')
    expect(() => compileWorkerPolicy({ ...allowed, constraints: [...allowed.constraints, { id: 'd', action: 'deny', text: 'ログインや認証情報の使用は禁止' }] }, asset, 'https://example.org/', [], post)).toThrow('prohibited')
  })
})
