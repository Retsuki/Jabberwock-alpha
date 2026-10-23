/** Definition-only public dependency repair; project code and configuration never execute. */
import { constants } from 'node:fs'
import { open, realpath, mkdtemp, mkdir, writeFile, readFile, rm, lstat } from 'node:fs/promises'
import { dirname, join, isAbsolute } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash, randomUUID } from 'node:crypto'
import { valid, validRange, gt, rcompare } from 'semver'
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-app-boot'
import type {} from '@deepseek-ai/dsh-subprocess'
import { readSupplyChainLock, scanSupplyChain, type SupplyChainLock } from './supply-chain-scanner.ts'
import type { SupplyChainRun, SupplyChainRepair, SupplyChainRepairChange, SupplyChainRepairFile } from './supply-chain-types.ts'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const object = (value: unknown): Record<string, unknown> | undefined => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
const packageName = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/
/** Exact bounded inputs held only by the repair owner. */
export interface RepairInput {
  /** Canonical registered directory. */ root: string
  /** Exact definition file bytes. */ files: { path: string; text: string; mode: number }[]
  /** Joint definition identity. */ digest: string
  /** Parsed manifest, never included in model input. */ manifest: Record<string, unknown>
}
/** A refusal does not modify dependency definitions. */
export class RepairRefusal extends Error {
  /** @param status Factual refusal type. @param message Owner-readable reason. */
  constructor(readonly status: 'unsupported' | 'stale', message: string) { super(message) }
}
async function boundedFile(path: string, maximum: number) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > maximum) throw new RepairRefusal('unsupported', 'Definition files exceed supported regular-file bounds.')
    return { path, text: await handle.readFile('utf8'), mode: stat.mode & 0o777 }
  } finally { await handle.close() }
}
/** Read exact local definitions without following file symlinks.
 * @param root Registered Workspace directory.
 * @param lock Trusted parsed lock descriptor.
 * @returns Exact input identity and private original bytes.
 */
export async function readRepairInput(root: string, lock: SupplyChainLock): Promise<RepairInput> {
  root = await realpath(root)
  if (await lstat(join(root, 'pnpm-workspace.yaml')).then(() => true, () => false)) throw new RepairRefusal('unsupported', 'pnpm workspace configuration requires a coordinated manual update.')
  if (lock.lockfile.scope !== 'project' || dirname(lock.lockfile.path) !== root) throw new RepairRefusal('unsupported', 'Shared workspace locks require a coordinated update and are not automatically repaired.')
  const files = [await boundedFile(join(root, 'package.json'), 1024 * 1024), await boundedFile(lock.lockfile.path, 16 * 1024 * 1024)]
  const manifest = object(JSON.parse(files[0]?.text ?? ''))
  if (!manifest) throw new RepairRefusal('unsupported', 'A valid standalone package manifest is required.')
  return { root, files, manifest, digest: hash(files.map(file => `${file.path}\0${file.text}`).join('\0')) }
}
/** Update validated direct public package definitions in an isolated stage, then apply after fresh advisory verification.
 * @param ctx Existing managed subprocess and bundled package manager capabilities.
 * @param input Exact owner-read originals.
 * @param source Saved result whose complete package groups were selected.
 * @param packages Requested canonical names, not version or command input.
 * @param signal Owned job cancellation/deadline.
 * @param progress Durable stage callback before either definition is replaced.
 * @returns New authoritative lock and advisory comparison.
 */
