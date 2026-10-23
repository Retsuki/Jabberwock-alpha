import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { chromium, type Browser } from 'playwright'
import { afterEach, expect, it, vi } from 'vitest'
import { createWorkerBrowser } from '../src/security-worker-browser.ts'
import { createWorkerBrowserExchange, type WorkerToolContext } from '../src/security-worker-tools.ts'
import type { SecurityWorkerRun } from '../src/worker-types.ts'
vi.mock('@deepseek-ai/dsh-http-proxy', () => ({ proxyRouteFor: () => ({ proxied: false }) }))
const executablePath = process.env.DSH_BROWSER_TEST_EXECUTABLE ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const close: (() => Promise<void>)[] = []
afterEach(async () => { for (const dispose of close.splice(0).reverse()) await dispose(); vi.restoreAllMocks() })
it.skipIf(!existsSync(executablePath))('logs into a real local app with the default 4 MiB capture cap, retaining private cookies and public evidence', async () => {
  const launched: { browser?: Browser } = {}
  const launchBrowser = chromium.launch.bind(chromium)
  vi.spyOn(chromium, 'launch').mockImplementation(async (options) => {
    const browser = await launchBrowser(options)
    launched.browser = browser
    return browser
  })
  const requests: { path: string; cookie: string; body: string }[] = []
  const server = createServer((request, response) => {
    void (async () => {
      let body = ''
      for await (const chunk of request) body += String(chunk)
      requests.push({ path: request.url ?? '', cookie: request.headers.cookie ?? '', body })
      response.setHeader('content-type', 'text/html')
      if (request.url === '/login' && request.method === 'POST') {
        const fields = new URLSearchParams(body)
        if (fields.get('username') !== 'lab-user' || fields.get('password') !== 'lab-password') { response.writeHead(401); response.end('Invalid login'); return }
        response.writeHead(302, { location: '/account', 'set-cookie': 'session=private-session-token; HttpOnly; Path=/; SameSite=Lax' })
        response.end(); return
      }
      if (request.url === '/account') {
        response.end(request.headers.cookie?.includes('session=private-session-token') ? '<h1>Authenticated test account</h1><a href="/account">Account</a>' : '<h1>Not authenticated</h1>'); return
      }
      response.end('<title>Local login</title><form method="post" action="/login"><label>Username<input name="username"></label><label>Password<input name="password" type="password"></label><button>Log in</button></form>')
    })().catch((error: unknown) => { response.destroy(error instanceof Error ? error : new Error(String(error))) })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  close.push(() => new Promise<void>((resolve, reject) => {
    server.close((error) => { if (error) reject(error); else resolve() })
  }))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Fixture did not bind')
  const origin = `http://127.0.0.1:${address.port}`
  const abort = new AbortController()
  const run: SecurityWorkerRun = {
    workspaceId: 'workspace' as SecurityWorkerRun['workspaceId'], taskId: 'task', id: 'run', requestId: 'request', planId: 'plan', itemId: 'item', assetId: 'asset', sessionId: 'worker' as SecurityWorkerRun['sessionId'], status: 'running', createdAt: 0, updatedAt: 0,
    observations: [], httpRequests: 0, snapshot: {
      recordRevision: 1, model: { engine: 'claude', model: 'default' }, url: `${origin}/`,
      task: { id: 'task', name: 'Login test', description: '', objective: 'Read account', status: 'draft', assetIds: ['asset'], constraints: [{ id: 'post', action: 'allow', text: 'POST' }, { id: 'auth', action: 'allow', text: 'credential submission' }], archived: false, pinned: false, createdAt: 0, updatedAt: 0 },
      asset: { id: 'asset', companyId: 'company', kind: 'service', value: origin },
      item: { id: 'item', title: 'Login', purpose: 'Read account', approach: 'Use browser', targetAssetIds: ['asset'], status: 'pending' },
      limits: { requestTimeoutMs: 10000, responseBytes: 4194304, modelResponseBytes: 4096, modelTimeoutMs: 30000, maxRequests: 12 },
    },
  }
  const save = vi.fn(async () => {})
  const approve = vi.fn(async () => true)
  const credentials = () => ({ origin, username: 'lab-user', password: 'lab-password' })
  const context: WorkerToolContext = { run, signal: abort.signal, maxCalls: 20, localHttpOrigins: [origin], save, approve,
    check: () => { abort.signal.throwIfAborted() }, browserCredentials: credentials,
    workspace: Promise.resolve({ root: '/unused', list: async () => '', read: async () => '', write: async () => '', command: async () => '' }) }
  const exchange = createWorkerBrowserExchange(context)
  const browser = createWorkerBrowser({ signal: abort.signal, timeoutMs: 10000, headless: true, executablePath,
    responseBytes: 4096, credentials, check: () => { context.check() }, exchange,
  })
  close.push(() => browser.close())
  expect(await browser.navigate(`${origin}/`)).toContain('Local login')
  expect(await browser.login({ usernameSelector: '[name=username]', passwordSelector: '[name=password]', submitSelector: 'button' })).toContain('Authenticated test account')
  expect(await browser.navigate(`${origin}/account`)).toContain('Authenticated test account')
  if (process.env.DSH_BROWSER_TEST_SCREENSHOT) {
    const page = launched.browser?.contexts()[0]?.pages()[0]
    if (!page) throw new Error('Actual browser page unavailable')
    await page.screenshot({ path: process.env.DSH_BROWSER_TEST_SCREENSHOT })
  }
  expect(requests.some(value => value.path === '/account' && value.cookie.includes('private-session-token'))).toBe(true)
  expect(approve).toHaveBeenCalledOnce()
  const saved = JSON.stringify({ evidence: run.observations, transcript: run.transcript })
  expect(saved).not.toMatch(/lab-password|private-session-token/)
  expect(run.observations?.some(value => value.requestContext === 'authenticated')).toBe(true)
  const used = run.httpRequests
  await expect(exchange({ url: 'http://127.0.0.1:1/', method: 'GET', headers: {} }, abort.signal)).rejects.toThrow()
  expect(run.httpRequests).toBe(used)
  run.snapshot.limits.maxRequests = used
  await expect(browser.navigate(`${origin}/account`)).rejects.toThrow('budget exhausted')
  expect(requests).toHaveLength(used ?? -1)
  expect(save).toHaveBeenCalled()
})
