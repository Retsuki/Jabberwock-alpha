/** Isolated Worker browser whose network requests use the task's checked HTTP executor. */
import { existsSync } from 'node:fs'
import { chromium, type Browser, type BrowserContext, type Page, type Route } from 'playwright'

class BrowserActionError extends Error {}

/** Browser lifetime, network policy, output bounds, and private login credentials. */
export interface WorkerBrowserOptions {
  signal: AbortSignal
  timeoutMs: number
  headless: boolean
  executablePath?: string
  responseBytes: number
  exchange(
    request: { url: string; method: string; headers: Record<string, string>; body?: string }, signal: AbortSignal,
  ): Promise<{ status: number; headers: Record<string, string>; body: Buffer }>
  credentials(): { origin: string; username: string; password: string } | undefined
  check(): void
}

/** Creates one lazily launched, nonpersistent browser for a Worker.
 * @param options Worker-owned authority and cancellation.
 * @returns Browser actions and awaited resource disposal.
 */
export function createWorkerBrowser(options: WorkerBrowserOptions) {
  const lifetime = new AbortController()
  const signal = AbortSignal.any([options.signal, lifetime.signal])
  const routes = new Set<Promise<void>>()
  let browser: Browser | undefined
  let context: BrowserContext | undefined
  let page: Page | undefined
  let starting: Promise<Page> | undefined
  let closing: Promise<void> | undefined
  let authenticationOrigin: string | undefined
  const privateValues = new Set<string>()
  const navigation: { error: string | undefined; redirect: string | undefined } = { error: undefined, redirect: undefined }
  const currentNavigation = () => ({ ...navigation })
  const redact = (text: string) => {
    const credentials = options.credentials()
    for (const secret of [credentials?.username, credentials?.password, ...privateValues]) {
      if (secret) {
        for (const value of [secret, encodeURIComponent(secret), new URLSearchParams({ v: secret }).toString().slice(2)]) {
          text = text.split(value).join('[redacted]')
        }
      }
    }
    return text
  }
  const check = () => { signal.throwIfAborted(); options.check() }
  const protocol = (value: string) => {
    if (!['http:', 'https:'].includes(new URL(value).protocol)) throw new BrowserActionError('Browser supports HTTP and HTTPS pages only')
  }
  const intercept = async (route: Route) => {
    try {
      check()
      const request = route.request()
      if (request.frame().page() !== page) throw new Error('Additional browser pages are blocked')
      protocol(request.url())
      if (authenticationOrigin && new URL(request.url()).origin !== authenticationOrigin) {
        throw new Error('Authenticated browser requests must stay on the credential origin; cross-origin login is unsupported')
      }
      const headers = Object.fromEntries(Object.entries(await request.allHeaders())
        .filter(([key]) => !/^(host|connection|proxy-.*|content-length|transfer-encoding|accept-encoding|upgrade|te|trailer)$/i.test(key)))
      for (const pair of (headers.cookie ?? '').split(';')) {
        const value = pair.slice(pair.indexOf('=') + 1).trim()
        if (value) privateValues.add(value)
      }
      const body = request.postData()
      const response = await options.exchange({
        url: request.url(), method: request.method(), headers, ...(body !== null ? { body } : {}),
      }, signal)
      for (const cookie of (response.headers['set-cookie'] ?? '').split('\n')) {
        const pair = cookie.split(';', 1)[0] ?? ''
        const value = pair.slice(pair.indexOf('=') + 1)
        if (value) privateValues.add(value)
      }
      check()
      const outputHeaders = Object.fromEntries(Object.entries(response.headers)
        .filter(([key]) => !/^(connection|content-length|content-encoding|transfer-encoding|upgrade|te|trailer)$/i.test(key)))
      const location = Object.entries(outputHeaders).find(([key]) => key.toLowerCase() === 'location')?.[1]
      if (response.status >= 300 && response.status < 400 && location) {
        // Chromium bypasses interception for native redirects. A fresh document navigation
        // keeps the next request on the checked executor instead of the closed proxy.
        if (!request.isNavigationRequest() || request.frame() !== page.mainFrame() || ![301, 302, 303].includes(response.status)) {
          throw new Error('Browser redirect requires a main-page GET redirect')
        }
        navigation.redirect = new URL(location, request.url()).href
        protocol(navigation.redirect)
        delete outputHeaders.location
        outputHeaders['content-type'] = 'text/html'
        const escaped = navigation.redirect.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
        await route.fulfill({ status: 200, headers: outputHeaders, body: `<meta http-equiv="refresh" content="0;url=${escaped}">` })
      } else await route.fulfill({ status: response.status, headers: outputHeaders, body: response.body })
    } catch (error) {
      navigation.error = redact(error instanceof Error ? error.message : 'Browser request denied')
      await route.abort('blockedbyclient').catch(() => {})
    }
  }
  const acquire = () => {
    check()
    starting ??= (async () => {
      const executable = options.executablePath ? { executablePath: options.executablePath }
        : existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' }
      browser = await chromium.launch({ headless: options.headless, ...executable, timeout: options.timeoutMs,
        proxy: { server: 'http://127.0.0.1:1', bypass: '<-loopback>' },
        args: ['--disable-background-networking', '--disable-quic', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'],
      })
      try {
        check()
        context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false })
        check()
        context.setDefaultTimeout(options.timeoutMs)
        context.setDefaultNavigationTimeout(options.timeoutMs)
        await context.route('**/*', (route) => {
          const pending = intercept(route)
          routes.add(pending)
          void pending.finally(() => routes.delete(pending))
          return pending
        })
        await context.routeWebSocket('**/*', socket => socket.close())
        page = await context.newPage()
        page.on('download', (download) => { void download.cancel().catch(() => {}) })
        context.on('page', (extra) => { if (extra !== page) void extra.close().catch(() => {}) })
        check()
        return page
      } catch (error) {
        await browser.close().catch(() => {})
        throw error
      }
    })()
    return starting
  }
  const snapshot = async () => {
    const current = await acquire()
    check()
    // ARIA snapshots include text input values. Mask them in the document only for capture.
    await current.locator('input, textarea').evaluateAll((elements) => {
      for (const element of elements) {
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
          element.dataset.workerSnapshotValue = element.value
          element.value = ''
        }
      }
    })
    let text: string
    try { text = `URL: ${current.url()}\nTitle: ${await current.title()}\n${await current.locator('body').ariaSnapshot()}` }
    finally {
      await current.locator('input, textarea').evaluateAll((elements) => {
        for (const element of elements) {
          if ((element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)
            && element.dataset.workerSnapshotValue !== undefined) {
            element.value = element.dataset.workerSnapshotValue
            delete element.dataset.workerSnapshotValue
          }
        }
      }).catch(() => {})
    }
    check()
    const bytes = Buffer.from(redact(text))
    return new TextDecoder().decode(bytes.subarray(0, options.responseBytes), { stream: true })
  }
  const action = async (perform: (current: Page) => Promise<void>) => {
    check()
    navigation.error = undefined
    navigation.redirect = undefined
    const deadline = setTimeout(() => { void close().catch(() => {}) }, options.timeoutMs)
    try {
      const current = await acquire()
      await perform(current)
      while (currentNavigation().redirect) {
        const destination = currentNavigation().redirect
        if (!destination) break
        navigation.redirect = undefined
        await current.waitForURL(destination, { waitUntil: 'domcontentloaded' })
      }
      check()
      const networkError = currentNavigation().error
      if (networkError) throw new Error(networkError)
      return await snapshot()
    } catch (error) {
      check()
      // Playwright action errors can echo supplied text or selectors; retain only policy failures.
      throw new Error(currentNavigation().error ?? (error instanceof BrowserActionError || (!page && error instanceof Error) ? redact(error.message) : 'Browser action failed; inspect the page and retry'))
    } finally { clearTimeout(deadline) }
  }
  const close = () => closing ??= (async () => {
    lifetime.abort()
    const failures: Error[] = []
    const disposeBrowser = async () => {
      try { await browser?.close() }
      catch (error) { if (error instanceof Error) failures.push(error) }
    }
    await disposeBrowser()
    await starting?.catch(() => {})
    await disposeBrowser()
    await Promise.allSettled([...routes])
    options.signal.removeEventListener('abort', abort)
    if (browser?.isConnected()) throw new Error(redact(failures[0]?.message ?? 'Worker browser could not be stopped'))
  })()
  const abort = () => { void close().catch(() => {}) }
  options.signal.addEventListener('abort', abort, { once: true })
  return {
    navigate: (url: string) => action(async (current) => { protocol(url); await current.goto(url, { waitUntil: 'domcontentloaded' }) }),
    snapshot,
    click: (selector: string) => action(async (current) => { await current.locator(selector).click() }),
    fill: (selector: string, text: string) => action(async (current) => {
      const target = current.locator(selector)
      if (await target.evaluate(element => element instanceof HTMLInputElement && element.type === 'password')) throw new BrowserActionError('Use browser_login for password fields')
      await target.fill(text)
    }),
    login: (input: { usernameSelector: string; passwordSelector: string; submitSelector: string }) => action(async (current) => {
      const credentials = options.credentials()
      if (!credentials || new URL(current.url()).origin !== new URL(credentials.origin).origin) throw new BrowserActionError('Login requires credentials for the current origin')
      const formAction = await current.locator(input.passwordSelector)
        .evaluate(element => element instanceof HTMLInputElement ? element.form?.action : undefined)
      const submitAction = await current.locator(input.submitSelector).getAttribute('formaction')
      for (const destination of [formAction, submitAction]) {
        if (destination && new URL(destination, current.url()).origin !== new URL(credentials.origin).origin) throw new BrowserActionError('Login form destination does not match credential origin')
      }
      authenticationOrigin = new URL(credentials.origin).origin
      privateValues.add(credentials.username); privateValues.add(credentials.password)
      await current.locator(input.usernameSelector).fill(credentials.username)
      await current.locator(input.passwordSelector).fill(credentials.password)
      check()
      await current.locator(input.submitSelector).click()
    }),
    close,
  }
}
