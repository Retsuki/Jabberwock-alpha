/** Model JSON is validated independently from legacy human-readable Worker summaries. */
import { z } from 'zod'
import type { SecurityFindingReport } from './finding-types.ts'
import type { SecurityWorkerEvidence } from './worker-types.ts'
/** Accepted owner triage states for a saved finding. */
export const findingStatusSchema = z.enum(['open', 'in-progress', 'confirmed', 'fixed', 'false-positive', 'duplicate', 'accepted-risk'])
/** Validated evidence-backed finding fields returned by a Worker. */
export const findingReportSchema = z.object({ title: z.string().trim().min(1).max(300), summary: z.string().trim().min(1).max(5000), severity: z.enum(['critical', 'high', 'medium', 'low', 'info']), proof: z.string().trim().min(1).max(4000), remediation: z.string().trim().min(1).max(5000) }).strict()
const reportSchema = z.object({ summary: z.string().trim().min(1).max(20000), findings: z.array(findingReportSchema).max(20) }).strip()
// Models may append prose after the first JSON object; quoted braces remain data.
function leadingObject(input: string): string {
  let depth = 0, quoted = false, escaped = false
  for (let index = 0; index < input.length; index++) {
    const char = input[index]
    if (quoted) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') quoted = false
    } else if (char === '"') quoted = true
    else if (char === '{') depth++
    else if (char === '}' && --depth === 0) return input.slice(0, index + 1)
  }
  return input
}
/** Parse a structured report; legacy prose remains readable but cannot create findings.
 * @param answer Model response.
 * @param evidence The actual bounded observation.
 * @returns Public summary and only validated evidence-backed findings.
 */
export function parseWorkerReport(
  answer: string, evidence: SecurityWorkerEvidence,
): { summary: string; findings: SecurityFindingReport[] } {
  const trimmed = answer.trim()
  const fenced = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```(?:\s|$)/u.exec(trimmed)
  const json = fenced?.[1] ?? trimmed
  if (trimmed.startsWith('```') && !fenced) throw new SyntaxError('Worker JSON code block is incomplete')
  if (!json.startsWith('{')) return { summary: answer, findings: [] }
  const report = reportSchema.parse(JSON.parse(fenced ? json : leadingObject(json)))
  for (const finding of report.findings) if (!evidence.body.includes(finding.proof) && !JSON.stringify(evidence.headers).includes(finding.proof)) throw new Error('Finding proof must quote the actual response body or retained headers')
  return report
}
/** Validated conclusion and quoted proof for an independent verification. */
export const retestReportSchema = z.object({ verdict: z.enum(['reproduced', 'fixed', 'inconclusive']), summary: z.string().trim().min(1).max(20000), proof: z.string().trim().min(1).max(4000) }).strict()
