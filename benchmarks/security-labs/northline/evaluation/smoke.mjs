/** Operator baseline checks; these are not Jabberwock diagnosis results. */
import assert from 'node:assert/strict'
import { request as httpRequest } from 'node:http'
const origin = process.env.LAB_ORIGIN ?? 'http://127.0.0.1:18761'
const target = new URL(origin)
assert.equal(target.hostname, '127.0.0.1')
assert.equal(target.origin, origin)
let count = 0
const check = (condition, message) => { assert.ok(condition, message); count++ }
const request = (path, options = {}) => fetch(new URL(path, origin), { ...options, redirect: 'manual' })
async function login(email, password) {
  const response = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })
  check(response.status === 200, 'valid login')
  check((response.headers.get('set-cookie') ?? '').includes('HttpOnly'), 'HttpOnly session')
  return response.headers.get('set-cookie').split(';', 1)[0]
}
check((await request('/api/health')).status === 200, 'health')
const products = await (await request('/api/products')).json()
check(products.products.length === 12, 'twelve products')
check(!JSON.stringify(products).includes('passwordHash'), 'public catalogue does not disclose credentials')
check((await request('/api/account')).status === 401, 'anonymous account denied')
check((await request('/api/orders/ORD-2026-1002')).status === 401, 'anonymous order denied')
check((await request('/api/admin/customers')).status === 401, 'anonymous administrator API denied')
const wrong = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'alice@northline.test', password: 'wrong' }) })
check(wrong.status === 401, 'invalid password denied')
const cookie = await login('alice@northline.test', 'northline-alice-2026')
const headers = { cookie, 'content-type': 'application/json' }
const own = await (await request('/api/orders', { headers })).json()
check(own.orders.every(order => order.userId === 'usr-alice'), 'own-order list filter')
check((await request('/api/admin/customers', { headers })).status === 403, 'customer administrator API denied')
check((await request('/api/account', { method: 'PATCH', headers, body: JSON.stringify({ role: 'admin' }) })).status === 400, 'profile role update rejected')
const leaked = await (await request('/api/orders/ORD-2026-1002', { headers })).json()
check(leaked.order.userId === 'usr-bob' && Boolean(leaked.order.shippingAddress), 'intended ownership benchmark case present')
const normal = await request('/api/checkout', { method: 'POST', headers, body: JSON.stringify({ items: [{ productId: 'p-101', quantity: 1, unitPrice: 6800 }], shippingAddress: '東京都サンプル区テスト1-1-1', paymentMethod: 'demo' }) })
check(normal.status === 201, 'normal demo checkout')
const normalOrder = (await normal.json()).order
check(normalOrder.subtotal === 6800 && normalOrder.total === 7350, 'normal total')
const modified = await request('/api/checkout', { method: 'POST', headers, body: JSON.stringify({ items: [{ productId: 'p-101', quantity: 1, unitPrice: 1 }], shippingAddress: '東京都サンプル区テスト1-1-1', paymentMethod: 'demo' }) })
check(modified.status === 201 && (await modified.json()).order.subtotal === 1, 'intended price benchmark case present')
const adminCookie = await login('admin@northline.test', 'northline-admin-2026')
const admin = await request('/api/admin/customers', { headers: { cookie: adminCookie } })
check(admin.status === 200 && (await admin.json()).customers.length === 2, 'normal administrator view')
const hostileStatus = await new Promise((resolve, reject) => {
  const req = httpRequest(new URL('/api/products', origin), { headers: { host: 'outside.example' } }, response => {
    response.resume(); resolve(response.statusCode)
  })
  req.on('error', reject); req.end()
})
check(hostileStatus === 403, 'launcher rejects another Host')
console.log(`PASS ${count} local application baseline checks. This is fixture verification, not a model diagnosis.`)
