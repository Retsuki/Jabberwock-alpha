import { describe, expect, it } from 'vitest'
import { parseWorkerReport, retestReportSchema } from '../src/finding-report.ts'
import type { SecurityWorkerEvidence } from '../src/worker-types.ts'

const evidence: SecurityWorkerEvidence = { url: 'https://example.org/', status: 200, headers: { server: 'fixture' }, body: 'retained public response', bytes: 24 }
const finding = { title: 'Observed exposure', summary: 'Evidence requires review', severity: 'low', proof: 'public response', remediation: 'Review deployment' }
const report = { summary: 'One observation', findings: [finding] }
describe('evidence-backed Worker reports', () => {
  it('keeps legacy summaries readable without inventing findings', () => {
    expect(parseWorkerReport('Possible exposure described in older prose.', evidence)).toEqual({ summary: 'Possible exposure described in older prose.', findings: [] })
  })
  it('accepts quoted body and retained header evidence, including fenced JSON', () => {
    expect(parseWorkerReport(JSON.stringify(report), evidence)).toEqual(report)
    const headers = { ...report, findings: [{ ...finding, proof: 'fixture' }] }
    expect(parseWorkerReport('```json\n' + JSON.stringify(headers) + '\n```', evidence)).toEqual(headers)
  })
  it('reads a complete leading JSON code block without treating the following explanation as data', () => {
    const response = '```json\n' + JSON.stringify(report) + '\n```\n\nObserved facts\n```\npublic response\n```'
    expect(parseWorkerReport(response, evidence)).toEqual(report)
    expect(() => parseWorkerReport('```json\n' + JSON.stringify(report), evidence)).toThrow('incomplete')
    expect(() => parseWorkerReport('```json\n{broken\n```\nExplanation', evidence)).toThrow()
    expect(() => parseWorkerReport('```json\n' + JSON.stringify({ ...report, findings: [{ ...finding, proof: 'invented' }] }) + '\n```\npublic response', evidence)).toThrow('quote')
  })
  it('ignores supplemental report metadata while still validating every finding field', () => {
    const supplemental = { ...report, limitations: ['One GET only'], links_found: [], suggested_next_steps: [] }
    expect(parseWorkerReport(JSON.stringify(supplemental), evidence)).toEqual(report)
    const invalid = { ...report, findings: [{ ...finding, invented: true }], limitations: [] }
    expect(() => parseWorkerReport(JSON.stringify(invalid), evidence)).toThrow()
  })
  it('reads leading raw JSON followed by prose while preserving escaped quotes and braces', () => {
    const nested = { ...report, summary: 'Observed {quoted} "text" and \\ characters' }
    expect(parseWorkerReport(JSON.stringify(nested) + '\n\n**Observed facts:** extra explanation', evidence)).toEqual(nested)
    expect(() => parseWorkerReport('{"summary":"broken } string",', evidence)).toThrow()
  })
  it('rejects invented quotes and unretained response information', () => {
    expect(() => parseWorkerReport(JSON.stringify({ ...report, findings: [{ ...finding, proof: 'not observed' }] }), evidence)).toThrow('quote')
    expect(() => parseWorkerReport(JSON.stringify({ ...report, findings: [{ ...finding, proof: '200' }] }), evidence)).toThrow('quote')
  })
  it('rejects malformed structured findings rather than treating them as prose', () => {
    for (const invalid of [{ ...finding, severity: 'urgent' }, { ...finding, proof: '' }, { ...finding, title: 'x'.repeat(301) }, { ...finding, invented: true }]) {
      expect(() => parseWorkerReport(JSON.stringify({ ...report, findings: [invalid] }), evidence)).toThrow()
    }
    expect(() => parseWorkerReport('{broken', evidence)).toThrow()
    expect(() => parseWorkerReport(JSON.stringify({ ...report, findings: Array.from({ length: 21 }, () => finding) }), evidence)).toThrow()
  })
  it('requires explicit supported retest verdicts and nonempty evidence text', () => {
    expect(retestReportSchema.parse({ verdict: 'inconclusive', summary: 'Cannot establish normal behavior', proof: 'Observed response' }).verdict).toBe('inconclusive')
    expect(() => retestReportSchema.parse({ verdict: 'passed', summary: 'Done', proof: 'Observed' })).toThrow()
    expect(() => retestReportSchema.parse({ verdict: 'fixed', summary: 'Done', proof: '' })).toThrow()
  })
})
