import { afterEach, expect, it, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { publicHttpNetwork } from '@deepseek-ai/dsh-web-fetch-http/network'
import { fetchSecurityObservation, fetchSecurityToolObservation } from '../src/security-http.ts'
import type { SecurityAsset, SecurityTask } from '../src/security-records.ts'
import type { SecurityWorkerEvidence } from '../src/worker-types.ts'
vi.mock('@deepseek-ai/dsh-http-proxy', () => ({ proxyRouteFor: vi.fn(() => ({ proxied: false })) }))
let server: Server | undefined
let home: string | undefined
afterEach(async () => {
  if (server) await new Promise<void>((resolve, reject) => {
    server!.close((error) => { if (error) reject(error); else resolve() })
    server!.closeAllConnections()
  })
  if (home) await rm(home, { recursive: true, force: true })
  vi.restoreAllMocks(); vi.unstubAllEnvs()
})
it('captures a real owner-opted-in loopback HTTP response without DNS, and blocks the default route', async () => {
  let requests = 0
  server = createServer((_request, response) => { requests++; response.setHeader('content-type', 'application/json'); response.end('{"debug":true,"fixture":"local-only"}') })
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing local port')
  const origin = `http://127.0.0.1:${address.port}`
  home = await mkdtemp(join(tmpdir(), 'jw-local-http-')); vi.stubEnv('DSH_HOME', home)
  const task: SecurityTask = { id: 'task', name: 'Local fixture', description: '', objective: 'Observe', status: 'draft', assetIds: ['asset'], archived: false, pinned: false, createdAt: 0, updatedAt: 0 }
  const asset: SecurityAsset = { id: 'asset', companyId: 'company', kind: 'service', value: origin }
  const dns = vi.spyOn(publicHttpNetwork, 'resolve')
  const transport = vi.spyOn(publicHttpNetwork, 'request')
  let evidence: SecurityWorkerEvidence | undefined
  await fetchSecurityObservation(task, asset, origin + '/debug', 4096, new AbortController().signal, (value) => { evidence = value }, { owner: ['local', 'task', 'run'], modelResponseBytes: 4096, localHttpOrigins: [origin] })
  expect(dns).not.toHaveBeenCalled()
  expect(transport).toHaveBeenCalledWith(new URL(origin + '/debug'), [{ address: '127.0.0.1', family: 4 }], expect.any(Object), expect.any(AbortSignal))
  expect(evidence).toMatchObject({ status: 200, acquisition: 'complete', requestContext: 'anonymous', body: '{"debug":true,"fixture":"local-only"}' })
  expect(requests).toBe(1)
  await expect(fetchSecurityObservation(task, asset, origin + '/debug', 4096, new AbortController().signal, () => {})).rejects.toThrow()
  expect(requests).toBe(1)
})

it('executes a query tool request and checks each redirect before reaching its target', async () => {
  const paths: string[] = []
  server = createServer((request, response) => {
    paths.push(request.url!)
    if (request.url === '/start') { response.writeHead(302, { location: '/finish?q=ok' }); response.end() }
    else if (request.url === '/escape') { response.writeHead(302, { location: 'http://127.0.0.1:1/private' }); response.end() }
    else { response.end(request.url) }
  })
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing local port')
  const origin = `http://127.0.0.1:${address.port}`
  const task: SecurityTask = { id: 'task', name: 'Local fixture', description: '', objective: 'Observe', status: 'draft', assetIds: ['asset'], archived: false, pinned: false, createdAt: 0, updatedAt: 0 }
  const asset: SecurityAsset = { id: 'asset', companyId: 'company', kind: 'service', value: origin }
  const evidence: { hop: number; status: number; body: string }[] = []
  const capture = (value: SecurityWorkerEvidence, hop: number) => { evidence.push({ hop, status: value.status, body: value.body }) }
  home = await mkdtemp(join(tmpdir(), 'jw-tool-http-')); vi.stubEnv('DSH_HOME', home)
  const storage = { owner: ['local', 'task', 'tool'], modelResponseBytes: 4096, localHttpOrigins: [origin] }
  await fetchSecurityToolObservation(task, asset, { url: origin + '/start', method: 'GET', maxRedirects: 1 }, 4096, new AbortController().signal, capture, storage)
  expect(evidence).toContainEqual({ hop: 1, status: 200, body: '/finish?q=ok' })
  expect(paths).toEqual(['/start', '/finish?q=ok'])
  await expect(fetchSecurityToolObservation(task, asset, { url: origin + '/escape', method: 'GET', maxRedirects: 1 }, 4096, new AbortController().signal, capture, storage)).rejects.toThrow('service origin')
  expect(paths).toEqual(['/start', '/finish?q=ok', '/escape'])
  await expect(fetchSecurityToolObservation(task, asset, { url: origin + '/start', method: 'POST' }, 4096, new AbortController().signal, capture, storage)).rejects.toThrow('Explicit allow')
})

it('sends explicitly permitted POST credentials without persisting request secrets', async () => {
  let received = ''
  let authorization: string | undefined
  server = createServer((request, response) => {
    authorization = request.headers.authorization
    request.setEncoding('utf8')
    request.on('data', (chunk: string) => { received += chunk })
    request.on('end', () => { response.setHeader('set-cookie', 'secret-cookie'); response.end('accepted') })
  })
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing local port')
  const origin = `http://127.0.0.1:${address.port}`
  const task: SecurityTask = { id: 'task', name: 'Local fixture', description: '', objective: 'Observe', status: 'draft', assetIds: ['asset'], archived: false, pinned: false, createdAt: 0, updatedAt: 0, constraints: [{ id: 'p', action: 'allow', text: 'POST' }, { id: 'a', action: 'allow', text: '認証情報の送信' }] }
  const asset: SecurityAsset = { id: 'asset', companyId: 'company', kind: 'service', value: origin }
  const results: string[] = []
  home = await mkdtemp(join(tmpdir(), 'jw-tool-post-')); vi.stubEnv('DSH_HOME', home)
  await fetchSecurityToolObservation(task, asset, { url: origin + '/login', method: 'POST', headers: { authorization: 'Bearer fixture-secret' }, body: 'password=fixture-password' }, 4096, new AbortController().signal, value => results.push(JSON.stringify(value)), { owner: ['local', 'task', 'post'], modelResponseBytes: 4096, localHttpOrigins: [origin] })
  expect(received).toBe('password=fixture-password')
  expect(authorization).toBe('Bearer fixture-secret')
  expect(results.join('')).not.toMatch(/fixture-secret|fixture-password|secret-cookie/u)
  expect(results.join('')).toContain('"requestContext":"authenticated"')
})
