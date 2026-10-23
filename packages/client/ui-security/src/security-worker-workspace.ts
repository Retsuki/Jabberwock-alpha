/** Private, flat-file Worker scratch space and fail-closed offline execution. */
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, readdir, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'

const MAX_FILE_BYTES = 1024 * 1024
const MAX_OUTPUT_BYTES = 64 * 1024
const COMMAND_TIMEOUT_MS = 30_000

/** Operations exposed only to the owning Worker, never general project files. */
export interface WorkerWorkspace {
  /** Canonical private directory; also the command working directory. */
  root: string
  /** List regular scratch files, omitting symlinks and other filesystem objects. */
  list(): Promise<string>
  /** Read one scratch filename; paths and symlinks are rejected. */
  read(name: string): Promise<string>
  /** Write one UTF-8 scratch filename, rejecting links and oversized content. */
  write(name: string, text: string): Promise<string>
  /** Run an offline shell command under kernel-enforced confinement or refuse it. */
  command(command: string, signal?: AbortSignal): Promise<string>
}

function filename(name: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(name) || name === '.' || name === '..') throw new Error('Use a single scratch filename without directories')
  return name
}

async function directory(path: string): Promise<string> {
  await mkdir(path, { mode: 0o700 }).catch((error: unknown) => {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error
  })
  const entry = await lstat(path)
  if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error('Worker scratch directory must not be a symlink')
  return realpath(path)
}

function quote(value: string): string { return JSON.stringify(value) }

// Existing ctx.sandbox deliberately governs file writes only and leaves reads/network
// unrestricted. Offline investigation needs a stricter deny-default Seatbelt policy.
function offlineProfile(root: string): string {
  return [
    '(version 1)', '(deny default)',
    // Mac process-group ownership cannot recover escaped descendants. Denying fork
    // keeps commands single-process; pipelines and background jobs are unsupported.
    '(allow process-exec sysctl-read)',
    '(allow file-read-metadata)',
    `(allow file-read* (subpath ${quote(root)}) (subpath "/bin") (subpath "/usr/bin") (subpath "/usr/lib") (subpath "/System/Library") (subpath "/System/Cryptexes") (subpath "/private/preboot/Cryptexes") (subpath "/private/etc/ssl") (subpath "/Library/Apple/System/Library"))`,
    `(allow file-write* (subpath ${quote(root)}) (literal "/dev/null"))`,
    '(allow file-read* (literal "/") (literal "/dev/null") (literal "/dev/random") (literal "/dev/urandom"))',
    // No network, mach lookup, user home, inherited credentials, or writable host temp.
  ].join('\n')
}

/** Create scratch tools rooted beneath the Harness home for one opaque Worker owner.
 * @param subprocess - existing managed process provider, when mounted.
 * @param home - trusted Harness home; it must already exist.
 * @param owner - opaque run ownership identity, hashed rather than used as a path.
 * @returns flat-file tools and an offline command tool with no unconfined fallback.
 */
export async function createWorkerWorkspace(
  subprocess: SubprocessRuntime | undefined, home: string, owner: string,
): Promise<WorkerWorkspace> {
  const parent = await directory(join(await realpath(home), 'security-worker-files'))
  const root = await directory(join(parent, createHash('sha256').update(owner).digest('hex')))
  return {
    root,
    async list() {
      const entries = await readdir(root, { withFileTypes: true })
      return JSON.stringify(entries.filter(entry => entry.isFile()).map(entry => entry.name).sort())
    },
    async read(name) {
      const handle = await open(join(root, filename(name)), constants.O_RDONLY | constants.O_NOFOLLOW)
      try {
        const stat = await handle.stat()
        if (!stat.isFile() || stat.nlink !== 1) throw new Error('Scratch file must be a regular file without hard links')
        const buffer = Buffer.alloc(Math.min(stat.size, MAX_OUTPUT_BYTES))
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
        return JSON.stringify({ text: buffer.subarray(0, bytesRead).toString('utf8'), truncated: stat.size > bytesRead })
      } finally { await handle.close() }
    },
    async write(name, text) {
      if (Buffer.byteLength(text) > MAX_FILE_BYTES) throw new Error('Scratch file exceeds 1 MiB')
      const handle = await open(join(root, filename(name)), constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW, 0o600)
      try {
        const stat = await handle.stat()
        if (!stat.isFile() || stat.nlink !== 1) throw new Error('Scratch file must be a regular file without hard links')
        await handle.truncate(0)
        await handle.writeFile(text, 'utf8')
        return JSON.stringify({ name, bytes: Buffer.byteLength(text) })
      } finally { await handle.close() }
    },
    async command(command, signal) {
      if (process.platform !== 'darwin' || !subprocess) throw new Error('Offline command sandbox is unavailable on this host; command was not executed')
      if (!command.trim() || command.length > 20_000) throw new Error('Command must contain 1 to 20000 characters')
      const deadline = AbortSignal.timeout(COMMAND_TIMEOUT_MS)
      const cancellation = signal ? AbortSignal.any([signal, deadline]) : deadline
      cancellation.throwIfAborted()
      // Tombstone every ambient variable because subprocess intentionally inherits ordinary
      // parent environment. HOME/TMPDIR are private; shell startup hooks are not admitted.
      const env: NodeJS.ProcessEnv = Object.fromEntries(Object.keys(process.env).map(key => [key, undefined]))
      Object.assign(env, { PATH: '/usr/bin:/bin', HOME: root, TMPDIR: root, LANG: 'en_US.UTF-8' })
      const handle = subprocess.spawn({
        argv: ['/usr/bin/sandbox-exec', '-p', offlineProfile(root), '/bin/sh', '-c', command],
        cwd: root, env, signal: cancellation, graceMs: 200,
        stdio: { stdin: 'ignore', stdout: { maxBytes: MAX_OUTPUT_BYTES }, stderr: { maxBytes: MAX_OUTPUT_BYTES } },
      })
      try {
        const result = await handle.done
        cancellation.throwIfAborted()
        const stdout = handle.collected.stdout?.readFrom(0)
        const stderr = handle.collected.stderr?.readFrom(0)
        return JSON.stringify({ exitCode: result.exitCode, signal: result.signal, stdout: stdout?.text ?? '', stderr: stderr?.text ?? '', truncated: Boolean(stdout?.lossy || stderr?.lossy) })
      } finally {
        // Even a shell that exits successfully must not leave background descendants.
        handle.terminate()
        if (!await handle.waitForExit(AbortSignal.timeout(3000))) throw new Error('Offline command process range did not stop')
      }
    },
  }
}
