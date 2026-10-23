/** Fixed-destination TCP ingress; preserves HTTP bytes and never accepts a client-selected upstream. */
import { createServer, connect } from 'node:net'

const server = createServer(client => {
  const upstream = connect({ host: 'northline', port: 18761 })
  client.setTimeout(60_000, () => client.destroy())
  upstream.setTimeout(60_000, () => upstream.destroy())
  client.on('error', () => upstream.destroy())
  upstream.on('error', () => client.destroy())
  client.on('close', () => upstream.destroy())
  upstream.on('close', () => client.destroy())
  client.pipe(upstream).pipe(client)
})
server.maxConnections = 128
server.listen(18761, '0.0.0.0')
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close())
