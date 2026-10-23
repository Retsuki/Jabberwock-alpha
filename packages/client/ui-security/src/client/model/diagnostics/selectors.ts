import type { CoverageEdge, CoverageNode, Finding, ProjectData, Target, Ticket } from '../types.ts'
import type { DiagnosticTask } from './types.ts'

/** Select the investigations owned by one diagnostic.
 * @param data - owning project data.
 * @param task - selected diagnostic.
 * @returns investigations for this diagnostic.
 */
export const getDiagnosticTickets = (data: ProjectData, task: DiagnosticTask): Ticket[] =>
  data.tickets.filter(t => (t.diagnosticTaskId ?? 'D-001') === task.id)
/** Select the findings attached to one diagnostic.
 * @param data - owning project data.
 * @param task - selected diagnostic.
 * @returns recorded findings from scoped investigations.
 */
export const getDiagnosticFindings = (
  data: ProjectData,
  task: DiagnosticTask,
): Finding[] => getDiagnosticTickets(data, task).flatMap(t => t.result?.findings ?? [])
/** Select existing assets within one diagnostic scope.
 * @param data - owning project data.
 * @param task - selected diagnostic.
 * @returns registered assets selected by this diagnostic.
 */
export const getDiagnosticTargets = (data: ProjectData, task: DiagnosticTask): Target[] =>
  data.targets.filter(t => task.targetIds.includes(t.id))

/** Derive a coverage node and parent-edge preview.
 * @param data - owning project data.
 * @param task - selected diagnostic.
 * @returns nodes and edges without launching a graph renderer.
 */
export function getCoverageData(
  data: ProjectData,
  task: DiagnosticTask,
): { nodes: CoverageNode[]; edges: CoverageEdge[] } {
  const targets = getDiagnosticTargets(data, task)
  if (!targets.length) return { nodes: [], edges: [] }
  const nodes: CoverageNode[] = [
    {
      key: 'project',
      kind: 'company',
      label: task.name,
      tested: false,
      inScope: false,
    },
  ]
  const edges: CoverageEdge[] = []
  for (const t of targets) {
    nodes.push({
      key: t.id,
      kind:
        t.kind === 'url'
          ? 'endpoint'
          : t.kind === 'domain'
            ? 'root_domain'
            : 'ip',
      label: t.value,
      tested: t.status === 'tested',
      inScope: true,
      url: t.kind === 'url' ? t.value : undefined,
    })
    if (t.kind === 'url') {
      try {
        const hostname = new URL(t.value).hostname
        const parent = targets.find(
          candidate =>
            candidate.kind === 'domain' && candidate.value === hostname,
        )
        if (parent) {
          edges.push({ source: t.id, target: parent.id })
          continue
        }
        const hostKey = `host:${hostname}`
        if (!nodes.some(n => n.key === hostKey)) {
          nodes.push({
            key: hostKey,
            kind: 'subdomain',
            label: hostname,
            tested: false,
            inScope: false,
          })
          edges.push({ source: hostKey, target: 'project' })
        }
        edges.push({ source: t.id, target: hostKey })
        continue
      } catch {
        /* Invalid historical URL remains visible as an asset. */
      }
    }
    edges.push({ source: t.id, target: 'project' })
  }
  return { nodes, edges }
}

/** Render a Markdown report explicitly identified as sample data.
 * @param data - owning project data.
 * @param task - selected diagnostic.
 * @returns plain Markdown report text.
 */
export function buildReport(data: ProjectData, task: DiagnosticTask): string {
  const targets = getDiagnosticTargets(data, task)
  const tickets = getDiagnosticTickets(data, task)
  const findings = getDiagnosticFindings(data, task)
  const tested = targets.filter(t => t.status === 'tested').length
  return [
    `# ${task.name}`,
    '',
    '## 目的',
    task.objective || '未設定',
    '',
    '## 実施状況',
    `状態: ${task.status} / 調査: ${tickets.length}件 / 完了: ${tickets.filter(t => t.status === 'done').length}件`,
    `対象: ${targets.length}件 / テスト済み: ${tested}件`,
    '',
    '## 対象',
    ...targets.map(t => `- ${t.value}`),
    '',
    '## 発見',
    ...(findings.length
      ? findings.map(
        f =>
          `- [${f.severity}] ${f.title} (${f.status})\n  対象: ${f.target}\n  根拠: ${f.evidence || '未記録'}`,
      )
      : ['発見はまだ登録されていません。']),
    '',
    '## 制約',
    ...task.constraints.map(
      c => `- ${c.kind === 'deny' ? '禁止' : '許可'}: ${c.text}`,
    ),
    '',
    '## 未確認箇所',
    ...targets.filter(t => t.status !== 'tested').map(t => `- ${t.value}`),
    ...tickets.filter(t => t.status !== 'done').map(t => `- ${t.title}`),
    '',
    'これはモックデータによる報告です。診断完了やカバレッジは安全性の保証ではありません。',
  ].join('\n')
}
