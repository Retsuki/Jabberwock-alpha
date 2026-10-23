import { FINDING_TEMPLATES } from './finding-templates.ts'
import type { Finding, SeverityCounts, Ticket } from './types.ts'
const hashOf = (text: string) => {
  let h = 0
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}
/** Build deterministic sample findings from the migrated templates.
 * @param ticket - sample investigation identity and targets.
 * @param counts - number of samples per severity.
 * @param foundAt - fixed sample timestamp.
 * @returns sample findings; no diagnostic is performed.
 */
export function buildFindings(
  ticket: Pick<Ticket, 'id' | 'title' | 'targets'>,
  counts: SeverityCounts,
  foundAt: string,
): Finding[] {
  const seed = hashOf(`${ticket.id}${ticket.title}`)
  const findings: Finding[] = []
  for (const severity of ['critical', 'high', 'medium', 'low'] as const) {
    for (let i = 0; i < counts[severity]; i++) {
      const list = FINDING_TEMPLATES[severity]
      const tpl = list[(seed + i) % list.length]
      if (!tpl) throw new Error(`Missing sample finding template: ${severity}`)
      findings.push({
        id: `${ticket.id}-F${findings.length + 1}`,
        ...tpl,
        severity,
        target: ticket.targets[(seed + findings.length) % Math.max(ticket.targets.length, 1)] ?? '',
        status: 'open',
        foundAt,
      })
    }
  }
  return findings
}
