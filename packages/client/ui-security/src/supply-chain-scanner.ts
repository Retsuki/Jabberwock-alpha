/** Fixed public-registry advisory comparison over bounded npm/pnpm lock metadata. */
import { constants } from 'node:fs'
import { open, realpath } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { parse } from 'yaml'
import { valid, validRange, satisfies } from 'semver'
import { z } from 'zod'
import type { SupplyChainFinding, SupplyChainRun } from './supply-chain-types.ts'

/** One exact public lock-derived package/version occurrence. */
export interface LockedDependency {
  /** Canonical npm package name. */ name: string
  /** Valid locked semver. */ version: string
  /** Lock-derived relationship. */ relationship: SupplyChainFinding['relationship']
  /** Lock-derived runtime scope. */ environment: SupplyChainFinding['environment']
}
/** Lock metadata admitted for public advisory matching. */
export interface SupplyChainLock {
  /** Actual root lock and shared scope. */ lockfile: NonNullable<SupplyChainRun['lockfile']>
  /** Distinct canonical package/version pairs. */ dependencies: LockedDependency[]
  /** Coverage gaps, never a zero-match safety claim. */ warnings: string[]
}
/** Fixed scanner limits; callers cannot choose commands, endpoints or arbitrary paths. */
export interface SupplyChainScannerOptions {
  /** Request lifetime including owner cancellation. */ signal: AbortSignal
  /** Trusted transport replacement for controlled tests only. */ fetch?: typeof globalThis.fetch
  /** Retain matched rows before optional enrichment or cancellation. */
  finding?: (finding: SupplyChainFinding) => void
  /** Receives one bounded public progress stage. */ progress: (phase: SupplyChainRun['phase'], message: string) => Promise<void>
}
const BULK_URL = 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk'
const MAX_BYTES = 16 * 1024 * 1024
const MAX_DEPENDENCIES = 10000
const MAX_FINDINGS = 500
const ghsaPattern = /^GHSA-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4}$/i
const namePattern = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i
const advisorySchema = z.object({ id: z.number().optional(),
  title: z.string().max(2000),
  url: z.url().max(2048),
  severity: z.string().max(30),
  vulnerable_versions: z.string().max(4000),
  cwe: z.array(z.string().max(100)).max(100).optional(),
  cvss: z.object({ score: z.number().min(0).max(10).nullable().optional(),
    vectorString: z.string().max(1000).nullable().optional() }).optional() })
const githubSchema = z.object({ ghsa_id: z.string().max(100),
  cve_id: z.string().max(100).nullable(),
  description: z.string().max(100000),
  published_at: z.string().max(100).nullable(),
  updated_at: z.string().max(100).nullable(),
  vulnerabilities: z.array(z.object({ package: z.object({ ecosystem: z.string().max(100),
    name: z.string().max(300) }),
  vulnerable_version_range: z.string().max(4000),
  first_patched_version: z.string().max(300).nullable().optional() })).max(500),
  cvss: z.object({ score: z.number().min(0).max(10).nullable().optional(),
    vector_string: z.string().max(1000).nullable().optional() }).optional(),
  cwes: z.array(z.object({ cwe_id: z.string().max(100) })).max(100).optional() })
const object = (value: unknown): Record<string, unknown> | undefined => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
const text = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined

/** Read only bounded regular files; project credentials and scripts are never inspected. */
async function readFile(path: string): Promise<string | undefined> {
  let handle
  try { handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW) } catch (error) {
    if (object(error)?.code === 'ENOENT') return undefined
    throw new Error('Lock metadata is unavailable or is not a regular trusted file')
  }
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error('Lock metadata exceeds the supported file bounds')
    return await handle.readFile('utf8')
  } finally { await handle.close() }
}

/** Discover and parse one npm/pnpm root lock, retaining unsupported coverage explicitly.
 * @param workspacePath Registered Workspace directory, never a client-supplied path.
 * @param signal Check lifetime.
 * @returns Validated locked package metadata and actual shared scope.
 */
