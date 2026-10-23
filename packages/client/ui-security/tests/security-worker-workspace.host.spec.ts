import { mkdtemp, rm, symlink, writeFile, link } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SubprocessRuntime, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { createWorkerWorkspace } from '../src/security-worker-workspace.ts'

const homes: string[] = []
afterEach(async () => { await Promise.all(homes.splice(0).map(home => rm(home, { recursive: true, force: true }))); vi.restoreAllMocks() })
async function home() { const path = await mkdtemp(join(tmpdir(), 'jw-worker-files-')); homes.push(path); return path }
function provider(done = Promise.resolve({ exitCode: 0, signal: null })) {
  const handle = { done, collected: { stdout: { readFrom: () => ({ text: 'parsed', lossy: false }) }, stderr: { readFrom: () => ({ text: '', lossy: false }) } }, terminate: vi.fn(), waitForExit: vi.fn(async () => true) }
  const spawn = vi.fn((_spec: SubprocessSpawnSpec) => handle)
  return { runtime: { spawn } as unknown as SubprocessRuntime, spawn, handle }
}
describe('private Worker workspace', () => {
  it('isolates opaque owners and round-trips flat scratch files', async () => {
    const directory = await home()
    const first = await createWorkerWorkspace(undefined, directory, '../../owner')
    const second = await createWorkerWorkspace(undefined, directory, 'other')
    expect(first.root).not.toBe(second.root)
    expect(first.root).toMatch(/security-worker-files\/[a-f0-9]{64}$/)
    expect(JSON.parse(await first.write('response.json', '{"status":200}'))).toMatchObject({ bytes: 14 })
    expect(JSON.parse(await first.list())).toEqual(['response.json'])
    expect(JSON.parse(await first.read('response.json'))).toEqual({ text: '{"status":200}', truncated: false })
    expect(JSON.parse(await second.list())).toEqual([])
  })
  it('rejects traversal, absolute paths, symlinks and hard links without touching the target', async () => {
    const directory = await home()
    const scratch = await createWorkerWorkspace(undefined, directory, 'owner')
    const secret = join(directory, 'secret.txt'); await writeFile(secret, 'private')
    await symlink(secret, join(scratch.root, 'alias'))
    await link(secret, join(scratch.root, 'hardlink'))
    for (const name of ['../secret.txt', '/etc/passwd', 'a/b', '.', '..', 'a\0b']) {
      await expect(scratch.read(name)).rejects.toThrow('single scratch filename')
      await expect(scratch.write(name, 'overwritten')).rejects.toThrow('single scratch filename')
    }
    await expect(scratch.read('alias')).rejects.toThrow()
    await expect(scratch.write('alias', 'overwritten')).rejects.toThrow()
    await expect(scratch.read('hardlink')).rejects.toThrow('hard links')
    await expect(scratch.write('hardlink', 'overwritten')).rejects.toThrow('hard links')
    expect(JSON.parse(await scratch.list())).not.toContain('alias')
  })
  it('rejects a symlink scratch parent and oversized writes; bounds reads', async () => {
    const directory = await home()
    const outside = await home()
    await symlink(outside, join(directory, 'security-worker-files'))
    await expect(createWorkerWorkspace(undefined, directory, 'owner')).rejects.toThrow('symlink')
    const scratch = await createWorkerWorkspace(undefined, outside, 'owner')
    await expect(scratch.write('large', 'a'.repeat(1024 * 1024 + 1))).rejects.toThrow('1 MiB')
    await scratch.write('large', 'a'.repeat(70_000))
    const read = JSON.parse(await scratch.read('large')) as { text: string; truncated: boolean }
    expect(read.truncated).toBe(true); expect(read.text.length).toBe(65536)
  })
  it('refuses commands without a process provider', async () => {
    const scratch = await createWorkerWorkspace(undefined, await home(), 'owner')
    await expect(scratch.command('echo unsafe')).rejects.toThrow('unavailable')
  })
  it.skipIf(process.platform !== 'darwin')('uses deny-default offline confinement, a cleared environment, and managed cleanup', async () => {
    const processProvider = provider()
    const scratch = await createWorkerWorkspace(processProvider.runtime, await home(), 'owner')
    expect(JSON.parse(await scratch.command('wc -c response.json'))).toMatchObject({ exitCode: 0, stdout: 'parsed' })
    const spec = processProvider.spawn.mock.calls[0]?.[0]
    expect(spec?.argv[0]).toBe('/usr/bin/sandbox-exec')
    expect(spec?.argv[2]).toContain('(deny default)')
    expect(spec?.argv[2]).not.toContain('allow network')
    expect(spec?.argv[2]).not.toContain('process-fork')
    expect(spec?.cwd).toBe(scratch.root)
    expect(spec?.env?.HOME).toBe(scratch.root)
    for (const key of Object.keys(process.env)) {
      if (!['PATH', 'HOME', 'TMPDIR', 'LANG'].includes(key)) expect(spec?.env?.[key]).toBeUndefined()
    }
    expect(processProvider.handle.terminate).toHaveBeenCalledOnce()
    expect(processProvider.handle.waitForExit).toHaveBeenCalledOnce()
  })
  it.skipIf(process.platform !== 'darwin')('does not spawn after cancellation and still cleans up a failed command', async () => {
    const processProvider = provider()
    const scratch = await createWorkerWorkspace(processProvider.runtime, await home(), 'owner')
    await expect(scratch.command('echo no', AbortSignal.abort())).rejects.toThrow()
    expect(processProvider.spawn).not.toHaveBeenCalled()
    processProvider.handle.done = Promise.reject(new Error('sandbox initialization failed'))
    await expect(scratch.command('echo no')).rejects.toThrow('sandbox initialization failed')
    expect(processProvider.handle.terminate).toHaveBeenCalledOnce()
  })
})
