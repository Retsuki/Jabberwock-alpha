/** Web development: shared client watchers plus the supported dsh web profile. */
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { StageSupervisor, runBuild, spawnStage, startClientRebuilds } from './dev-client.ts'
export { devWebBuildEnvironment, discoverPluginDirs, discoverLibraryDirs, watchClientPlugins, StageSupervisor } from './dev-client.ts'
export type { StageHandle, StageStop } from './dev-client.ts'
const STOP_GRACE_MS = 6_000
/** Resolved `dev-web` command line: the script's own flags plus the arguments forwarded to `dsh web`. */
export interface DevWebArguments {
  /** Skip the `pnpm run build:artifacts` that otherwise precedes the watchers. */
  readonly skipBuild: boolean
  /** Start `dsh web`; false keeps only the rebuild watchers beside an already running server. */
  readonly serve: boolean
  /** Source-watcher polling interval in milliseconds; undefined selects native watching. */
  readonly pollInterval: number | undefined
  /** Arguments forwarded verbatim to `dsh web`, in order. */
  readonly appArgs: readonly string[]
}

/** Polling interval selected by a bare `--poll`. */
const DEFAULT_POLL_INTERVAL = 500

/**
 * Parse the script's command line. `--skip-build`, `--no-serve`, and `--poll[=ms]`
 * belong to this script; a bare `--` is dropped; every other token is forwarded
 * to `dsh web`.
 * @param argv - arguments after the script path.
 * @returns the resolved flags and forwarded arguments.
 * @throws Error when `--poll` carries a non-positive or non-integer interval, or
 * when `--no-serve` leaves forwarded arguments without a `dsh web` process.
 */
export function parseDevWebArguments(argv: readonly string[]): DevWebArguments {
  let skipBuild = false
  let serve = true
  let pollInterval: number | undefined
  const appArgs: string[] = []
  for (const arg of argv) {
    // `pnpm run` forwards a `--` separator verbatim; it carries no meaning here.
    if (arg === '--') continue
    if (arg === '--skip-build') skipBuild = true
    else if (arg === '--no-serve') serve = false
    else if (arg === '--poll' || arg.startsWith('--poll=')) {
      pollInterval = arg === '--poll' ? DEFAULT_POLL_INTERVAL : Number(arg.slice('--poll='.length))
      if (!Number.isInteger(pollInterval) || pollInterval <= 0) throw new Error(`dev-web: invalid --poll interval "${arg}"`)
    } else appArgs.push(arg)
  }
  if (!serve && appArgs.length > 0) {
    throw new Error(`dev-web: --no-serve leaves no dsh web process for ${appArgs[0] ?? ''}`)
  }
  return { skipBuild, serve, pollInterval, appArgs }
}

const invokedPath = process.argv[1]
const isMain = invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href
if (isMain) {
  let options: DevWebArguments
  try {
    options = parseDevWebArguments(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    console.error('dev-web: usage: pnpm run dev:web [--skip-build] [--no-serve] [--poll[=ms]] [dsh web arguments]')
    process.exit(1)
  }

  // Shutdown is requested once, by a terminal signal or by a stage exiting on
  // its own; `signal` stays unset for SIGINT because the terminal's process
  // group already delivered it to every stage.
  const shutdown = Promise.withResolvers<number>()
  const requested: { code?: number; signal?: NodeJS.Signals } = {}
  const shutdownRequested = (): boolean => requested.code !== undefined
  const requestShutdown = (code: number, signal: NodeJS.Signals | undefined): void => {
    if (shutdownRequested()) return
    requested.code = code
    if (signal !== undefined) requested.signal = signal
    shutdown.resolve(code)
  }
  const supervisor = new StageSupervisor((stage, code) => {
    console.error(`dev-web: ${stage} exited (code ${String(code)}); stopping the other stages`)
    requestShutdown(1, 'SIGTERM')
  })
  // Persistent listeners, not `once`: the tsdown watchers bundle signal-exit,
  // which re-raises a signal whenever it finds no other listener left and would
  // terminate this process in the middle of the teardown below.
  process.on('SIGINT', () => { requestShutdown(130, undefined) })
  process.on('SIGTERM', () => { requestShutdown(0, 'SIGTERM') })

  const buildExit = options.skipBuild ? 0 : await runBuild()
  if (shutdownRequested()) process.exit(await shutdown.promise)
  if (buildExit !== 0) {
    console.error(`dev-web: pnpm run build:artifacts exited (code ${String(buildExit)})`)
    process.exit(1)
  }

  const bundles = await startClientRebuilds(supervisor, options.pollInterval)
  if (!shutdownRequested()) {
    // The same launch vector as the root `dsh` script, so the served Host runs
    // from source exactly as `pnpm dsh web` would.
    if (options.serve) {
      spawnStage(supervisor, 'dsh web', process.execPath, [
        '--import', 'tsx/esm', 'apps/cli/src/bin.ts', 'web', ...options.appArgs,
      ], false)
    }
  }

  const exitCode = await shutdown.promise
  await supervisor.stop({ signal: requested.signal, graceMs: STOP_GRACE_MS })
  for (const bundle of bundles) await bundle[Symbol.asyncDispose]()
  process.exit(exitCode)
}
