import { DEFAULT_MODEL_ID } from '../models.ts'
import type { ProjectData, Ticket } from '../types.ts'
import type { DiagnosticTask } from './types.ts'

const at = '2026-10-17T09:00:00+09:00'

/** Create an unexecuted diagnostic record.
 * @param projectId - owning project id.
 * @param id - diagnostic id.
 * @param name - human-readable name.
 * @param description - task description.
 * @param objective - diagnostic objective.
 * @param targetIds - scoped asset ids.
 * @returns pending diagnostic with no test results.
 */
export function emptyDiagnostic(
  projectId: string,
  id: string,
  name: string,
  description = '',
  objective = '',
  targetIds: string[] = [],
): DiagnosticTask {
  return {
    id,
    projectId,
    name,
    description,
    objective,
    targetIds,
    status: 'pending',
    model: DEFAULT_MODEL_ID,
    createdAt: at,
    goals: [],
    constraints: [],
    assetRules: [],
    planner: { status: 'idle', rounds: [] },
    workerSlots: 3,
    sessions: [
      {
        id: `${id}-main`,
        kind: 'main',
        title: '主Agent',
        messages: [
          {
            id: `${id}-welcome`,
            at,
            role: 'assistant',
            text: '対象と目標を確認して、調査を進めましょう。これは外部へ通信しないモック実行です。',
          },
        ],
      },
    ],
    facts: [],
    hints: [],
    events: [],
    approvals: [],
    retests: [],
    usage: [],
  }
}
/** Reconstruct prototype diagnostic records without invoking a runner.
 * @param projectId - owning project id.
 * @param data - project fixture or restored data.
 * @param fresh - whether to include the original sample timeline.
 * @returns project data with diagnostic records.
 */
