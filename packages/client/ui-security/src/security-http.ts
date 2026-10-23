/** Shared DNS-pinned HTTP executor; callers own admission, timers and durable evidence. */
import { proxyRouteFor } from '@deepseek-ai/dsh-http-proxy'
import { publicHttpNetwork } from '@deepseek-ai/dsh-web-fetch-http/network'
import type { SecurityTask, SecurityAsset } from './security-records.ts'
import type { SecurityWorkerEvidence } from './worker-types.ts'
import { compileWorkerPolicy } from './worker-policy.ts'
import { createEvidenceCapture, modelEvidence } from './security-evidence.ts'
/** Fetch one scope-checked DNS-pinned response without redirects or credentials.
 * @param task Current authorized task snapshot.
 * @param asset Registered asset.
 * @param input Exact approved URL.
 * @param storage Optional task-owned file capture and separate model byte budget.
 * @param responseBytes Finite body cap.
 * @param signal Caller timeout/cancellation.
 * @param capture Retains partial evidence even on failure.
 */
async function fetchObservation(
  task: SecurityTask, asset: SecurityAsset, input: string, responseBytes: number, signal: AbortSignal,
  capture: (evidence: SecurityWorkerEvidence) => void,
  storage?: { owner: readonly string[]; modelResponseBytes: number; localHttpOrigins?: readonly string[] },
  request?: SecurityHttpToolRequest,
  browserResponse?: (response: SecurityBrowserResponse) => void,
): Promise<void> {
  const operation = request ? {
    method: request.method,
    authenticated: Object.keys(request.headers ?? {}).some(
      name => browserResponse
        ? /^(?:cookie|authorization)$/iu.test(name)
        : !/^(?:accept|accept-language|content-type|user-agent|range)$/iu.test(name),
    ) || request.body !== undefined,
  } : undefined
  const policy = compileWorkerPolicy(task, asset, input, storage?.localHttpOrigins, operation)
  if (proxyRouteFor(policy.url).proxied) throw new Error('Proxy routing is unsupported for this Worker')
  const addresses = policy.local ? [{ address: '127.0.0.1', family: 4 as const }] : await publicHttpNetwork.resolve(policy.url.hostname, signal)
  signal.throwIfAborted()
  policy.checkAddresses(addresses)
  const headers = { accept: 'text/plain, text/html, application/json', ...request?.headers }
  const fetched = request
    ? await publicHttpNetwork.request(policy.url, addresses, headers, signal, { method: request.method, body: request.body })
    : await publicHttpNetwork.request(policy.url, addresses, headers, signal)
  let file: Awaited<ReturnType<typeof createEvidenceCapture>> | undefined
  let evidence: SecurityWorkerEvidence | undefined
  try {
    file = storage && !browserResponse ? await createEvidenceCapture(storage.owner) : undefined
    const response = fetched.response
    const browserHeaders: Record<string, string> = {}
    const browserChunks: Uint8Array[] = []
    if (browserResponse) {
      response.headers.forEach((value, name) => {
        if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection', 'set-cookie'].includes(name)) browserHeaders[name] = value
      })
      const cookies = response.headers.getSetCookie()
      if (cookies.length) browserHeaders['set-cookie'] = cookies.join('\n')
    }
    const headers: Record<string, string> = {}
    for (const name of ['content-type', 'content-length', 'server', 'location']) { const value = response.headers.get(name); if (value !== null) headers[name] = value.slice(0, 1024) }
    evidence = { url: policy.url.href, status: response.status, headers, body: '', bytes: 0, acquisition: 'partial', ...(file ? { artifactId: file.id } : {}) }
    if (request) evidence.method = request.method
    evidence.requestContext = operation?.authenticated ? 'authenticated' : 'anonymous'
    capture(evidence)
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel()
      const location = response.headers.get('location')
      if (request && location && [301, 302, 303, 307, 308].includes(response.status)) {
        evidence.acquisition = 'complete'
        browserResponse?.({ status: response.status, headers: browserHeaders, body: Buffer.alloc(0) })
        throw new SecurityHttpRedirect(new URL(location, policy.url).href, response.status)
      }
      throw new Error('Redirect response recorded; redirects are never followed')
    }
    const reader = response.body?.getReader()
    const decoder = new TextDecoder()
    if (reader) try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        const bytes: unknown = chunk.value
        if (!(bytes instanceof Uint8Array)) throw new Error('HTTP transport returned an invalid body chunk')
        const remaining = responseBytes - evidence.bytes
        const accepted = bytes.subarray(0, Math.max(0, remaining))
        if (browserResponse) browserChunks.push(accepted)
        if (file) await file.write(accepted)
        else evidence.body += decoder.decode(accepted, { stream: true })
        evidence.bytes += accepted.byteLength
        if (bytes.byteLength > remaining) { evidence.truncated = true; await reader.cancel(); break }
      }
      if (!file) evidence.body += decoder.decode()
    } finally { reader.releaseLock() }
    evidence.acquisition = evidence.truncated ? 'partial' : 'complete'
    browserResponse?.({ status: response.status, headers: browserHeaders, body: Buffer.concat(browserChunks) })
  } finally {
    try {
      if (file) await file.finish()
      if (evidence) {
        evidence.capturedBytes = evidence.bytes
        const projected = await modelEvidence(evidence, storage?.modelResponseBytes ?? responseBytes)
        if (projected) Object.assign(evidence, projected)
        capture(evidence)
      }
    } finally { await fetched.close() }
  }
}