export async function readSupplyChainLock(workspacePath: string, signal: AbortSignal): Promise<SupplyChainLock> {
  const workspace = await realpath(workspacePath)
  let directory = workspace
  while (true) {
    signal.throwIfAborted()
    const pnpm = await readFile(join(directory, 'pnpm-lock.yaml'))
    const npm = await readFile(join(directory, 'package-lock.json'))
    if (pnpm !== undefined || npm !== undefined) {
      const lockfile = { path: join(directory, pnpm === undefined ? 'package-lock.json' : 'pnpm-lock.yaml'), packageManager: pnpm === undefined ? 'npm' as const : 'pnpm' as const, scope: directory === workspace ? 'project' as const : 'workspace' as const }
      let lock: Record<string, unknown> | undefined
      try { lock = object(pnpm === undefined ? JSON.parse(npm ?? '') : parse(pnpm, { maxAliasCount: 0, uniqueKeys: true })) } catch { throw new Error('Lockfile format is invalid or contains unsupported YAML aliases') }
      if (!lock) throw new Error('Lockfile must contain an object')
      if (directory !== workspace) {
        const member = relative(directory, workspace).replaceAll('\\', '/')
        const membership = pnpm !== undefined ? object(lock['importers']) : object(lock['packages'])
        if (!membership || !Object.hasOwn(membership, member)) throw new Error('Ancestor lockfile does not establish registered Workspace membership; no package metadata was sent')
      }
      const warnings: string[] = []
      if (pnpm !== undefined && npm !== undefined) warnings.push('Both npm and pnpm locks exist; only the pnpm lock was checked.')
      const found = new Map<string, LockedDependency>()
      let relationshipKnown = true
      const direct = new Map<string, Set<'production' | 'development'>>()
      const note = (message: string): void => { if (warnings.length < 100 && !warnings.includes(message)) warnings.push(message) }
      const addDirect = (source: Record<string, unknown>): void => {
        for (const [field, environment] of [['dependencies', 'production'], ['optionalDependencies', 'production'], ['devDependencies', 'development']] as const) {
          for (const [name, reference] of Object.entries(object(source[field]) ?? {})) {
            if (typeof reference === 'string' && /^(?:npm:|link:|file:|git|https?:)/.test(reference)) { relationshipKnown = false; note('Aliased or non-registry npm references need separate review; relationship attribution is unknown.') }
            const scopes = direct.get(name) ?? new Set(); scopes.add(environment); direct.set(name, scopes)
          }
        }
      }
      const add = (name: string, version: unknown, environment: LockedDependency['environment']): void => {
        if (name.length > 214 || !namePattern.test(name) || typeof version !== 'string' || !valid(version)) { note('Some alias, linked, local, git or invalid-version dependencies could not be compared.'); return }
        if (found.size >= MAX_DEPENDENCIES) { note('The dependency count limit was reached; comparison coverage is incomplete.'); return }
        const scopes = direct.get(name)
        const dependency: LockedDependency = { name, version, relationship: !relationshipKnown ? 'unknown' : scopes ? 'direct' : 'transitive', environment: scopes ? scopes.size > 1 ? 'shared' : ([...scopes][0] ?? 'unknown') : environment }
        const key = `${name}@${version}`
        const previous = found.get(key)
        if (previous && previous.environment !== dependency.environment) dependency.environment = 'shared'
        found.set(key, dependency)
        if (version.includes('-')) note('Prerelease versions were compared conservatively; advisory coverage for prereleases may be incomplete.')
      }
      if (pnpm !== undefined) {
        if (![5.3, 5.4, 6, '5.3', '5.4', '6.0', '9.0', 9].includes(lock['lockfileVersion'] as string | number)) throw new Error('Unsupported pnpm lockfile version')
        const importers = object(lock['importers'])
        for (const importer of Object.values(importers ?? { '.': lock })) {
          const value = object(importer); if (!value) continue; addDirect(value)
          for (const field of ['dependencies', 'optionalDependencies', 'devDependencies']) {
            for (const dependency of Object.values(object(value[field]) ?? {})) {
              const spec = text(object(dependency)?.['version']) ?? text(dependency)
              if (spec && /^(?:link:|file:|git|https?:|npm:)/.test(spec)) note('Linked, aliased or non-registry dependency references require separate review.')
            }
          }
        }
        for (const [key, value] of Object.entries(object(lock['packages']) ?? {})) {
          const normalized = key.replace(/^\//, '').split('(')[0] ?? ''
          const index = normalized.lastIndexOf('@') > 0 ? normalized.lastIndexOf('@') : normalized.lastIndexOf('/')
          const dependency = object(value)
          add(normalized.slice(0, index), normalized.slice(index + 1), dependency?.['dev'] === true ? 'development' : dependency?.['dev'] === false ? 'production' : 'unknown')
        }
        if (Object.keys(importers ?? {}).length > 1) lockfile.scope = 'workspace'
      } else {
        if (![1, 2, 3].includes(Number(lock['lockfileVersion']))) throw new Error('Unsupported npm lockfile version')
        const packages = object(lock['packages'])
        if (packages) {
          for (const [path, value] of Object.entries(packages)) if (!path.includes('node_modules')) { const entry = object(value); if (entry) addDirect(entry) }
          for (const [path, value] of Object.entries(packages)) {
            const entry = object(value); if (!path || !entry) continue
            if (entry['link'] === true) { note('Workspace links are included only through their locked registry dependencies.'); continue }
            if (!path.includes('node_modules/')) continue
            add(text(entry['name']) ?? path.slice(path.lastIndexOf('node_modules/') + 13), entry['version'], entry['dev'] === true ? 'development' : 'production')
          }
          if (Object.keys(packages).some(path => path && !path.includes('node_modules'))) lockfile.scope = 'workspace'
        } else {
          relationshipKnown = false
          note('npm v1 lockfiles do not establish direct dependency declarations; dependency relationship is unknown.')
          const visit = (dependencies: unknown, depth: number): void => {
            if (depth > 32) { note('Dependency tree depth exceeded the supported bound.'); return }
            for (const [name, value] of Object.entries(object(dependencies) ?? {})) { const entry = object(value); if (!entry) continue; add(name, entry['version'], entry['dev'] === true ? 'development' : 'production'); visit(entry['dependencies'], depth + 1) }
          }
          visit(lock['dependencies'], 0)
        }
      }
      const versions = new Map<string, number>()
      for (const dependency of found.values()) versions.set(dependency.name, (versions.get(dependency.name) ?? 0) + 1)
      for (const dependency of found.values()) if (dependency.relationship === 'direct' && (versions.get(dependency.name) ?? 0) > 1) { dependency.relationship = 'unknown'; note('Multiple versions of a declared direct dependency were found; exact direct/transitive attribution is unknown.') }
      if (!found.size) note('No comparable locked registry package versions were found.')
      return { lockfile, dependencies: [...found.values()], warnings }
    }
    const parent = dirname(directory)
    if (parent === directory) throw new Error('No supported npm or pnpm lockfile was found')
    directory = parent
  }
}

async function jsonResponse(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.ok || !response.body) throw new Error('The public advisory service did not return a successful response')
  const reader = response.body.getReader(); const parts: Uint8Array[] = []; let length = 0
  try { while (true) { signal.throwIfAborted(); const next = await reader.read(); if (next.done) break; length += next.value.byteLength; if (length > 4 * 1024 * 1024) throw new Error('The public advisory response exceeded its size limit'); parts.push(next.value) } }
  finally { await reader.cancel().catch(() => { /* The upstream may already have closed. */ }) }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')) } catch { throw new Error('The public advisory service returned invalid JSON') }
}

