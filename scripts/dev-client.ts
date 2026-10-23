/** Shared client rebuild pipeline and process ownership for Web and Desktop development. */
import { globSync, readFileSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { build } from 'tsdown'
import type { TsdownBundle } from 'tsdown'
import {
  CLIENT_BUILD_PROFILE_SELECTOR,
  clientBuildProcessEnvironment,
  repositoryClientBuildEnvironment,
} from './client-build-environment.ts'
import { pnpmInvocation } from './pnpm-invocation.ts'
import { referencedProjectsCompilerArgs } from './compile-referenced-projects.ts'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

/** Client-face type emit feeding every tsdown lib entry in the watch set. */
const CLIENT_TYPE_PROGRAM = 'tsconfig.client.json'

/** Compile-shell workspace whose dist `dsh web` serves. */
const SHELL_PACKAGE = '@deepseek-ai/dsh-web-frontend'

/**
 * Test infrastructure builds through the client preset but never enters the
 * shell's module graph, so it is not a dev-loop artifact.
 */
const TEST_INFRASTRUCTURE_PREFIX = 'packages/test-support/'

/**
 * Sample one local public environment for every long-lived watcher stage.
 * @param root - repository root supplying version and Git metadata.
 * @param environment - watcher launch environment supplying public extensions.
 * @returns process environment shared by tsdown and spawned watcher stages.
 */
export function devWebBuildEnvironment(
  root: string,
  environment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return clientBuildProcessEnvironment(environment, repositoryClientBuildEnvironment(root, environment))
}

/**
 * Discover the watch workspace by declaration: every packages/<group>/<name>
 * whose package.json carries `dsh.client` with platform "web" is a client
 * plugin bundle emitter. Scanned once at startup — a package added while
 * watching means restarting this script.
 * @param root - repository root containing the grouped package directories.
 * @returns workspace-relative plugin package directories.
 */
export function discoverPluginDirs(root = repoRoot): string[] {
  const dirs: string[] = []
  for (const manifestPath of globSync('packages/*/*/package.json', { cwd: root }).sort()) {
    const manifest = JSON.parse(readFileSync(join(root, manifestPath), 'utf8')) as {
      dsh?: { client?: { platform?: unknown } }
    }
    if (manifest.dsh?.client?.platform === 'web') dirs.push(dirname(manifestPath).split(sep).join('/'))
  }
  return dirs
}

/**
 * Discover the statically linked library packages: the other half of the same
 * partition {@link discoverPluginDirs} takes. A package that builds through the
 * client preset without declaring `dsh.client` has no loader-delivered browser
 * half, so the compile shell links its `lib/index.js` instead — and an edit to
 * its source reaches the browser only once that bundle is rewritten. Deriving
 * the set from the build preset rather than a hand list keeps it correct when
 * dependency sections move around; deriving it from `dependencies` would not,
 * because client packages declare their build inputs as devDependencies.
 * @param root - repository root containing the grouped package directories.
 * @returns workspace-relative library package directories.
 */
export function discoverLibraryDirs(root = repoRoot): string[] {
  const dirs: string[] = []
  for (const configPath of globSync('packages/*/*/tsdown.config.ts', { cwd: root }).sort()) {
    const dir = dirname(configPath).split(sep).join('/')
    if (dir.startsWith(TEST_INFRASTRUCTURE_PREFIX)) continue
    if (!readFileSync(join(root, configPath), 'utf8').includes('tsdown.client.ts')) continue
    const manifest = JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8')) as {
      dsh?: { client?: unknown }
    }
    if (manifest.dsh?.client === undefined) dirs.push(dir)
  }
  return dirs
}

/**
 * Start the tsdown watch build used by `pnpm run dev:web`.
 * @param root - repository or fixture root passed to tsdown.
 * @param pluginDirs - workspace-relative package directories to watch.
 * @param pollInterval - optional source-watcher polling interval in milliseconds.
 * @returns live bundles after every watcher has completed its initial build and package-owned post-build hooks.
 */
export async function watchClientPlugins(
  root: string,
  pluginDirs: readonly string[],
  pollInterval?: number,
): Promise<TsdownBundle[]> {
  let resolveInitialBuilds: (() => void) | undefined
  const initialBuilds = new Promise<void>((resolve) => { resolveInitialBuilds = resolve })
  const initialized = new WeakSet<object>()
  const readiness: { expectedBuilds?: number; initializedBuilds: number } = { initializedBuilds: 0 }
  const bundles = await build({
    cwd: root,
    workspace: [...pluginDirs],
    configLoader: 'tsx',
    watch: true,
    // Workspace hooks override inline hooks; onSuccess runs after each package's build:done work.
    onSuccess: (options) => {
      if (initialized.has(options)) return
      initialized.add(options)
      readiness.initializedBuilds += 1
      if (
        readiness.expectedBuilds !== undefined
        && readiness.initializedBuilds >= readiness.expectedBuilds
      ) resolveInitialBuilds?.()
    },
    ...pollInterval !== undefined
      ? { inputOptions: { watch: { watcher: { usePolling: true, pollInterval } } } }
      : {},
  })
  readiness.expectedBuilds = bundles.length
  if (readiness.initializedBuilds >= readiness.expectedBuilds) resolveInitialBuilds?.()
  await initialBuilds
  return bundles
}