export function initializeDiagnostics(
  projectId: string,
  data: ProjectData,
  fresh = false,
): ProjectData {
  if (data.diagnostics)
    return {
      ...data,
      diagnostics: data.diagnostics.map(task => ({
        ...task,
        sessions: task.sessions.map(s => ({
          ...s,
          messages: s.messages.map(m =>
            m.pending ? { ...m, pending: false } : m,
          ),
        })),
        retests: task.retests.map(r =>
          r.status === 'running'
            ? {
              ...r,
              status: 'stopped',
              finishedAt: new Date().toISOString(),
              log: [
                ...r.log,
                '画面の再読み込みによりモック検証を中断しました',
              ],
            }
            : r,
        ),
      })),
    }
  if (!data.tickets.length && !fresh) return { ...data, diagnostics: [] }
  let tickets: Ticket[] = data.tickets.map(t => ({
    ...t,
    diagnosticTaskId: t.diagnosticTaskId ?? 'D-001',
  }))
  if (fresh) {
    const extra: Ticket[] = [
      {
        id: 'T-004',
        title: '公開APIのアクセス制御を確認',
        description: '権限境界と応答を確認する。',
        category: 'アクセス制御',
        priority: 'high',
        status: 'review',
        targets: ['https://api.acme.com/v1'],
        source: 'ai',
        diagnosticTaskId: 'D-001',
        derivedFromFactIds: ['FCT-2'],
      },
      {
        id: 'T-005',
        title: 'セキュリティヘッダーを確認',
        description: '公開ページの応答ヘッダーを確認する。',
        category: '設定',
        priority: 'medium',
        status: 'todo',
        targets: ['https://www.acme.com'],
        source: 'ai',
        diagnosticTaskId: 'D-001',
      },
      {
        id: 'T-006',
        title: '認証設定の確認',
        description: '確認済みの設定と追加調査の必要性を整理する。',
        category: '認証',
        priority: 'medium',
        status: 'done',
        targets: ['admin.acme.com'],
        source: 'ai',
        result: { findings: [] },
        diagnosticTaskId: 'D-001',
      },
    ]
    tickets = [...tickets, ...extra].map(ticket => ({
      ...ticket,
      goalIds: [ticket.id === 'T-003' || ticket.id === 'T-006' ? 'G-001' : 'G-002'],
    }))
  }
  const task = emptyDiagnostic(
    projectId,
    'D-001',
    fresh ? 'Acme 公開サービスの診断' : '既存の調査',
    '公開サイト・API・管理画面を対象にした診断案件です。',
    '認証・アクセス制御と公開設定を確認し、根拠と未確認箇所を報告する。',
    data.targets.map(t => t.id),
  )
  const findings = tickets.flatMap(t => t.result?.findings ?? [])
  const active = tickets.some(
    t => t.status === 'doing' || t.status === 'review',
  )
  task.status = active
    ? 'running'
    : tickets.every(t => t.status === 'done')
      ? 'completed'
      : 'pending'
  task.startedAt = active ? at : undefined
  task.completedAt = task.status === 'completed' ? at : undefined
  if (fresh) {
    task.sessions[0]?.messages.push({
      id: 'D-001-brief',
      at,
      role: 'assistant',
      text: `公開サイト・API・管理画面を対象に、${tickets.length}件の調査を進めています。認証設定から${findings.length}件の発見を記録しました。APIの追加確認は実行承認待ちです。Plannerの計画や各Workerの記録を左の一覧から確認できます。（デモデータ）`,
    })
  }
  task.goals = [
    {
      id: 'G-001',
      text: '認証設定のリスクを確認する',
      status: findings.length ? 'achieved' : 'open',
      evidenceFindingIds: findings.slice(0, 2).map(f => f.id),
      updatedAt: at,
    },
    {
      id: 'G-002',
      text: 'APIのアクセス制御と未確認箇所を整理する',
      status: 'open',
      evidenceFindingIds: [],
      updatedAt: at,
    },
  ]
  task.constraints = [
    {
      id: 'C-001',
      kind: 'deny',
      text: 'データの変更・削除やサービス停止につながる操作は行わない',
    },
  ]
  task.planner = {
    status: active ? 'waiting' : 'idle',
    rounds: [
      {
        id: 'P-001',
        round: 1,
        at,
        summary: '対象と認証方式を確認する調査を計画',
        decisions: ['独立した調査を並列に進める'],
        createdTicketIds: tickets.slice(0, 3).map(t => t.id),
      },
      {
        id: 'P-002',
        round: 2,
        at,
        summary: '既存の結果を踏まえ、設定と権限境界の確認を追加',
        decisions: ['根拠が不足する項目は未確認として残す'],
        createdTicketIds: tickets.slice(3).map(t => t.id),
      },
    ],
  }
  task.sessions.push(
    ...tickets
      .filter(t => t.status !== 'todo')
      .map((t, i) => ({
        id: `S-${t.id}`,
        kind: 'worker' as const,
        title: t.title,
        ticketId: t.id,
        slot: (i % 3) + 1,
        status:
          t.status === 'done'
            ? ('done' as const)
            : t.status === 'review'
              ? ('waiting' as const)
              : ('running' as const),
        startedAt: at,
        endedAt: t.status === 'done' ? at : undefined,
        messages: [
          {
            id: `M-${t.id}-1`,
            at,
            role: 'system' as const,
            text: t.description,
          },
          {
            id: `M-${t.id}-2`,
            at,
            role: 'tool' as const,
            text: '保存済みデモ応答の確認',
            tool: {
              name: 'http.inspect',
              args: JSON.stringify({ target: t.targets[0] }),
              result: 'HTTP 200 · デモ応答。外部通信は実行していません。',
            },
          },
          {
            id: `M-${t.id}-3`,
            at,
            role: 'assistant' as const,
            text:
              t.status === 'done'
                ? '調査結果と根拠を記録しました。'
                : '確認項目を整理しています。',
          },
        ],
      })),
  )
  task.facts = tickets
    .filter(t => t.status === 'done')
    .map((t, i) => ({
      id: `FCT-${i + 1}`,
      text: `${t.title}の観察結果を記録`,
      ticketId: t.id,
      at,
      assetValue: t.targets[0],
      evidence: '保存済みの調査結果を参照',
    }))
  task.hints = [
    {
      id: 'H-001',
      text: '認証とアクセス制御を優先して確認してください。',
      from: 'human',
      at,
    },
  ]
  task.events = tickets.map((t, i) => ({
    id: `E-${i + 1}`,
    at,
    kind: 'intent_added',
    source: 'planner',
    text: t.title,
    refs: { ticketId: t.id, ...(task.sessions.some(s => s.id === `S-${t.id}`) ? { sessionId: `S-${t.id}` } : {}) },
  }))
  task.events.push(
    ...findings.map((f, i) => ({
      id: `E-F-${i}`,
      at: f.foundAt,
      kind: 'finding' as const,
      source: 'worker' as const,
      text: f.title,
      refs: { findingId: f.id },
    })),
  )
  if (task.facts[0]) task.events.push({ id: 'E-FACT-1', at, kind: 'fact', source: 'worker', text: task.facts[0].text, refs: { factId: task.facts[0].id, ticketId: task.facts[0].ticketId } })
  if (task.hints[0]) task.events.push({ id: 'E-HINT-1', at, kind: 'hint', source: 'user', text: task.hints[0].text, refs: { hintId: task.hints[0].id } })
  const review = tickets.find(t => t.status === 'review')
  if (review)
    task.approvals = [
      {
        id: 'APR-001',
        ticketId: review.id,
        sessionId: `S-${review.id}`,
        requestedBy: 'Worker',
        action: '追加の権限境界確認',
        target: review.targets[0] ?? '',
        reason: '次の確認に進む前に対象と操作条件の判断が必要です。',
        at,
        status: 'pending',
      },
      {
        id: 'APR-002',
        ticketId: review.id,
        requestedBy: 'Worker',
        action: '公開レスポンスの確認',
        target: review.targets[0] ?? '',
        reason: '確認条件のレビュー',
        at,
        status: 'approved',
        decidedAt: at,
      },
    ]
  if (findings[0])
    task.retests = [
      {
        id: 'RT-001',
        findingId: findings[0].id,
        status: 'finished',
        result: 'reproduced',
        startedAt: at,
        finishedAt: at,
        evidenceSummary: 'デモでは同じ条件で再現しました。',
        log: ['保存済みの確認条件を読み込み', 'モック結果: 再現'],
      },
    ]
  task.usage = [
    {
      model: DEFAULT_MODEL_ID,
      calls: 12,
      inputTokens: 42000,
      outputTokens: 8200,
      cacheTokens: 26000,
    },
  ]
  if (!fresh) {
    const importedAt = new Date().toISOString()
    task.description = '既存の保存データをまとめた診断です。元の目的・計画履歴・実行記録は未記録です。'
    task.objective = ''
    task.createdAt = importedAt
    task.startedAt = undefined
    task.completedAt = undefined
    task.goals = []
    task.constraints = []
    task.planner.rounds = []
    task.facts = []
    task.hints = []
    task.approvals = []
    task.retests = []
    task.usage = []
    task.sessions = task.sessions.map(session => session.kind === 'main' ? session : ({
      ...session,
      startedAt: undefined,
      endedAt: undefined,
      messages: [{ id: `IMPORTED-${session.id}`, at: importedAt, role: 'system', text: '保存データから移行した調査です。過去の会話・ツール実行記録は保存されていません。' }],
    }))
    task.events = [{ id: 'E-IMPORTED', at: importedAt, kind: 'system', source: 'system', text: `保存データから調査${tickets.length}件と発見${findings.length}件を移行しました`, detail: '出典: imported（既存localStorage）。元のPlanner・Workerの実行履歴は未記録です。', status: '移行済み' }]
  }
  return {
    ...data,
    tickets,
    diagnostics: [
      task,
      emptyDiagnostic(
        projectId,
        'D-002',
        '次回診断の準備',
        '対象を選んで診断を準備します。',
        '診断目的を設定してください。',
        [],
      ),
    ],
  }
}