/** GitHub defines a lower bound followed by comma-space and an upper bound.
 * https://docs.github.com/en/code-security/tutorials/fix-reported-vulnerabilities/write-security-advisories
 * Other comma expressions are unsupported; they are never guessed as unions.
 */
function githubRange(range: string): string | null {
  if (!range.includes(',')) return validRange(range)
  const bounds = /^(>=|>) ([0-9][^\s,]*), (<=|<) ([0-9][^\s,]*)$/.exec(range)
  return bounds ? validRange(`${bounds[1]}${bounds[2]} ${bounds[3]}${bounds[4]}`) : null
}

/** Compare locked names/versions with npm advisories without executing package-manager or project code.
 * @param lock Parsed authoritative lock metadata.
 * @param options Fixed lifetime and trusted transport seam.
 * @returns Bounded advisory rows and explicit coverage warnings.
 */
export async function scanSupplyChain(
  lock: SupplyChainLock, options: SupplyChainScannerOptions,
): Promise<{ findings: SupplyChainFinding[]; warnings: string[] }> {
  const transport = options.fetch ?? globalThis.fetch
  const warnings = [...lock.warnings]
  const warn = (message: string): void => { if (warnings.length < 100 && !warnings.includes(message)) warnings.push(message) }
  const versions = new Map<string, string[]>()
  for (const dependency of lock.dependencies) {
    const values = versions.get(dependency.name) ?? []
    values.push(dependency.version); versions.set(dependency.name, values)
  }
  const body = Object.fromEntries(versions)
  if (Buffer.byteLength(JSON.stringify(body)) > 1024 * 1024) throw new Error('Package metadata exceeds the public advisory request size limit')
  await options.progress('advisories', 'Comparing locked package names and versions with public npm advisories.')
  const response = await jsonResponse(await transport(BULK_URL, { method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body), signal: options.signal }), options.signal)
  const bulk = z.record(z.string(), z.array(advisorySchema).max(1000)).parse(response)
  const findings: SupplyChainFinding[] = []
  const advisoryCache = new Map<string, Promise<z.infer<typeof githubSchema> | undefined>>()
  for (const dependency of lock.dependencies) for (const advisory of (Object.hasOwn(bulk, dependency.name)
    ? (bulk[dependency.name] ?? []) : [])) {
    options.signal.throwIfAborted()
    if (!validRange(advisory.vulnerable_versions)) { if (warnings.length < 100) warnings.push('An advisory contained an unsupported affected-version range.'); continue }
    if (!satisfies(dependency.version, advisory.vulnerable_versions, { includePrerelease: true })) continue
    if (findings.length >= MAX_FINDINGS) { if (warnings.length < 100) warnings.push('Advisory row limit reached; some matches are not displayed.'); break }
    const url = new URL(advisory.url)
    const ghsaId = url.hostname === 'github.com' && url.pathname.startsWith('/advisories/') ? url.pathname.split('/')[2] : undefined
    const finding: SupplyChainFinding = { package: dependency.name, version: dependency.version, title: advisory.title, severity: ['critical', 'high', 'moderate', 'low', 'info'].includes(advisory.severity) ? advisory.severity as SupplyChainFinding['severity'] : 'unknown', vulnerableRange: advisory.vulnerable_versions, advisoryUrl: advisory.url, cveIds: [], fixStatus: 'unknown', relationship: dependency.relationship, environment: dependency.environment, cweIds: advisory.cwe ?? [], ...(advisory.cvss?.score == null ? {} : { cvssScore: advisory.cvss.score }), ...(advisory.cvss?.vectorString == null ? {} : { cvssVector: advisory.cvss.vectorString }) }
    findings.push(finding)
    options.finding?.(finding)
    if (ghsaId && ghsaPattern.test(ghsaId)) {
      finding.ghsaId = ghsaId
      if (!advisoryCache.has(ghsaId) && advisoryCache.size < 20) advisoryCache.set(ghsaId, (async () => {
        try { return githubSchema.parse(await jsonResponse(await transport(`https://api.github.com/advisories/${ghsaId}`, { redirect: 'error', headers: { accept: 'application/vnd.github+json' }, signal: options.signal }), options.signal)) }
        catch { if (warnings.length < 100) warnings.push('Optional public GitHub advisory details were unavailable; fix or date metadata remains unknown.'); return undefined }
      })())
      if (!advisoryCache.has(ghsaId)) warn('Optional GitHub metadata lookup limit reached; remaining fix and date metadata is unknown.')
      const details = await advisoryCache.get(ghsaId)
      let match: z.infer<typeof githubSchema>['vulnerabilities'][number] | undefined
      if (details?.ghsa_id === ghsaId) {
        for (const candidate of details.vulnerabilities) {
          if (candidate.package.ecosystem !== 'npm' || candidate.package.name !== dependency.name) continue
          const range = githubRange(candidate.vulnerable_version_range)
          if (!range) { warn('Optional GitHub affected-version metadata used an unsupported range; unmatched fix and date metadata remains unknown.'); continue }
          if (satisfies(dependency.version, range, { includePrerelease: true })) { match = candidate; break }
        }
        if (!match) warn('Optional GitHub affected-version metadata did not establish a matching installed-version range; fix and date metadata remains unknown.')
      }
      if (details && match) {
        finding.description = details.description.slice(0, 10000)
        if (details.cve_id && /^CVE-\d{4}-\d{4,}$/.test(details.cve_id)) finding.cveIds = [details.cve_id]
        if (match.first_patched_version && valid(match.first_patched_version)) { finding.fixedVersion = match.first_patched_version; finding.fixStatus = 'available' }
        else if (match.first_patched_version === null) finding.fixStatus = 'unavailable'
        if (details.published_at) finding.publishedAt = details.published_at
        if (details.updated_at) finding.updatedAt = details.updated_at
        finding.cweIds = details.cwes?.map(value => value.cwe_id).filter(value => /^CWE-\d+$/.test(value)) ?? finding.cweIds
      }
    }
  }
  return { findings, warnings: [...new Set(warnings)].slice(0, 100) }
}

/** Format factual dependency matches without a claim of exploitable application impact.
 * @param run Last checked state.
 * @returns Bounded Markdown intended for the owning conversation.
 */
export function supplyChainMarkdown(run: SupplyChainRun): string {
  const escape = (value: string): string => value.replace(/[\r\n|<>]/g, ' ').slice(0, 4000)
  return `# Supply-chain check\n\n${escape(run.message)}\n\nScope: ${escape(run.lockfile?.path ?? 'not established')} (${run.lockfile?.scope ?? 'unknown'}). Checked ${run.checkedPackages} distinct locked package/version pairs; ${run.findings.length} advisory-match rows.\n\n${run.findings.map(row => `- **${row.severity}** ${escape(row.package)}@${escape(row.version)}: ${escape(row.title)} — ${escape(row.advisoryUrl)}; affected ${escape(row.vulnerableRange)}; fix ${escape(row.fixedVersion ?? row.fixStatus)}; ${row.relationship}/${row.environment}`).join('\n')}\n\n${run.warnings.map(warning => `- ${escape(warning)}`).join('\n')}\n\nThis matches known published dependency advisories only. It does not establish application reachability, exploitability, or the absence of unknown vulnerabilities. Incomplete checks and zero matches are not a safety guarantee.\n`
}