/** Tool request; headers and bodies are never copied to evidence. Nonstandard headers and any body require credential permission. */
export interface SecurityHttpToolRequest {
  url: string
  method: string
  headers?: Record<string, string> | undefined
  body?: string | undefined
  maxRedirects?: number | undefined
}
class SecurityHttpRedirect extends Error {
  constructor(readonly target: string, readonly status: number) { super('HTTP redirect') }
}
/** Fetch one legacy anonymous GET; query and redirect behavior remains unchanged.
 * @param task Saved task.
 * @param asset Registered asset.
 * @param input Exact URL.
 * @param responseBytes Response capture cap.
 * @param signal Cancellation.
 * @param capture Evidence update callback.
 * @param storage Optional artifact storage.
 */
export async function fetchSecurityObservation(
  task: SecurityTask, asset: SecurityAsset, input: string, responseBytes: number, signal: AbortSignal,
  capture: (evidence: SecurityWorkerEvidence) => void,
  storage?: { owner: readonly string[]; modelResponseBytes: number; localHttpOrigins?: readonly string[] },
): Promise<void> {
  await fetchObservation(task, asset, input, responseBytes, signal, capture, storage)
}
/** Execute a bounded tool request, validating scope and pinned DNS for every redirect hop.
 * URL scope rules match the complete canonical URL including query; endpoint assets remain exact.
 * Redirects never forward authentication or request bodies to another origin.
 * @param task Saved task authorization.
 * @param asset Registered target.
 * @param request Tool request with an explicit finite redirect budget (zero by default).
 * @param responseBytes Total per-hop response capture cap.
 * @param signal Caller cancellation.
 * @param capture Hop index and evidence updates; callers persist every hop.
 * @param storage Optional task-owned artifact storage.
 */