/** One long-lived stage process as the supervisor observes it. */
export interface StageHandle {
  /** Command label used in diagnostics. */
  readonly name: string
  /** Settles with the exit code, or null when a signal ended the stage. */
  readonly exited: Promise<number | null>
  /**
   * Deliver one signal; a no-op once the stage has exited.
   * @param signal - the signal to send.
   */
  kill(signal: NodeJS.Signals): void
}

/** How a requested stop reaches the stages. */
export interface StageStop {
  /** Signal sent to every live stage first; omitted when the terminal already delivered SIGINT to them. */
  readonly signal?: NodeJS.Signals | undefined
  /** Milliseconds to wait for exits before escalating to SIGTERM, and again before SIGKILL. */
  readonly graceMs: number
}

/**
 * Own the live stages: report a stage that exits before a stop was requested,
 * and on a requested stop signal, wait, and escalate until every stage has exited.
 */
export class StageSupervisor {
  private readonly live = new Set<StageHandle>()
  private stopping = false

  /**
   * @param onStale - receives the stage name and exit code when a stage exits before a stop was requested.
   */
  constructor(private readonly onStale: (stage: string, code: number | null) => void) {}

  /**
   * Track one started stage until it exits.
   * @param stage - the stage to supervise.
   */
  add(stage: StageHandle): void {
    this.live.add(stage)
    void stage.exited.then((code) => {
      this.live.delete(stage)
      if (!this.stopping) this.onStale(stage.name, code)
    })
  }

  /**
   * Stop every live stage and resolve once all of them have exited.
   * @param stop - initial signal and the grace period between escalation steps.
   */
  async stop(stop: StageStop): Promise<void> {
    this.stopping = true
    const escalation: (NodeJS.Signals | undefined)[] = [stop.signal]
    if (stop.signal !== 'SIGTERM') escalation.push('SIGTERM')
    for (const signal of escalation) {
      if (this.live.size === 0) return
      if (signal !== undefined) for (const stage of this.live) stage.kill(signal)
      await this.settled(stop.graceMs)
    }
    for (const stage of this.live) stage.kill('SIGKILL')
    await Promise.all([...this.live].map(stage => stage.exited))
  }

  private async settled(graceMs: number): Promise<void> {
    let timer: NodeJS.Timeout | undefined
    await Promise.race([
      Promise.all([...this.live].map(stage => stage.exited)),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, graceMs) }),
    ])
    clearTimeout(timer)
  }
}

/**
 * Spawn one long-lived stage with inherited stdio and hand it to the supervisor.
 * @param supervisor - owner that reports an unexpected exit and stops the stage on shutdown.
 * @param name - command label used in diagnostics.
 * @param command - executable, resolved from the workspace bins when `local` is set.
 * @param args - command arguments.
 * @param local - whether to resolve `command` from the workspace's installed bins.
 */
export function spawnStage(
  supervisor: StageSupervisor,
  name: string,
  command: string,
  args: readonly string[],
  local: boolean,
): void {
  const child = execa(command, [...args], {
    cwd: repoRoot,
    stdio: 'inherit',
    preferLocal: local,
    reject: false,
  })
  supervisor.add({
    name,
    exited: child.then(result => result.exitCode ?? null),
    kill(signal) { child.kill(signal) },
  })
}

/**
 * Build every repository artifact, without the aggregate test and script
 * typechecks, with the launch environment untouched:
 * `scripts/build.ts` samples the public client values itself.
 * @returns the build's exit code, or null when a signal ended it.
 */
export async function runBuild(): Promise<number | null> {
  const invocation = pnpmInvocation(['run', 'build:artifacts'])
  const result = await execa(invocation.command, invocation.args, { cwd: repoRoot, stdio: 'inherit', reject: false })
  return result.exitCode ?? null
}


/** Start the shared client artifact pipeline; emitOnly compiles without type diagnostics. */
export async function startClientRebuilds(supervisor: StageSupervisor, pollInterval?: number, emitOnly = false): Promise<TsdownBundle[]> {
  const environment = devWebBuildEnvironment(repoRoot)
  for (const key of Object.keys(process.env)) {
    if (key === CLIENT_BUILD_PROFILE_SELECTOR || key.startsWith('DSH_CLIENT_')) Reflect.deleteProperty(process.env, key)
  }
  for (const [key, value] of Object.entries(environment)) {
    if (key.startsWith('DSH_CLIENT_') && value !== undefined) process.env[key] = value
  }
  const plugins = discoverPluginDirs()
  const libraries = discoverLibraryDirs()
  if (plugins.length === 0 || libraries.length === 0) throw new Error('client development: no client packages discovered')
  const compiler = emitOnly ? referencedProjectsCompilerArgs(repoRoot, 'client', 'benchmark-emit')
    : [fileURLToPath(import.meta.resolve('typescript/bin/tsc')), '-b', CLIENT_TYPE_PROGRAM]
  spawnStage(supervisor, 'client compiler watch', process.execPath, [
    ...compiler, '--watch', '--preserveWatchOutput',
    ...pollInterval === undefined ? [] : ['--watchFile', 'fixedPollingInterval', '--watchDirectory', 'fixedPollingInterval'],
  ], false)
  const bundles = await watchClientPlugins(repoRoot, [...plugins, ...libraries], pollInterval)
  spawnStage(supervisor, 'Web shell watch', 'pnpm', ['--filter', SHELL_PACKAGE, 'run', 'watch'], false)
  console.log(`client development: watching ${String(plugins.length)} plugins and ${String(libraries.length)} libraries`)
  return bundles
}
