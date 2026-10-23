/** Task-owned response files and bounded model projections. */
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, rename } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import type { SecurityWorkerEvidence } from './worker-types.ts'

/** Additive fields preserve readable legacy inline evidence. */
export const evidenceFields = {
  method: z.string().optional(),
  requestContext: z.enum(['anonymous', 'authenticated']).optional(),
  url: z.string().min(1), status: z.number(), headers: z.record(z.string(), z.string()), body: z.string(), bytes: z.number(),
  acquisition: z.enum(['complete', 'partial']).optional(), truncated: z.boolean().optional(), artifactId: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
  capturedBytes: z.number().nonnegative().optional(), bodyBytes: z.number().nonnegative().optional(), bodyTruncated: z.boolean().optional(),
}
const root = () => join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'security-evidence')
const filePath = (id: string) => {
  if (!/^[a-f0-9]{64}$/u.test(id)) throw new Error('Invalid security evidence identifier')
  return join(root(), `${id}.body`)
}
/** Open an exclusively owned response file; callers finalize even a partial capture.
 * @param owner Workspace, task and operation identities.
 * @returns Bounded-stream sink and durable finalizer.
 */
export async function createEvidenceCapture(
  owner: readonly string[],
): Promise<{ id: string; write(bytes: Uint8Array): Promise<void>; finish(): Promise<void> }> {
  const id = createHash('sha256').update(JSON.stringify(owner)).digest('hex')
  await mkdir(root(), { recursive: true, mode: 0o700 })
  const temporary = join(root(), `${id}-${randomUUID()}.tmp`)
  const handle = await open(temporary, 'wx', 0o600)
  return {
    id,
    async write(bytes: Uint8Array): Promise<void> { await handle.writeFile(bytes) },
    async finish(): Promise<void> { await handle.close(); await rename(temporary, filePath(id)) },
  }
}
/** Read one bounded byte window from an admitted evidence artifact, never an arbitrary path.
 * @param evidence Stored task-owned evidence.
 * @param offset Nonnegative byte offset.
 * @param length Maximum bytes to read.
 * @returns UTF-8 response excerpt.
 */
export async function readEvidenceWindow(evidence: SecurityWorkerEvidence, offset: number, length: number): Promise<string> {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 1 || length > 1048576) throw new Error('Evidence window is outside the supported bounds')
  if (!evidence.artifactId) return new TextDecoder().decode(Buffer.from(evidence.body).subarray(offset, offset + length), { stream: true })
  const handle = await open(filePath(evidence.artifactId), 'r')
  try {
    const buffer = Buffer.alloc(length)
    const { bytesRead } = await handle.read(buffer, 0, length, offset)
    return new TextDecoder().decode(buffer.subarray(0, bytesRead), { stream: true })
  } finally { await handle.close() }
}
/** Build an explicitly limited model excerpt, including for legacy inline observations.
 * @param evidence Actual captured observation.
 * @param maxBytes Model byte budget.
 * @returns Evidence projection whose body cannot exceed the requested budget.
 */
export async function modelEvidence(
  evidence: SecurityWorkerEvidence | undefined, maxBytes: number,
): Promise<SecurityWorkerEvidence | undefined> {
  if (!evidence) return undefined
  const sampled = evidence.bytes > maxBytes && maxBytes >= 1024
  const windowBytes = sampled ? Math.floor((maxBytes - 256) / 3) : maxBytes
  const offsets = sampled ? [0, Math.floor((evidence.bytes - windowBytes) / 2), evidence.bytes - windowBytes] : [0]
  const excerpts = await Promise.all(offsets.map(async (offset) => {
    const excerpt = await readEvidenceWindow(evidence, offset, windowBytes)
    return sampled ? `[Response bytes ${offset}-${offset + Buffer.byteLength(excerpt)}]\n${excerpt}` : excerpt
  }))
  const body = excerpts.join('\n\n')
  const bodyBytes = Buffer.byteLength(body)
  return { ...evidence, body, bodyBytes, bodyTruncated: evidence.bytes > maxBytes }
}
