/** Normal storefront UI checks, independent of diagnostic model findings. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const { chromium } = createRequire(new URL('../../../package.json', import.meta.url))('playwright')
const origin = process.env.LAB_ORIGIN ?? 'http://127.0.0.1:18761'
assert.equal(new URL(origin).hostname, '127.0.0.1')
const shots = process.env.LAB_SHOT_DIR ?? join(tmpdir(), 'jw-northline')
await mkdir(shots, { recursive: true })
const browser = await chromium.launch({ headless: true, ...(process.env.LAB_CHROMIUM ? { executablePath: process.env.LAB_CHROMIUM } : { channel: 'chrome' }) })
let checks = 0
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(origin)
  await page.locator('.product-card').nth(11).waitFor()
  checks++
  await page.screenshot({ path: join(shots, 'storefront.png'), fullPage: true })
  await page.getByRole('searchbox', { name: '商品を検索' }).fill('Coffee')
  await page.waitForFunction(() => document.querySelectorAll('.product-card').length === 1)
  checks++
  await page.getByRole('searchbox', { name: '商品を検索' }).fill('')
  await page.getByRole('button', { name: 'バッグ', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('.product-card').length === 2)
  checks++
  await page.goto(`${origin}/products/p-101`)
  await page.getByRole('heading', { name: 'Everyday Canvas Tote', exact: true }).waitFor()
  await page.screenshot({ path: join(shots, 'product.png'), fullPage: true })
  await page.getByRole('button', { name: /バッグに追加する/ }).click()
  await page.goto(`${origin}/cart`)
  await page.getByRole('button', { name: /ログインして購入へ/ }).click()
  await page.waitForURL('**/login?next=/cart')
  await page.getByLabel('メールアドレス', { exact: true }).fill('alice@northline.test')
  await page.getByLabel('パスワード', { exact: true }).fill('northline-alice-2026')
  await page.getByRole('button', { name: /ログインする/ }).click()
  await page.waitForURL('**/cart')
  await page.getByRole('button', { name: /デモ注文を確定する/ }).waitFor()
  assert.ok((await page.locator('.checkout-card').innerText()).includes('7,350'))
  checks++
  await page.screenshot({ path: join(shots, 'cart.png'), fullPage: true })
  await page.getByRole('button', { name: /デモ注文を確定する/ }).click()
  await page.waitForURL(/\/orders\/ORD-2026-.*\?success=1/)
  await page.locator('.order-heading').waitFor()
  checks++
  await page.screenshot({ path: join(shots, 'order.png'), fullPage: true })
  await page.goto(`${origin}/orders`)
  await page.locator('.order-card').first().waitFor()
  checks++
  await page.goto(`${origin}/account`)
  assert.equal(await page.getByLabel('お名前', { exact: true }).inputValue(), 'Alice Mori')
  checks++
  const admin = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const adminPage = await admin.newPage()
  await adminPage.goto(`${origin}/login?next=/admin`)
  await adminPage.getByLabel('メールアドレス', { exact: true }).fill('admin@northline.test')
  await adminPage.getByLabel('パスワード', { exact: true }).fill('northline-admin-2026')
  await adminPage.getByRole('button', { name: /ログインする/ }).click()
  await adminPage.waitForURL('**/admin')
  await adminPage.locator('tbody tr').first().waitFor()
  await adminPage.getByRole('button', { name: 'お客様一覧', exact: true }).click()
  assert.equal(await adminPage.locator('tbody tr').count(), 2)
  checks++
  await adminPage.screenshot({ path: join(shots, 'admin.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(origin)
  await page.locator('.product-card').nth(11).waitFor()
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  checks++
  await page.screenshot({ path: join(shots, 'mobile.png'), fullPage: true })
  assert.deepEqual(errors, [])
  checks++
  console.log(`PASS ${checks} actual-browser shopping checks; screenshots: ${shots}`)
} finally { await browser.close() }
