/** Desktop development: client hot replacement and serialized native rebuild/restart. */
import { existsSync, globSync, watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { execa } from 'execa'
import type { TsdownBundle } from 'tsdown'
import { devWebBuildEnvironment, discoverLibraryDirs, discoverPluginDirs, StageSupervisor, startClientRebuilds } from './dev-client.ts'
import { libraryBuildSteps } from './compile-referenced-projects.ts'
import { pnpmInvocation } from './pnpm-invocation.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const { values } = parseArgs({ options: { 'skip-build': { type: 'boolean', default: false } } })
const environment = {
  ...devWebBuildEnvironment(root),
  DSH_DESKTOP_WATCH: '1',
  DSH_DESKTOP_OPEN_DEVTOOLS: process.env.DSH_DESKTOP_OPEN_DEVTOOLS ?? '0',
  DSH_DESKTOP_MAIN_INSPECT_PORT: process.env.DSH_DESKTOP_MAIN_INSPECT_PORT ?? '19229',
  DSH_DESKTOP_RENDERER_DEBUG_PORT: process.env.DSH_DESKTOP_RENDERER_DEBUG_PORT ?? '19222',
  DSH_DESKTOP_HOST_INSPECT_PORT: process.env.DSH_DESKTOP_HOST_INSPECT_PORT ?? '19230',
}
const shutdown = Promise.withResolvers<number>()
let stopping = false
let restarting = false
let pending = false
let timer: NodeJS.Timeout | undefined
let supervisor: StageSupervisor | undefined
let bundles: TsdownBundle[] = []
let desktop: ReturnType<typeof spawnDesktop> | undefined
const sourceWatches: FSWatcher[] = []

// Signal and source callbacks may update these while asynchronous work is suspended.
function isStopping(): boolean { return stopping }
function hasPendingRebuild(): boolean { return pending }

function stop(code: number): void {
  if (stopping) return
  stopping = true
  clearTimeout(timer)
  shutdown.resolve(code)
}
process.on('SIGINT', () => { stop(130) })
process.on('SIGTERM', () => { stop(0) })

async function run(command: string, args: readonly string[]): Promise<void> {
  const child = execa(command, [...args], { cwd: root, env: environment, stdio: 'inherit', reject: false })
  const interrupt = () => { child.kill('SIGTERM') }
  process.on('SIGINT', interrupt)
  process.on('SIGTERM', interrupt)
  try {
    const result = await child
    if (result.exitCode !== 0) throw new Error(`desktop development: build exited with ${String(result.exitCode)}`)
  } finally {
    process.off('SIGINT', interrupt)
    process.off('SIGTERM', interrupt)
  }
}

async function emitArtifacts(): Promise<void> {
  // Emission is necessary to run the app; diagnostics and test programs are not run.
  for (const step of libraryBuildSteps(root, 'all', 'benchmark-emit')) {
    if (stopping) return
    console.log(`desktop development: ${step.label} (emit only)`)
    await run(step.command, step.args)
  }
  const invocation = pnpmInvocation(['run', 'build:web'])
  if (!stopping) await run(invocation.command, invocation.args)
}

function spawnDesktop(command: string, args: readonly string[]) {
  return execa(command, [...args], {
    cwd: root, env: environment, stdio: 'inherit', reject: false, detached: process.platform !== 'win32',
  })
}

async function stopDesktop(): Promise<void> {
  const child = desktop
  desktop = undefined
  if (child === undefined) return
  const signal = (value: NodeJS.Signals) => {
    if (process.platform === 'win32') child.kill(value)
    else if (child.pid !== undefined) {
      try { process.kill(-child.pid, value) } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
      }
    }
  }
  signal('SIGTERM')
  const deadline = setTimeout(() => { signal('SIGKILL') }, 6_000)
  try { await child } finally { clearTimeout(deadline) }
}

async function stopClient(): Promise<void> {
  await supervisor?.stop({ signal: 'SIGTERM', graceMs: 6_000 })
  supervisor = undefined
  for (const bundle of bundles) await bundle[Symbol.asyncDispose]()
  bundles = []
}

async function launch(): Promise<void> {
  supervisor = new StageSupervisor((stage, code) => {
    console.error(`desktop development: ${stage} stopped (${String(code)})`)
    stop(1)
  })
  bundles = await startClientRebuilds(supervisor, 500, true)
  if (stopping) return
  const invocation = pnpmInvocation(['run', 'start:desktop'])
  const child = spawnDesktop(invocation.command, invocation.args)
  desktop = child
  void child.then((result) => {
    if (desktop !== child || restarting || stopping) return
    console.log('desktop development: application closed; stopping watchers')
    stop(result.exitCode ?? 1)
  })
  console.log('desktop development: ready; UI changes update live, Host/Electron changes rebuild and restart')
}

async function rebuild(): Promise<void> {
  if (restarting || stopping) return
  restarting = true
  try {
    while (hasPendingRebuild() && !isStopping()) {
      pending = false
      console.log('desktop development: native source changed; restarting after rebuild')
      // Client watchers and full bundle writes never overlap.
      await stopDesktop()
      await stopClient()
      await emitArtifacts()
      if (!isStopping() && !hasPendingRebuild()) await launch()
    }
  } catch (error) {
    console.error(error)
    stop(1)
  } finally { restarting = false }
}

const plugins = discoverPluginDirs()
const libraries = discoverLibraryDirs()
function clientOnly(path: string): boolean {
  return path.startsWith('apps/web/')
    || libraries.some(dir => path.startsWith(`${dir}/src/`))
    || plugins.some(dir => path.startsWith(`${dir}/src/client/`) || (path.startsWith(`${dir}/src/`) && /\.(css|svg|png|webp)$/.test(path)))
}

function watchSources(): void {
  const directories = [
    'apps/desktop/src', 'apps/desktop-host/src', 'apps/cli/src', 'apps/desktop/scripts',
    ...globSync('packages/*/*/src', { cwd: root }),
  ]
  for (const directory of directories) {
    if (!existsSync(join(root, directory))) continue
    const watcher = watch(join(root, directory), { recursive: true }, (_event, filename) => {
      if (filename === null || stopping) return
      const path = relative(root, resolve(root, directory, filename)).split(sep).join('/')
      if (clientOnly(path)) return
      pending = true
      clearTimeout(timer)
      timer = setTimeout(() => { void rebuild() }, 400)
    })
    watcher.on('error', (error) => { console.error(error); stop(1) })
    sourceWatches.push(watcher)
  }
}

try {
  const built = existsSync(join(root, 'apps/desktop/lib/main.js')) && existsSync(join(root, 'apps/web/dist/index.html'))
  if (!values['skip-build'] || !built) await emitArtifacts()
  if (!isStopping()) {
    await Promise.race([launch(), shutdown.promise])
    if (!isStopping()) watchSources()
  }
} catch (error) {
  console.error(error)
  stop(1)
}
const code = await shutdown.promise
for (const watcher of sourceWatches) watcher.close()
await stopDesktop()
await stopClient()
process.exit(code)