export async function fetchSecurityToolObservation(
  task: SecurityTask, asset: SecurityAsset, request: SecurityHttpToolRequest, responseBytes: number, signal: AbortSignal,
  capture: (evidence: SecurityWorkerEvidence, hop: number) => void,
  storage?: { owner: readonly string[]; modelResponseBytes: number; localHttpOrigins?: readonly string[] },
): Promise<void> {
  const maxRedirects = request.maxRedirects ?? 0
  if (!Number.isInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > 10) throw new Error('Redirect budget must be an integer between 0 and 10')
  const method = request.method.toUpperCase()
  if (!['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) throw new Error('Unsupported HTTP method')
  if (['GET', 'HEAD'].includes(method) && request.body !== undefined) throw new Error('GET and HEAD requests cannot contain a body')
  const headers: Record<string, string> = {}
  for (const [name, value] of Object.entries(request.headers ?? {})) {
    if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/iu.test(name) || /[\r\n]/u.test(value)) throw new Error('Invalid HTTP header')
    if (/^(?:host|connection|content-length|transfer-encoding|proxy-authorization|upgrade|te|trailer)$/iu.test(name)) throw new Error('Transport-controlled HTTP header')
    headers[name.toLowerCase()] = value
  }
  let current = { ...request, method, headers }
  for (let hop = 0; ; hop++) {
    signal.throwIfAborted()
    try {
      await fetchObservation(task, asset, current.url, responseBytes, signal, (value) =>{  capture(value, hop) }, storage, current)
      return
    } catch (error) {
      if (!(error instanceof SecurityHttpRedirect)) throw error
      if (hop >= maxRedirects) throw new Error('HTTP redirect budget exhausted')
      if (new URL(error.target).origin !== new URL(current.url).origin && (current.body !== undefined || Object.keys(current.headers).some(name => !/^(?:accept|accept-language|content-type|user-agent|range)$/iu.test(name)))) throw new Error('Cross-origin redirects cannot forward credentials or request bodies')
      const rewrite = error.status === 303 || ([301, 302].includes(error.status) && current.method === 'POST')
      current = { ...current, url: error.target, ...(rewrite ? { method: 'GET', body: undefined } : {}) }
    }
  }
}

/** Private browser delivery; cookies and raw bytes never enter the public observation. */
export interface SecurityBrowserResponse {
  status: number
  headers: Record<string, string>
  body: Buffer
}
/** Deliver one scope-checked response to Chromium, retaining only redacted public evidence.
 * @param task Saved task permissions.
 * @param asset Registered Worker target.
 * @param request Browser request; redirects require another checked call.
 * @param responseBytes Per-response capture cap.
 * @param signal Request lifetime.
 * @param capture Receives public response evidence without authentication headers or secret values.
 * @param localHttpOrigins Owner-configured loopback targets.
 * @param secrets Credential values removed from retained evidence.
 * @returns Raw browser response in memory only; public evidence uses at most a 1 MiB model excerpt.
 */
export async function fetchSecurityBrowserResponse(
  task: SecurityTask, asset: SecurityAsset, request: SecurityHttpToolRequest,
  responseBytes: number, signal: AbortSignal, capture: (evidence: SecurityWorkerEvidence) => void,
  localHttpOrigins: readonly string[], secrets: readonly string[],
): Promise<SecurityBrowserResponse> {
  let result: SecurityBrowserResponse | undefined
  const privateValues = new Set(secrets.filter(Boolean))
  for (const cookie of (request.headers?.cookie ?? '').split(';')) {
    const value = cookie.slice(cookie.indexOf('=') + 1).trim()
    if (value) privateValues.add(value)
  }
  let evidence: SecurityWorkerEvidence | undefined
  try {
    await fetchObservation(task, asset, request.url, responseBytes, signal, (value) => { evidence = value },
      { owner: [], modelResponseBytes: Math.min(responseBytes, 1048576), localHttpOrigins }, request, (value) => {
        result = value
        for (const cookie of (value.headers['set-cookie'] ?? '').split('\n')) {
          const pair = cookie.split(';', 1)[0] ?? ''
          const secret = pair.slice(pair.indexOf('=') + 1)
          if (secret) privateValues.add(secret)
        }
      })
  } catch (error) {
    if (!(error instanceof SecurityHttpRedirect) || !result) throw error
  } finally {
    if (evidence) {
      const redact = (text: string): string => {
        for (const secret of privateValues) text = text.split(secret).join('[redacted]').split(encodeURIComponent(secret)).join('[redacted]')
        return text
      }
      capture({ ...evidence, url: redact(evidence.url), body: redact(evidence.body), headers: Object.fromEntries(
        Object.entries(evidence.headers).map(([name, value]) => [name, redact(value)]),
      ) })
    }
  }
  if (!result) throw new Error('Browser request produced no response')
  return result
}
