import { createServer } from 'node:http'

/** A loopback-only HTTP target containing synthetic data for investigation tests. */
export async function startVulnerableLab(
  options: { port?: number; fixed?: boolean; toolScenario?: boolean } = {},
): Promise<{ origin: string; close: () => Promise<void> }> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const pathname = url.pathname
    response.setHeader('Cache-Control', 'no-store')
    if (options.toolScenario && pathname === '/api/invoices/search' && request.method === 'POST') {
      let input = ''
      request.setEncoding('utf8')
      request.on('data', (chunk: string) => { input += chunk })
      request.on('end', () => {
        let query: unknown
        try { query = JSON.parse(input) } catch { response.writeHead(400); response.end(); return }
        const found = typeof query === 'object' && query !== null && 'customerId' in query && query.customerId === 'lab-customer-2'
        response.writeHead(options.fixed ? 403 : 200, { 'Content-Type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify(options.fixed ? { error: 'forbidden' } : { invoices: found ? [{ id: 'lab-invoice-2', customerId: 'lab-customer-2', email: 'customer2@projectdesk.invalid', privateNote: 'test_private_billing_note_82b1' }] : [] }))
      })
      return
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return
    }
    let status = 200
    let contentType = 'application/json; charset=utf-8'
    let body: string
    switch (pathname) {
      case '/':
        contentType = 'text/html; charset=utf-8'
        body = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>ProjectDesk</title></head><body><h1>ProjectDesk</h1><p>Project status dashboard</p><nav><a href="/api/projects">Projects</a> · <a href="/health">Service health</a></nav></body></html>'
        if (options.toolScenario) body = body.replace('</nav>', ' · <a href="/billing">Billing API documentation</a></nav>')
        break
      case '/billing':
        if (!options.toolScenario) { status = 404; body = JSON.stringify({ error: 'not_found' }); break }
        contentType = 'text/html; charset=utf-8'
        body = '<!doctype html><html lang="en"><head><title>Billing API</title></head><body><h1>Billing API</h1><p>All records are synthetic lab data. Current customer: lab-customer-1.</p><a href="/api/invoices?id=lab-invoice-1">My invoice</a><p>GET /api/invoices accepts an id query parameter. Invoice identifiers are lab-invoice-1 and lab-invoice-2.</p><p>POST /api/invoices/search accepts application/json with a customerId field. Customer identifiers are lab-customer-1 and lab-customer-2. This endpoint only reads records and never changes data.</p></body></html>'
        break
      case '/api/invoices': {
        if (!options.toolScenario) { status = 404; body = JSON.stringify({ error: 'not_found' }); break }
        const id = url.searchParams.get('id')
        if (id !== 'lab-invoice-1' && id !== 'lab-invoice-2') { status = 404; body = JSON.stringify({ error: 'not_found' }); break }
        if (options.fixed && id === 'lab-invoice-2') { status = 403; body = JSON.stringify({ error: 'forbidden' }); break }
        body = JSON.stringify({ id, customerId: id === 'lab-invoice-1' ? 'lab-customer-1' : 'lab-customer-2', email: id === 'lab-invoice-1' ? 'customer1@projectdesk.invalid' : 'customer2@projectdesk.invalid', privateNote: id === 'lab-invoice-1' ? 'test_own_billing_note' : 'test_private_billing_note_82b1' })
        break
      }
      case '/health': body = JSON.stringify({ status: 'ok', service: 'projectdesk' }); break
      case '/robots.txt':
        contentType = 'text/plain; charset=utf-8'
        body = 'User-agent: *\nDisallow: /debug/config\nDisallow: /api/admin/export\n'
        break
      case '/api/projects':
        body = JSON.stringify({ projects: [{ id: 'lab-project-1', name: 'Website refresh', status: 'in_progress' }] })
        break
      case '/debug/config':
        if (options.fixed) { status = 404; body = JSON.stringify({ error: 'not_found' }); break }
        body = JSON.stringify({ environment: 'development', DATABASE_URL: 'postgresql://lab-only:lab-only-db-password@database.invalid/projectdesk', API_SECRET: 'test_projectdesk_api_secret_7f39c2', supportEmail: 'support@projectdesk.invalid' })
        break
      case '/api/admin/export':
        if (options.fixed) { status = 401; body = JSON.stringify({ error: 'authentication_required' }); break }
        body = JSON.stringify({ users: [{ id: 'lab-user-1', email: 'admin@projectdesk.invalid', role: 'admin', resetToken: 'test_reset_admin_74a9' }, { id: 'lab-user-2', email: 'member@projectdesk.invalid', role: 'member', resetToken: 'test_reset_member_92c1' }] })
        break
      default: status = 404; body = JSON.stringify({ error: 'not_found' })
    }
    response.writeHead(status, { 'Content-Type': contentType })
    response.end(request.method === 'HEAD' ? undefined : body)
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port ?? 0, '127.0.0.1', () => { server.removeListener('error', reject); resolve() })
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected a loopback TCP listener')
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => { if (error) reject(error); else resolve() })
        server.closeAllConnections()
      })
    },
  }
}