export async function repairDefinitions(ctx: Context, input: RepairInput, source: SupplyChainRun, packages: string[], signal: AbortSignal,
  progress: (phase: SupplyChainRepair['phase'], message: string, details?: { changes: SupplyChainRepairChange[]; files: SupplyChainRepairFile[]; recoveryPath: string; applied?: boolean }) => Promise<void>,
) {
  if (!source.inputDigest) throw new RepairRefusal('unsupported', 'This older check has no definition fingerprint. Run a new check before automatic repair.')
  const runtime = ctx.get('subprocess')
  if (!runtime) throw new RepairRefusal('unsupported', 'A managed subprocess provider is required for dependency repair.')
  const lock = await readSupplyChainLock(input.root, signal)
  if ((await readRepairInput(input.root, lock)).digest !== input.digest || (source.inputDigest && source.inputDigest !== input.digest)) throw new RepairRefusal('stale', 'Dependency definitions changed since the saved check. Start a new check before applying a repair.')
  if (['workspaces', 'pnpm', 'overrides', 'resolutions'].some(key => Object.hasOwn(input.manifest, key))) throw new RepairRefusal('unsupported', 'Workspace, override, catalog or pnpm project configuration requires a coordinated manual update.')
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) for (const [name, value] of Object.entries(object(input.manifest[field]) ?? {})) {
    if (name.length > 214 || !packageName.test(name) || typeof value !== 'string' || !validRange(value)) throw new RepairRefusal('unsupported', 'Only ordinary public registry semver dependency declarations can be updated automatically.')
  }
  for (const dependency of lock.dependencies) if (dependency.relationship === 'unknown') throw new RepairRefusal('unsupported', 'The lock does not establish complete direct dependency attribution.')
  if (lock.warnings.length) throw new RepairRefusal('unsupported', 'The lock has incomplete or unsupported dependency coverage. No definitions were changed.')
  const current = await scanSupplyChain(lock, { signal, progress: async () => {} })
  if (current.warnings.length) throw new RepairRefusal('unsupported', 'Current advisory metadata is incomplete; automatic fix selection is unavailable.')
  const changes: SupplyChainRepairChange[] = []
  const proposed = structuredClone(input.manifest)
  for (const name of packages) {
    if (!packageName.test(name) || name.length > 214) throw new RepairRefusal('unsupported', 'Invalid package identity.')
    const saved = source.findings.filter(row => row.package === name)
    const rows = current.findings.filter(row => row.package === name)
    const versions = [...new Set(saved.map(row => row.version))]
    const installed = lock.dependencies.filter(row => row.name === name)
    if (versions.length !== 1 || installed.length !== 1 || installed[0]?.version !== versions[0]) throw new RepairRefusal('stale', 'The selected installed package version no longer matches the saved check.')
    if (!rows.length || rows.some(row => row.relationship !== 'direct' || row.fixStatus !== 'available' || !row.fixedVersion || !valid(row.fixedVersion))) throw new RepairRefusal('unsupported', `No complete direct public fix is established for ${name}.`)
    const candidates = [...new Set(rows.flatMap(row => row.fixedVersion ? [row.fixedVersion] : []))].sort(rcompare)
    const target = candidates[0], previous = installed[0]?.version
    if (!target || !previous || !gt(target, previous)) throw new RepairRefusal('unsupported', `No newer exact public fixed version is established for ${name}.`)
    let declared = false
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      const entries = object(proposed[field])
      if (entries && Object.hasOwn(entries, name)) { entries[name] = target; declared = true }
    }
    if (!declared) throw new RepairRefusal('unsupported', 'Transitive dependencies are not added as new direct dependencies.')
    changes.push({ package: name, from: previous, to: target })
  }
  const candidateLock = { ...lock, dependencies: changes.map(change => ({ name: change.package, version: change.to, relationship: 'direct' as const, environment: 'unknown' as const })) }
  const candidateCheck = await scanSupplyChain(candidateLock, { signal, progress: async () => {} })
  if (candidateCheck.findings.length || candidateCheck.warnings.length) throw new RepairRefusal('unsupported', 'The proposed versions still match current advisories or could not be completely checked.')
  const stage = await mkdtemp(join(tmpdir(), 'jabberwock-dependency-stage-'))
  try {
    await mkdir(join(stage, 'home'), { mode: 0o700 }); await writeFile(join(stage, 'user.npmrc'), ''); await writeFile(join(stage, 'global.npmrc'), '')
    const stagedManifest = Object.fromEntries(Object.entries(proposed).filter(([key]) => ['name', 'version', 'private', 'dependencies', 'devDependencies', 'optionalDependencies'].includes(key)))
    await writeFile(join(stage, 'package.json'), JSON.stringify(stagedManifest, null, 2) + '\n')
    const lockName = lock.lockfile.packageManager === 'npm' ? 'package-lock.json' : 'pnpm-lock.yaml'
    const originalLock = input.files.find(file => file.path === lock.lockfile.path)
    if (!originalLock) throw new RepairRefusal('stale', 'The original lock is unavailable.')
    // Reject lock references that could direct the package manager outside the public registry.
    if (/\b(?:git\+|git:|file:|link:|workspace:)|https?:\/\/(?!registry\.npmjs\.org(?:\/|["'\s]))/.test(originalLock.text)) throw new RepairRefusal('unsupported', 'Non-public-registry lock references require manual review.')
    await writeFile(join(stage, lockName), originalLock.text)
    const env: NodeJS.ProcessEnv = {}
    for (const key of Object.keys(process.env)) {
      if (/^(?:npm_config_|pnpm_|corepack_|node_options$|node_path$)/i.test(key)) env[key] = undefined
    }
    Object.assign(env, { HOME: join(stage, 'home'), USERPROFILE: join(stage, 'home'), XDG_CONFIG_HOME: join(stage, 'home'), npm_config_userconfig: join(stage, 'user.npmrc'), npm_config_globalconfig: join(stage, 'global.npmrc'), CI: 'true' })
    const bundled = lock.lockfile.packageManager === 'pnpm' ? ctx.get('profileContext')?.packageManager : undefined
    Object.assign(env, bundled?.env)
    const lookupEnv = Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined))
    const executable = await runtime.resolveExecutable(bundled?.command ?? lock.lockfile.packageManager, lookupEnv, signal)
    if (!isAbsolute(executable) || executable.includes('/node_modules/.bin/') || executable.startsWith(input.root + '/')) throw new RepairRefusal('unsupported', 'A trusted package manager outside the project is required.')
    const args = lock.lockfile.packageManager === 'npm' ? ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'] : ['install', '--lockfile-only', '--ignore-scripts', '--ignore-pnpmfile', '--ignore-workspace', '--no-frozen-lockfile', '--config.manage-package-manager-versions=false']
    await progress('updating', 'Updating definition files only in an isolated stage. Project scripts and hooks are disabled.')
    const processHandle = runtime.spawn({ argv: [executable, ...bundled?.args ?? [], ...args, '--registry=https://registry.npmjs.org'], cwd: stage, env, signal, graceMs: 1000, stdio: { stdin: 'ignore', stdout: { maxBytes: 4096 }, stderr: { maxBytes: 4096 } } })
    const outcome = await processHandle.done
    if (outcome.exitCode !== 0 || !(await processHandle.waitForExit(signal))) throw new Error('The fixed package manager did not complete. No project definitions were changed.')
    signal.throwIfAborted()
    const stagedLock = await readSupplyChainLock(stage, signal)
    await progress('rechecking', 'Checking the generated dependency lock against current public advisories.')
    const result = await scanSupplyChain(stagedLock, { signal, progress: async () => {} })
    if (result.warnings.some(warning => !warning.startsWith('Optional '))) throw new Error('The generated lock could not be completely verified. No project definitions were changed.')
    if (result.findings.some(row => packages.includes(row.package))) throw new Error('Current advisories remain for a selected package. No project definitions were changed.')
    const next = [JSON.stringify(proposed, null, 2) + '\n', await readFile(join(stage, lockName), 'utf8')]
    const oldVersions = new Set(lock.dependencies.map(row => `${row.name}@${row.version}`))
    const newVersions = new Set(stagedLock.dependencies.map(row => `${row.name}@${row.version}`))
    const graphChanges = [...[...oldVersions].filter(value => !newVersions.has(value)).map(value => `- ${value}`),
      ...[...newVersions].filter(value => !oldVersions.has(value)).map(value => `+ ${value}`)]
    const summary = graphChanges.join('\n').slice(0, 90000)
    const files = input.files.map((file, index) => ({ path: index === 0 ? 'package.json' : lockName, beforeHash: hash(file.text), afterHash: hash(next[index] ?? ''), diff: `Dependency version summary (full original bytes retained privately):\n${summary}` }))
    const recoveryRoot = join(ctx.get('profileContext')?.home ?? tmpdir(), 'supply-chain-recovery')
    await mkdir(recoveryRoot, { recursive: true, mode: 0o700 })
    const recoveryPath = join(recoveryRoot, randomUUID()); await mkdir(recoveryPath, { mode: 0o700 })
    for (const [index, file] of input.files.entries()) await writeFile(join(recoveryPath, `${index}.before`), file.text, { mode: 0o600 })
    await writeFile(join(recoveryPath, 'intent.json'), JSON.stringify({ files, appliedFiles: 0 }), { mode: 0o600 })
    await progress('applying', 'Applying verified dependency definitions. Runtime installation and application tests remain unperformed.', { changes, files, recoveryPath })
    await withFileLock(join(input.root, 'package.json'), async () => {
      if ((await readRepairInput(input.root, lock)).digest !== input.digest) throw new RepairRefusal('stale', 'Definitions changed while the update was prepared; the project was left untouched.')
      for (const [index, file] of input.files.entries()) {
        signal.throwIfAborted()
        await writeFileAtomic(file.path, next[index] ?? '', { mode: file.mode })
        await writeFileAtomic(join(recoveryPath, 'intent.json'), JSON.stringify({ files, appliedFiles: index + 1 }), { mode: 0o600 })
      }
    }, { signal, waitMs: 10000 })
    await progress('rechecking', 'Definition files were applied. Performing a final public advisory check; application tests remain unperformed.', { changes, files, recoveryPath, applied: true })
    const appliedLock = await readSupplyChainLock(input.root, signal)
    const appliedInput = await readRepairInput(input.root, appliedLock)
    if (appliedInput.files.some((file, index) => hash(file.text) !== files[index]?.afterHash)) throw new RepairRefusal('stale', 'Definitions changed during application. Inspect recovery records before proceeding.')
    const finalResult = await scanSupplyChain(appliedLock, { signal, progress: async () => {} })
    if ((await readRepairInput(input.root, appliedLock)).digest !== appliedInput.digest) throw new RepairRefusal('stale', 'Definitions changed during final verification. Saved results are not a complete verification of the current files.')
    return { lock: appliedLock, result: finalResult, changes, files, recoveryPath }
  } finally { await rm(stage, { recursive: true, force: true }) }
}
