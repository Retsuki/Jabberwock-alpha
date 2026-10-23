/** Local-only test fixture launcher; this is not a Harness application entry point. */
import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import next from 'next'

const port = Number(process.env.LAB_PORT ?? 18761)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('LAB_PORT must be an integer between 1024 and 65535')
const containerMode = process.env.LAB_CONTAINER === '1'
const hostname = containerMode ? '0.0.0.0' : '127.0.0.1'
const publicHostname = '127.0.0.1'
process.env.LAB_SESSION_SECRET ??= randomBytes(32).toString('hex')
process.env.NEXT_TELEMETRY_DISABLED = '1'
const dir = fileURLToPath(new URL('.', import.meta.url))
process.chdir(dir)
const app = next({ dev: false, dir, hostname, port })
await app.prepare()
const handle = app.getRequestHandler()
const server = createServer((request, response) => {
  if (request.headers.host !== `${publicHostname}:${port}` || (!containerMode && !['127.0.0.1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress ?? ''))) {
    response.writeHead(403); response.end('Local fixture access only'); return
  }
  void handle(request, response).catch(() => { if (!response.headersSent) response.writeHead(500); response.end('Fixture request failed') })
})
server.on('connect', (_request, socket) => { socket.destroy() })
server.on('upgrade', (_request, socket) => { socket.destroy() })
server.on('error', error => { console.error(error.message); process.exitCode = 1; void app.close() })
server.listen(port, hostname, () => { console.log(`NORTHLINE local fixture: http://${publicHostname}:${port} (bind ${hostname}; synthetic data, no real payments)`) })
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  server.close(() => { void app.close().finally(() => { process.exit(0) }) })
  server.closeIdleConnections()
})
