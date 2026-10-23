import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { readSupplyChainLock, scanSupplyChain } from '../src/supply-chain-scanner.ts'
const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
const signal = () => new AbortController().signal
async function root() { const path = await mkdtemp(join(tmpdir(), 'supply-chain-')); roots.push(path); return path }
async function npm(path: string, packages: object, version = 3) { await writeFile(join(path, 'package-lock.json'), JSON.stringify({ lockfileVersion: version, packages })) }
const advisory = { title: 'Known advisory', url: 'https://github.com/advisories/GHSA-35jh-r3h4-6jhm', severity: 'high', vulnerable_versions: '<4.17.21' }
const row = (name = 'lodash', version = '4.17.20') => ({ name, version, relationship: 'direct' as const, environment: 'production' as const })
const lock = (dependencies = [row()]) => ({ lockfile: { path: '/registered/package-lock.json', packageManager: 'npm' as const, scope: 'project' as const }, dependencies, warnings: [] })
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })
it('reads locked versions and declares exact scope without running scripts', async () => {
  const path = await root(); await npm(path, { '': { dependencies: { lodash: '^4' } }, 'node_modules/lodash': { version: '4.17.20' } })
  const result = await readSupplyChainLock(path, signal()); expect(result.dependencies).toEqual([row()]); expect(result.lockfile.scope).toBe('project')
})
it('rejects an unrelated ancestor lock before sending package metadata', async () => {
  const path = await root(); const child = join(path, 'other'); await mkdir(child); await npm(path, { '': {}, 'node_modules/lodash': { version: '4.17.20' } })
  await expect(readSupplyChainLock(child, signal())).rejects.toThrow('membership')
})
it.each(['npm', 'pnpm'])('accepts an evidenced shared %s root and reports sibling scope', async (manager) => {
  const path = await root(); const child = join(path, 'app'); await mkdir(child)
  if (manager === 'npm') await npm(path, { app: { dependencies: { lodash: '^4' } }, sibling: {}, 'node_modules/lodash': { version: '4.17.20' } })
  else await writeFile(join(path, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\nimporters:\n  app:\n    dependencies:\n      lodash:\n        version: 4.17.20\n  sibling: {}\npackages:\n  lodash@4.17.20: {}\n')
  expect((await readSupplyChainLock(child, signal())).lockfile.scope).toBe('workspace')
})
it('keeps npm v1 hoisted dependency relationship unknown', async () => {
  const path = await root(); await writeFile(join(path, 'package-lock.json'), JSON.stringify({ lockfileVersion: 1, dependencies: { lodash: { version: '4.17.20' } } }))
  const result = await readSupplyChainLock(path, signal()); expect(result.dependencies[0]?.relationship).toBe('unknown'); expect(result.warnings.join()).toContain('npm v1')
})
it('rejects symlink lockfiles and YAML aliases', async () => {
  const path = await root(); const outside = join(path, 'outside'); await writeFile(outside, '{}'); await symlink(outside, join(path, 'package-lock.json'))
  await expect(readSupplyChainLock(path, signal())).rejects.toThrow('trusted file')
  await rm(join(path, 'package-lock.json')); await writeFile(join(path, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\na: &a {}\npackages: *a\n')
  await expect(readSupplyChainLock(path, signal())).rejects.toThrow('aliases')
})
it('uses only fixed public endpoints and exact installed-version advisory matches', async () => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
    expect(init?.redirect).toBe('error'); expect(init?.headers).not.toHaveProperty('authorization')
    if ((typeof url === 'string' ? url : url instanceof URL ? url.href : url.url).includes('registry.npmjs.org')) { expect(JSON.parse(typeof init?.body === 'string' ? init.body : '')).toEqual({ lodash: ['4.17.20'] }); return json({ lodash: [advisory, { ...advisory, vulnerable_versions: '<1' }] }) }
    expect((typeof url === 'string' ? url : url instanceof URL ? url.href : url.url)).toBe('https://api.github.com/advisories/GHSA-35jh-r3h4-6jhm')
    return json({ ghsa_id: 'GHSA-35jh-r3h4-6jhm', cve_id: 'CVE-2021-23337', description: 'Public description', published_at: '2021-05-06', updated_at: null, vulnerabilities: [ { package: { ecosystem: 'RubyGems', name: 'lodash' }, vulnerable_version_range: '<5', first_patched_version: '9.0.0' }, { package: { ecosystem: 'npm', name: 'lodash' }, vulnerable_version_range: '<4.17.21', first_patched_version: '4.17.21' } ] })
  })
  const result = await scanSupplyChain(lock(), { signal: signal(), fetch: fetcher, progress: async () => {} })
  expect(result.findings).toHaveLength(1); expect(result.findings[0]).toMatchObject({ fixedVersion: '4.17.21', fixStatus: 'available', publishedAt: '2021-05-06' })
})
it('handles legal prototype-looking package names without prototype mutation', async () => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => { expect(JSON.parse(typeof init?.body === 'string' ? init.body : '')).toEqual({ constructor: ['1.0.0'], toString: ['1.0.0'], __proto__: undefined }); return json({}) })
  const result = await scanSupplyChain(lock([row('constructor', '1.0.0'), row('toString', '1.0.0')]), { signal: signal(), fetch: fetcher, progress: async () => {} }); expect(result.findings).toEqual([])
})
it.each([null, 'invalid'])('distinguishes failed advisory metadata from successful empty results: %s', async (payload) => {
  await expect(scanSupplyChain(lock(), { signal: signal(), fetch: async () => json(payload), progress: async () => {} })).rejects.toThrow()
  expect((await scanSupplyChain(lock(), { signal: signal(), fetch: async () => json({}), progress: async () => {} })).findings).toEqual([])
})
it('retains partial matched evidence and unknown fix when optional metadata fails', async () => {
  const retain = vi.fn(); let requests = 0
  const result = await scanSupplyChain(lock(), { signal: signal(), finding: retain, fetch: async () => ++requests === 1 ? json({ lodash: [advisory] }) : new Response('', { status: 503 }), progress: async () => {} })
  expect(retain).toHaveBeenCalledTimes(1); expect(result.findings[0]?.fixStatus).toBe('unknown'); expect(result.warnings.join()).toContain('Optional')
})
it('does not silently mark a prerelease safe and rejects invalid advisory ranges as incomplete', async () => {
  const result = await scanSupplyChain(lock([row('lodash', '4.17.20-beta.1')]), { signal: signal(), fetch: async url => (typeof url === 'string' ? url : url instanceof URL ? url.href : url.url).includes('registry') ? json({ lodash: [{ ...advisory, url: 'https://example.org/advisory' }, { ...advisory, vulnerable_versions: 'not a range' }] }) : json({}), progress: async () => {} })
  expect(result.findings).toHaveLength(1); expect(result.warnings.join()).toContain('unsupported')
})
it('keeps npm alias relationship uncertain and emits explicit incomplete coverage', async () => {
  const path = await root(); await npm(path, { '': { dependencies: { alias: 'npm:lodash@4.17.20' } }, 'node_modules/alias': { name: 'lodash', version: '4.17.20' } })
  const result = await readSupplyChainLock(path, signal()); expect(result.dependencies[0]?.relationship).toBe('unknown'); expect(result.warnings.join()).toContain('Aliased')
})
it.each([null, undefined])('distinguishes absent fix metadata from explicit unavailable fix: %s', async (fixed) => {
  let calls = 0
  const result = await scanSupplyChain(lock(), { signal: signal(), progress: async () => {}, fetch: async () => ++calls === 1 ? json({ lodash: [advisory] }) : json({ ghsa_id: 'GHSA-35jh-r3h4-6jhm', cve_id: null, description: '', published_at: null, updated_at: null, vulnerabilities: [{ package: { ecosystem: 'npm', name: 'lodash' }, vulnerable_version_range: '<4.17.21', ...(fixed === undefined ? {} : { first_patched_version: fixed }) }] }) })
  expect(result.findings[0]?.fixStatus).toBe(fixed === null ? 'unavailable' : 'unknown')
})
it('rejects oversized optional metadata as unknown without losing the bulk advisory match', async () => {
  let calls = 0
  const result = await scanSupplyChain(lock(), { signal: signal(), progress: async () => {}, fetch: async () => ++calls === 1 ? json({ lodash: [advisory] }) : json({ ghsa_id: 'GHSA-35jh-r3h4-6jhm', cve_id: null, description: 'Published description', published_at: 'x'.repeat(101), updated_at: null, vulnerabilities: [], cwes: Array.from({ length: 101 }, () => ({ cwe_id: 'CWE-20' })) }) })
  expect(result.findings).toHaveLength(1); expect(result.findings[0]?.publishedAt).toBeUndefined(); expect(result.findings[0]?.fixStatus).toBe('unknown'); expect(result.warnings.join()).toContain('Optional')
})
it.each(['>= 4.0.0, < 4.17.21', '> 4.0.0, <= 4.17.20'])('matches documented GitHub lower/upper conjunction %s', async (range) => {
  let calls = 0
  const result = await scanSupplyChain(lock(), { signal: signal(), progress: async () => {}, fetch: async () => ++calls === 1 ? json({ lodash: [advisory] }) : json({ ghsa_id: 'GHSA-35jh-r3h4-6jhm', cve_id: null, description: 'Public metadata', published_at: '2021-05-06', updated_at: null, vulnerabilities: [{ package: { ecosystem: 'npm', name: 'lodash' }, vulnerable_version_range: '>= 3.0.0, < 3.1.0', first_patched_version: '3.1.0' }, { package: { ecosystem: 'npm', name: 'lodash' }, vulnerable_version_range: range, first_patched_version: '4.17.21' }] }) })
  expect(result.findings[0]).toMatchObject({ fixedVersion: '4.17.21', fixStatus: 'available', publishedAt: '2021-05-06' }); expect(result.warnings).toEqual([])
})
it.each(['>= 3.0.0, < 3.1.0, >= 4.0.0, < 4.17.21', '< 4.17.21, >= 4.0.0', '>= bad, < 4.17.21'])('does not guess unsupported GitHub range %s', async (range) => {
  let calls = 0
  const result = await scanSupplyChain(lock(), { signal: signal(), progress: async () => {}, fetch: async () => ++calls === 1 ? json({ lodash: [advisory] }) : json({ ghsa_id: 'GHSA-35jh-r3h4-6jhm', cve_id: null, description: 'Public metadata', published_at: '2021-05-06', updated_at: null, vulnerabilities: [{ package: { ecosystem: 'npm', name: 'lodash' }, vulnerable_version_range: range, first_patched_version: '4.17.21' }] }) })
  expect(result.findings).toHaveLength(1); expect(result.findings[0]?.fixStatus).toBe('unknown'); expect(result.findings[0]?.publishedAt).toBeUndefined(); expect(result.warnings.join()).toContain('unsupported range')
})
