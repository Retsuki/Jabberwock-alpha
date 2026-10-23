import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { z } from 'zod'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { afterEach, expect, it, vi } from 'vitest'
import { readRepairInput, repairDefinitions } from '../src/supply-chain-repair.ts'
import { readSupplyChainLock } from '../src/supply-chain-scanner.ts'
import type { SupplyChainRun } from '../src/supply-chain-types.ts'
const failure = vi.hoisted(() => ({ path: '' }))
vi.mock('@deepseek-ai/dsh-atomic-write', async (original) => {
  const actual = await original<typeof import('@deepseek-ai/dsh-atomic-write')>()
  return { ...actual, writeFileAtomic: async (...args: Parameters<typeof actual.writeFileAtomic>) => {
    if (args[0] === failure.path) throw new Error('Simulated second-file failure')
    return actual.writeFileAtomic(...args)
  } }
})
const disposers: (() => Promise<void>)[] = []
afterEach(async () => { failure.path = ''; vi.unstubAllGlobals(); for (const dispose of disposers.splice(0).reverse()) await dispose() })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'repair-controlled-')); disposers.push(() => rm(root, { recursive: true, force: true }))
  const manifest = { name: 'controlled-fixture', dependencies: { 'safe-package': '1.0.0' }, scripts: { postinstall: 'MUST NEVER EXECUTE' } }
  const lock = (version: string) => JSON.stringify({ lockfileVersion: 3, packages: { '': { dependencies: { 'safe-package': version } }, 'node_modules/safe-package': { version, resolved: `https://registry.npmjs.org/safe-package/-/safe-package-${version}.tgz` } } })
  await writeFile(join(root, 'package.json'), JSON.stringify(manifest)); await writeFile(join(root, 'package-lock.json'), lock('1.0.0'))
  const ctx = new Context(); disposers.push(() => ctx.fiber.dispose())
  const spawn = vi.fn((spec: SubprocessSpawnSpec) => {
    expect(spec.cwd).not.toBe(root); expect(spec.argv).toContain('--ignore-scripts'); expect(spec.argv).toContain('--package-lock-only')
    expect(spec.argv).toContain('--registry=https://registry.npmjs.org'); expect(spec.stdio.stdin).toBe('ignore')
    if (!spec.env) throw new Error('The isolated repair environment is required')
    expect(spec.env.HOME).not.toBe(process.env.HOME); expect(spec.env.npm_config_userconfig).toContain('user.npmrc')
    const done = readFile(join(spec.cwd, 'package.json'), 'utf8').then((text) => {
      const changed = z.object({ dependencies: z.record(z.string(), z.string()) }).parse(JSON.parse(text)); expect(changed.dependencies['safe-package']).toBe('1.0.1')
      expect(JSON.parse(text)).not.toHaveProperty('scripts')
      return writeFile(join(spec.cwd, 'package-lock.json'), lock('1.0.1'))
    }).then(() => ({ exitCode: 0, signal: null }))
    return { done, waitForExit: async () => true }
  })
  ctx.provide('subprocess', { resolveExecutable: vi.fn(async () => '/trusted/npm'), spawn } as never)
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    if (url === 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk') {
      const body = z.record(z.string(), z.array(z.string())).parse(JSON.parse(typeof init?.body === 'string' ? init.body : ''))
      return new Response(JSON.stringify(body['safe-package']?.includes('1.0.0') ? { 'safe-package': [{ title: 'Known controlled advisory', url: 'https://github.com/advisories/GHSA-35jh-r3h4-6jhm', severity: 'high', vulnerable_versions: '<1.0.1' }] } : {}))
    }
    expect(url).toBe('https://api.github.com/advisories/GHSA-35jh-r3h4-6jhm')
    return new Response(JSON.stringify({ ghsa_id: 'GHSA-35jh-r3h4-6jhm', cve_id: null, description: 'Controlled advisory', published_at: null, updated_at: null, vulnerabilities: [{ package: { ecosystem: 'npm', name: 'safe-package' }, vulnerable_version_range: '<1.0.1', first_patched_version: '1.0.1' }] }))
  })
  vi.stubGlobal('fetch', fetcher)
  const signal = new AbortController().signal
  const parsed = await readSupplyChainLock(root, signal); const input = await readRepairInput(root, parsed)
  const source: SupplyChainRun = { workspaceId: 'workspace' as WorkspaceId, sessionId: SessionId('session'), runId: 'run', requestId: 'check', status: 'completed', phase: 'done', createdAt: 0, updatedAt: 0, message: 'Checked', checkedPackages: 1, inputDigest: input.digest, warnings: [], findings: [{ package: 'safe-package', version: '1.0.0', title: 'Known controlled advisory', severity: 'high', vulnerableRange: '<1.0.1', advisoryUrl: 'https://github.com/advisories/GHSA-35jh-r3h4-6jhm', fixedVersion: '1.0.1', fixStatus: 'available', cveIds: [], cweIds: [], relationship: 'direct', environment: 'production' }] }
  const progress = vi.fn<Parameters<typeof repairDefinitions>[5]>(async (_phase, _message, details) => {
    if (details?.recoveryPath) disposers.push(() => rm(details.recoveryPath, { recursive: true, force: true }))
  })
  return { root, ctx, source, signal, input, progress, spawn, fetcher }
}
it('updates only exact direct definitions through fixed shell-free argv and rechecks applied files', async () => {
  const f = await fixture(); const result = await repairDefinitions(f.ctx, f.input, f.source, ['safe-package'], f.signal, f.progress)
  expect(result.changes).toEqual([{ package: 'safe-package', from: '1.0.0', to: '1.0.1' }]); expect(result.result.findings).toEqual([])
  expect(z.object({ dependencies: z.record(z.string(), z.string()) }).parse(JSON.parse(await readFile(join(f.root, 'package.json'), 'utf8'))).dependencies['safe-package']).toBe('1.0.1')
  expect(result.files).toHaveLength(2); expect(result.files[0]?.diff).toContain('version summary')
  expect(z.object({ appliedFiles: z.number() }).parse(JSON.parse(await readFile(join(result.recoveryPath, 'intent.json'), 'utf8'))).appliedFiles).toBe(2)
  expect(f.spawn).toHaveBeenCalledTimes(1); expect(f.fetcher.mock.calls.filter(([url]) => typeof url === 'string' && url.includes('registry.npmjs.org'))).toHaveLength(4)
})
it('rejects stale source definitions before spawning a package manager', async () => {
  const f = await fixture(); f.source.inputDigest = '0'.repeat(64)
  await expect(repairDefinitions(f.ctx, f.input, f.source, ['safe-package'], f.signal, f.progress)).rejects.toThrow('changed')
  expect(f.spawn).not.toHaveBeenCalled()
})
it('preserves concurrent user edits made before apply', async () => {
  const f = await fixture(); const manual = JSON.stringify({ name: 'user-edit', dependencies: { 'safe-package': '1.0.0' } })
  f.progress.mockImplementation(async (phase) => { if (phase === 'applying') await writeFile(join(f.root, 'package.json'), manual) })
  await expect(repairDefinitions(f.ctx, f.input, f.source, ['safe-package'], f.signal, f.progress)).rejects.toThrow('changed')
  expect(await readFile(join(f.root, 'package.json'), 'utf8')).toBe(manual)
})
it('retains original bytes and partial application facts when the second file write fails', async () => {
  const f = await fixture(); failure.path = f.input.files[1]?.path ?? ''
  await expect(repairDefinitions(f.ctx, f.input, f.source, ['safe-package'], f.signal, f.progress)).rejects.toThrow('second-file')
  const details = f.progress.mock.calls.find(([phase]) => phase === 'applying')?.[2]
  expect(details?.recoveryPath).toBeTruthy()
  expect(z.object({ appliedFiles: z.number() }).parse(JSON.parse(await readFile(join(details!.recoveryPath, 'intent.json'), 'utf8'))).appliedFiles).toBe(1)
  expect(await readFile(join(details!.recoveryPath, '1.before'), 'utf8')).toContain('1.0.0')
  expect(z.object({ dependencies: z.record(z.string(), z.string()) }).parse(JSON.parse(await readFile(join(f.root, 'package.json'), 'utf8'))).dependencies['safe-package']).toBe('1.0.1')
})
it('refuses arbitrary package names, absent direct declarations, and unsupported project configuration', async () => {
  const f = await fixture()
  await expect(repairDefinitions(f.ctx, f.input, f.source, ['--registry=evil'], f.signal, f.progress)).rejects.toThrow('Invalid package')
  f.input.manifest['workspaces'] = ['packages/*']
  await expect(repairDefinitions(f.ctx, f.input, f.source, ['safe-package'], f.signal, f.progress)).rejects.toThrow('coordinated')
  expect(f.spawn).not.toHaveBeenCalled()
})
