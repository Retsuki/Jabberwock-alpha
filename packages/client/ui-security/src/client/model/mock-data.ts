import { buildFindings } from './sample-findings.ts'
import type { Agent, CoverageEdge, CoverageNode, Project, TaskInfo, Target, Ticket } from './types.ts'

/** Migrated prototype task. */
export const task: TaskInfo = {
  id: 't-acme-web',
  name: 'Acme 公式サイトと管理画面の外部ペネトレーションテスト（acme.com）',
  description: 'acme.com の管理画面の権限を取得し、ユーザーの機密データを読み取れることを確認する。',
  llmStatus: 'LLM 設定済み',
  state: '探索中',
  tabs: ['セッション', '概要', '探索経路', '発見', 'テスト対象資産', '資産カバレッジ図', '遮断承認', 'レポート'],
  activeTab: '資産カバレッジ図',
}

/** Migrated prototype coverage nodes. */
export const coverageNodes: CoverageNode[] = [
  { key: 'c:1', kind: 'company', label: 'Acme Corp', tested: false, inScope: false },
  { key: 'a:1', kind: 'root_domain', label: 'acme.com', tested: false, inScope: false },
  { key: 'a:2', kind: 'subdomain', label: 'www.acme.com', tested: true, inScope: true },
  { key: 'a:3', kind: 'subdomain', label: 'api.acme.com', tested: true, inScope: true },
  { key: 'a:4', kind: 'subdomain', label: 'admin.acme.com', tested: false, inScope: true },
  { key: 'a:5', kind: 'service', label: 'www.acme.com', tested: true, inScope: true, port: 443, pageTitle: 'Acme トップ', statusCode: 200 },
  { key: 'a:6', kind: 'endpoint', label: 'https://www.acme.com/search', tested: true, inScope: true, url: 'https://www.acme.com/search' },
  { key: 'a:7', kind: 'service', label: 'api.acme.com', tested: true, inScope: true, port: 443, pageTitle: 'API Gateway', statusCode: 401 },
  { key: 'a:8', kind: 'endpoint', label: 'https://api.acme.com/v1/orders', tested: false, inScope: true, url: 'https://api.acme.com/v1/orders' },
  { key: 'a:9', kind: 'service', label: 'admin.acme.com', tested: false, inScope: true, port: 443, pageTitle: '管理画面ログイン', statusCode: 200 },
  { key: 'a:10', kind: 'ip', label: '203.0.113.10', tested: true, inScope: true },
]
/** Migrated prototype coverage edges. */
export const coverageEdges: CoverageEdge[] = [
  { source: 'a:1', target: 'c:1' },
  { source: 'a:2', target: 'a:1' },
  { source: 'a:3', target: 'a:1' },
  { source: 'a:4', target: 'a:1' },
  { source: 'a:5', target: 'a:2' },
  { source: 'a:6', target: 'a:5' },
  { source: 'a:7', target: 'a:3' },
  { source: 'a:8', target: 'a:7' },
  { source: 'a:9', target: 'a:4' },
  { source: 'a:10', target: 'c:1' },
]

/** Migrated prototype initial targets. */
export const initialTargets: Target[] = [
  { id: 't1', value: 'https://www.acme.com', kind: 'url', status: 'tested', registeredAt: '2026-10-12' },
  { id: 't2', value: 'https://api.acme.com/v1', kind: 'url', status: 'testing', registeredAt: '2026-10-12' },
  { id: 't3', value: 'acme.com', kind: 'domain', status: 'tested', registeredAt: '2026-10-12' },
  { id: 't4', value: 'admin.acme.com', kind: 'domain', status: 'untested', registeredAt: '2026-10-14' },
  { id: 't5', value: '203.0.113.10', kind: 'ip', status: 'tested', registeredAt: '2026-10-12' },
  { id: 't6', value: '198.51.100.20', kind: 'ip', status: 'untested', registeredAt: '2026-10-15' },
  { id: 't7', value: '203.0.113.0/24', kind: 'cidr', status: 'untested', registeredAt: '2026-10-15' },
]

/** Migrated prototype initial tickets. */
export const initialTickets: Ticket[] = [
  {
    id: 'T-001',
    title: '公開ホストの疎通確認',
    description: '対象ホストが到達可能で、テスト範囲に入っていることを確認する。',
    category: '偵察',
    priority: 'medium',
    status: 'done',
    targets: ['203.0.113.10'],
    source: 'manual',
    result: { findings: [] },
  },
  {
    id: 'T-003',
    title: '管理画面ログインの総当たり耐性確認',
    description: 'ログイン試行の回数制限とアカウントロックの有無を確認する。',
    category: '認証',
    priority: 'high',
    status: 'done',
    targets: ['admin.acme.com'],
    source: 'manual',
    result: {
      findings: buildFindings(
        { id: 'T-003', title: '管理画面ログインの総当たり耐性確認', targets: ['admin.acme.com'] },
        { critical: 1, high: 1, medium: 0, low: 2 },
        '2026-10-16T09:20:00+09:00',
      ).map((f, i) => (i === 0 ? { ...f, status: 'confirmed' as const } : f)),
    },
  },
  {
    id: 'T-002',
    title: 'API の認証方式の調査',
    description: 'API Gateway が返す 401 の条件と、認証トークンの形式を調べる。',
    category: '認証',
    priority: 'medium',
    status: 'doing',
    targets: ['https://api.acme.com/v1'],
    source: 'manual',
  },
]

/** Migrated prototype initial projects. */
export const initialProjects: Project[] = [
  { id: 'acme', name: 'Acme 外部診断' },
  { id: 'internal', name: '社内アプリ検証' },
]

/** Migrated prototype initial agents. */
export const initialAgents: Agent[] = [
  {
    id: 'A-001',
    name: '認証調査エージェント',
    taskIds: ['T-002'],
    status: 'running',
    activity: 'API Gateway が 401 を返す条件を調べています',
  },
  {
    id: 'A-002',
    name: '管理画面診断エージェント',
    taskIds: ['T-003'],
    status: 'done',
    activity: '完了しました（脆弱性 4 件を報告）',
  },
  {
    id: 'A-003',
    name: '疎通確認エージェント',
    taskIds: ['T-001'],
    status: 'done',
    activity: '完了しました（脆弱性なし）',
  },
]
