import { existsSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { createWorkerBrowser, type WorkerBrowserOptions } from '../src/security-worker-browser.ts'

const executablePath = process.env.DSH_BROWSER_TEST_EXECUTABLE ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browsers: ReturnType<typeof createWorkerBrowser>[] = []
afterEach(async () => { await Promise.all(browsers.splice(0).map(browser => browser.close())) })
const html = (body: string, headers: Record<string, string> = {}) => ({ status: 200, headers: { 'content-type': 'text/html', ...headers }, body: Buffer.from(body) })
function fixture(override: Partial<WorkerBrowserOptions> = {}) {
  const abort = new AbortController()
  const requests: { url: string; method: string; headers: Record<string, string>; body?: string }[] = []
  const browser = createWorkerBrowser({ signal: abort.signal, timeoutMs: 10000, headless: true, executablePath, responseBytes: 4096,
    credentials: () => ({ origin: 'http://fixture.test', username: 'private-user', password: 'private-password' }),
    check: () => { abort.signal.throwIfAborted() },
    exchange: async (request) => {
      requests.push(request)
      const url = new URL(request.url)
      if (url.hostname !== 'fixture.test') throw new Error('Target outside registered scope')
      if (url.pathname === '/login' && request.method === 'POST') return { status: 302, headers: { location: '/account', 'set-cookie': 'auth=allowed; Path=/; HttpOnly' }, body: Buffer.alloc(0) }
      if (url.pathname === '/account') return html(request.headers.cookie?.includes('auth=allowed') ? '<h1>Authenticated account</h1>' : '<h1>Not logged in</h1>')
      if (url.pathname === '/external') return { status: 302, headers: { location: 'http://outside.test/' }, body: Buffer.alloc(0) }
      return html('<title>Fixture login</title><form method="post" action="/login"><label>User<input name="username"></label><label>Password<input name="password" type="password"></label><button>Log in</button></form>')
    }, ...override })
  browsers.push(browser)
  return { browser, requests, abort }
}
describe.skipIf(!existsSync(executablePath))('isolated real Worker browser', () => {
  it('submits private credentials and retains a login cookie without returning credentials', async () => {
    const { browser, requests } = fixture()
    expect(await browser.navigate('http://fixture.test/')).toContain('Fixture login')
    const result = await browser.login({ usernameSelector: '[name=username]', passwordSelector: '[name=password]', submitSelector: 'button' })
    expect(result).toContain('Authenticated account')
    expect(result).not.toMatch(/private-user|private-password/)
    expect(requests.find(request => request.method === 'POST')?.body).toContain('username=private-user')
    expect(await browser.navigate('http://fixture.test/account')).toContain('Authenticated account')
  })
  it('does not bypass the checked executor when redirected outside scope', async () => {
    const { browser, requests } = fixture()
    await expect(browser.navigate('http://fixture.test/external')).rejects.toThrow('outside registered scope')
    expect(requests.map(request => new URL(request.url).hostname)).toContain('outside.test')
    await expect(browser.navigate('file:///etc/passwd')).rejects.toThrow()
  })
  it('masks input values and rejects direct password fill', async () => {
    const { browser } = fixture()
    await browser.navigate('http://fixture.test/')
    expect(await browser.fill('[name=username]', 'secret-other-value')).not.toContain('secret-other-value')
    await expect(browser.fill('[name=password]', 'direct-secret')).rejects.toThrow()
    expect(await browser.snapshot()).not.toContain('direct-secret')
  })
  it('rejects a cross-origin login form before placing credentials into the page', async () => {
    const { browser, requests } = fixture({ exchange: async () => html('<form method="post" action="http://outside.test/login"><input name="username"><input name="password" type="password"><button>Log in</button></form>') })
    await browser.navigate('http://fixture.test/')
    await expect(browser.login({ usernameSelector: '[name=username]', passwordSelector: '[name=password]', submitSelector: 'button' })).rejects.toThrow('credential origin')
    expect(requests).toHaveLength(0)
  })
  it('locks all navigation to the credential origin after login begins', async () => {
    const { browser, requests } = fixture()
    await browser.navigate('http://fixture.test/')
    await browser.login({ usernameSelector: '[name=username]', passwordSelector: '[name=password]', submitSelector: 'button' })
    const count = requests.length
    await expect(browser.navigate('http://outside.test/')).rejects.toThrow('credential origin')
    expect(requests).toHaveLength(count)
  })
  it('aborts pending requests and awaits complete disposal', async () => {
    let entered!: () => void
    const started = new Promise<void>((resolve) => { entered = resolve })
    const { browser, abort } = fixture({ exchange: async (_request, signal) => {
      entered()
      return new Promise((_resolve, reject) => {
        if (signal.aborted) reject(new Error('Browser request aborted'))
        else signal.addEventListener('abort', () =>{  reject(new Error('Browser request aborted')) }, { once: true })
      })
    } })
    const navigation = browser.navigate('http://fixture.test/')
    const rejected = expect(navigation).rejects.toThrow()
    await started
    abort.abort(new Error('Worker stopped'))
    await rejected
    await browser.close()
    await expect(browser.snapshot()).rejects.toThrow()
  })
  it('contains popups, WebSockets and service workers within the isolated page', async () => {
    const requests: string[] = []
    const { browser } = fixture({ exchange: async (request) => {
      requests.push(request.url)
      return html(`<button onclick="window.open('http://outside.test/popup');
        const socket = new WebSocket('ws://outside.test/socket');
        socket.onclose = () => document.querySelector('p').textContent = 'socket closed';
        navigator.serviceWorker?.register('/worker.js').catch(() => {});">Check channels</button><p>waiting</p>`)
    } })
    await browser.navigate('http://fixture.test/')
    await browser.click('button')
    await expect.poll(() => browser.snapshot()).toContain('socket closed')
    expect(requests).toEqual(['http://fixture.test/'])
  })
  it('redacts session cookie values echoed by the authenticated page', async () => {
    const { browser } = fixture({ exchange: async () => html('<h1>token-super-private</h1>', { 'set-cookie': 'session=token-super-private; Path=/' }) })
    const output = await browser.navigate('http://fixture.test/')
    expect(output).toContain('[redacted]')
    expect(output).not.toContain('token-super-private')
  })
  it('caps the complete multibyte snapshot at the requested output bytes', async () => {
    const { browser } = fixture({ responseBytes: 31, exchange: async () => html('<title>日本語日本語日本語</title><h1>大きい本文</h1>') })
    const output = await browser.navigate('http://fixture.test/')
    expect(Buffer.byteLength(output)).toBeLessThanOrEqual(31)
    expect(output).not.toContain('�')
  })
})
