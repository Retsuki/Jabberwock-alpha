import type { Target, TargetKind } from './types.ts'

/** Migrated prototype parsed target. */
export type ParsedTarget = { value: string; kind: TargetKind }

/** Migrated prototype parse result. */
export type ParseResult = {
  valid: ParsedTarget[]
  invalid: string[]
  duplicates: string[]
}

const OCTET = '(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)'
const IPV4 = new RegExp(`^${OCTET}(?:\\.${OCTET}){3}$`)
const DOMAIN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i

function isIpv6(v: string): boolean {
  if (!v.includes(':')) return false
  try {
    new URL(`http://[${v}]`)
    return true
  } catch {
    return false
  }
}

function detectKind(v: string): TargetKind | null {
  if (/^https?:\/\//i.test(v)) {
    try {
      return new URL(v).hostname ? 'url' : null
    } catch {
      return null
    }
  }
  const [addr = '', prefix, ...rest] = v.split('/')
  if (prefix !== undefined) {
    const max = isIpv6(addr) ? 128 : 32
    const n = Number(prefix)
    const addrOk = IPV4.test(addr) || isIpv6(addr)
    return rest.length === 0 && addrOk && /^\d{1,3}$/.test(prefix) && n <= max ? 'cidr' : null
  }
  if (IPV4.test(v) || isIpv6(v)) return 'ip'
  if (DOMAIN.test(v)) return 'domain'
  return null
}
/** Normalize target text for prototype duplicate comparison.
 * @param v - entered target text.
 * @returns case-folded value without trailing slashes.
 */
export function normalizeTarget(v: string): string {
  return v.toLowerCase().replace(/\/+$/, '')
}
/** Classify and deduplicate pasted asset candidates.
 * @param text - whitespace or comma-separated candidates.
 * @param existing - registered project targets.
 * @returns accepted, invalid and duplicate candidates.
 */
export function parseTargets(text: string, existing: Target[]): ParseResult {
  const seen = new Set(existing.map(t => normalizeTarget(t.value)))
  const result: ParseResult = { valid: [], invalid: [], duplicates: [] }

  for (const token of text.split(/[\s,]+/).filter(Boolean)) {
    const kind = detectKind(token)
    if (!kind) {
      result.invalid.push(token)
      continue
    }
    const key = normalizeTarget(token)
    if (seen.has(key)) {
      result.duplicates.push(token)
      continue
    }
    seen.add(key)
    result.valid.push({ value: token, kind })
  }
  return result
}
