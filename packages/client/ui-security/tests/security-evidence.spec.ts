import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createEvidenceCapture, modelEvidence, readEvidenceWindow } from '../src/security-evidence.ts'
import { fetchSecurityObservation } from '../src/security-http.ts'
import { publicHttpNetwork } from '@deepseek-ai/dsh-web-fetch-http/network'
import type { SecurityWorkerEvidence } from '../src/worker-types.ts'
import type { SecurityTask, SecurityAsset } from '../src/security-records.ts'
vi.mock('@deepseek-ai/dsh-http-proxy', () => ({ proxyRouteFor: vi.fn(() => ({ proxied: false })) }))
let home: string
beforeEach(async () => { home = await mkdtemp(join(tmpdir(), 'jw-capture-')); vi.stubEnv('DSH_HOME', home) })
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); await rm(home, { recursive: true, force: true }) })
const task: SecurityTask = { id: 'task', name: 'Review', description: '', objective: 'Review', status: 'draft', assetIds: ['asset'], archived: false, pinned: false, createdAt: 1, updatedAt: 1 }
const asset: SecurityAsset = { id: 'asset', companyId: 'company', kind: 'domain', value: 'example.org' }
const observation = (body: string): SecurityWorkerEvidence => ({ url: 'https://example.org/', status: 200, headers: {}, body, bytes: Buffer.byteLength(body) })
describe('separate response capture and model budgets', () => {
  it('saves a large response and projects labeled head, middle and tail windows within the model budget', async () => {
    const body = 'HEAD' + 'a'.repeat(20000) + 'MIDDLE' + 'b'.repeat(20000) + 'TAIL'
    const file = await createEvidenceCapture(['workspace', 'task', 'run'])
    await file.write(Buffer.from(body)); await file.finish()
    const evidence = { ...observation(''), bytes: body.length, artifactId: file.id }
    const projected = await modelEvidence(evidence, 4096)
    expect(await readFile(join(home, 'security-evidence', `${file.id}.body`), 'utf8')).toBe(body)
    expect(projected?.body).toContain('HEAD'); expect(projected?.body).toContain('MIDDLE'); expect(projected?.body).toContain('TAIL')
    expect(projected?.body).toContain('[Response bytes 0-')
    expect(Buffer.byteLength(projected!.body)).toBeLessThanOrEqual(4096)
    expect(projected?.bodyTruncated).toBe(true)
    expect(await readEvidenceWindow(evidence, body.length - 4, 4)).toBe('TAIL')
    await expect(readEvidenceWindow({ ...evidence, artifactId: '../escape' }, 0, 4)).rejects.toThrow('identifier')
    await expect(readEvidenceWindow(evidence, -1, 4)).rejects.toThrow('bounds')
  })
  it('bounds legacy UTF-8 evidence without splitting the final character', async () => {
    expect(await modelEvidence(observation('あいう'), 4)).toMatchObject({ body: 'あ', bodyBytes: 3, bodyTruncated: true })
  })
  it.each([{ body: '', cap: 4, partial: false }, { body: 'abcd', cap: 4, partial: false }, { body: 'abcde', cap: 4, partial: true }])('records capture completeness for $body', async ({ body, cap, partial }) => {
    vi.spyOn(publicHttpNetwork, 'resolve').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    const close = vi.fn(async () => {})
    vi.spyOn(publicHttpNetwork, 'request').mockResolvedValue({ response: { status: 200, headers: new Headers(), body: new ReadableStream({ start(controller) { controller.enqueue(Buffer.from(body)); controller.close() } }) }, close } as never)
    let evidence: SecurityWorkerEvidence | undefined
    await fetchSecurityObservation(task, asset, 'https://example.org/', cap, new AbortController().signal, (value) => { evidence = value }, { owner: ['w', 't', body || 'empty'], modelResponseBytes: 2 })
    expect(evidence?.acquisition).toBe(partial ? 'partial' : 'complete')
    expect(evidence?.bytes).toBe(Math.min(body.length, cap))
    expect(Buffer.byteLength(evidence!.body)).toBeLessThanOrEqual(2)
    expect(close).toHaveBeenCalledOnce()
  })
  it('fails explicitly and closes transport when response storage cannot be opened', async () => {
    await writeFile(join(home, 'security-evidence'), 'occupied')
    vi.spyOn(publicHttpNetwork, 'resolve').mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    const close = vi.fn(async () => {})
    vi.spyOn(publicHttpNetwork, 'request').mockResolvedValue({ response: { status: 200, headers: new Headers(), body: null }, close } as never)
    await expect(fetchSecurityObservation(task, asset, 'https://example.org/', 4, new AbortController().signal, () => {}, { owner: ['w', 't', 'r'], modelResponseBytes: 2 })).rejects.toThrow()
    expect(close).toHaveBeenCalledOnce()
  })
})
