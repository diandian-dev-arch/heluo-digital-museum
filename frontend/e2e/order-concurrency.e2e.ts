import { randomBytes, randomUUID } from 'node:crypto'
import { expect, test, type APIRequestContext } from '@playwright/test'
import { qualityEnvironment } from './environment'

type Order = { id: number; status: string; payableAmount: number }
type Stock = { id: number; stockQuantity: number; lockedStock: number }
const key = () => randomUUID()

async function call(request: APIRequestContext, path: string, token: string, method = 'GET', data?: unknown, idempotencyKey?: string) {
  return request.fetch(`/api/v1${path}`, { method, data, headers: {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
  } })
}

async function read<T>(request: APIRequestContext, path: string, token: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await call(request, path, token, method, data)
  expect(response.status(), `${method} ${path}`).toBeLessThan(300)
  return (await response.json()).data as T
}

async function login(request: APIRequestContext, credentials: { username: string; password: string }) {
  return (await read<{ accessToken: string }>(request, '/auth/login', '', 'POST', credentials)).accessToken
}

async function buyer(request: APIRequestContext) {
  const suffix = key().replaceAll('-', '').slice(0, 16)
  const credentials = { username: `race_${suffix}`, password: randomBytes(24).toString('base64url'), nickname: '隔离并发验收', email: `race-${suffix}@example.test` }
  await read(request, '/auth/register', '', 'POST', credentials)
  return { token: await login(request, credentials), email: credentials.email }
}

async function fixture(request: APIRequestContext, admin: string) {
  const suffix = key()
  const product = await read<Stock>(request, '/admin/products', admin, 'POST', {
    sku: `RACE-${suffix}`, slug: `race-${suffix}`, name: '隔离并发库存验收',
    summary: '仅用于本地验收', description: '仅用于本地验收', price: '19.50', stockQuantity: 1,
    coverImageUrl: '/media/products/river-map-notebook.webp',
  })
  await read(request, `/admin/products/${product.id}/on-shelf`, admin, 'POST')
  return product
}

async function cart(request: APIRequestContext, token: string, productId: number) {
  await read(request, '/cart/items', token, 'POST', { productId, quantity: 1 })
  return (await read<{ id: number }[]>(request, '/cart', token)).map(item => item.id)
}

async function stock(request: APIRequestContext, admin: string, id: number) {
  const result = await read<{ items: Stock[] }>(request, '/admin/products?page=1&size=100', admin)
  const product = result.items.find(item => item.id === id)
  expect(product).toBeDefined()
  return product!
}

test('最后一件库存只允许一个买家下单，金额由服务端计算，并发重放支付只扣一次', async ({ request }) => {
  const admin = await login(request, qualityEnvironment.admin)
  const product = await fixture(request, admin)
  try {
    const buyers = await Promise.all([buyer(request), buyer(request)])
    const carts = await Promise.all(buyers.map(person => cart(request, person.token, product.id)))
    const responses = await Promise.all(buyers.map((person, index) => call(request, '/orders', person.token, 'POST', {
      cartItemIds: carts[index], notificationEmail: person.email,
      payableAmount: 0.01, unitPrice: 0.01,
    }, key())))
    expect(responses.map(response => response.status()).sort()).toEqual([200, 409])
    const winnerIndex = responses.findIndex(response => response.status() === 200)
    const winner = buyers[winnerIndex]!
    const order = (await responses[winnerIndex]!.json()).data as Order
    expect(Number(order.payableAmount)).toBe(19.5)
    expect(await stock(request, admin, product.id)).toMatchObject({ stockQuantity: 1, lockedStock: 1 })
    const paymentKey = key()
    const payments = await Promise.all([0, 1].map(() => call(request, `/orders/${order.id}/mock-payment`, winner.token, 'POST', undefined, paymentKey)))
    expect(payments.map(response => response.status())).toEqual([200, 200])
    for (const payment of payments) expect((await payment.json()).data).toMatchObject({ id: order.id, status: 'PAID' })
    expect(await stock(request, admin, product.id)).toMatchObject({ stockQuantity: 0, lockedStock: 0 })
    const loser = buyers[1 - winnerIndex]!
    expect((await read<{ total: number }>(request, '/orders', loser.token)).total).toBe(0)
  } finally {
    await read(request, `/admin/products/${product.id}/off-shelf`, admin, 'POST')
  }
})

test('取消与模拟支付竞争只产生一个终态，重试不重复释放或扣减库存', async ({ request }) => {
  const admin = await login(request, qualityEnvironment.admin)
  const product = await fixture(request, admin)
  try {
    const person = await buyer(request)
    const cartItemIds = await cart(request, person.token, product.id)
    const created = await call(request, '/orders', person.token, 'POST', { cartItemIds, notificationEmail: person.email }, key())
    expect(created.status()).toBe(200)
    const order = (await created.json()).data as Order
    const paymentKey = key()
    const results = await Promise.all([
      call(request, `/orders/${order.id}/mock-payment`, person.token, 'POST', undefined, paymentKey),
      call(request, `/orders/${order.id}/cancel`, person.token, 'POST'),
    ])
    expect(results.map(response => response.status()).sort()).toEqual([200, 409])
    const final = await read<Order>(request, `/orders/${order.id}`, person.token)
    expect(['PAID', 'CANCELLED']).toContain(final.status)
    const expected = { stockQuantity: final.status === 'PAID' ? 0 : 1, lockedStock: 0 }
    expect(await stock(request, admin, product.id)).toMatchObject(expected)
    expect((await call(request, `/orders/${order.id}/cancel`, person.token, 'POST')).status()).toBe(409)
    expect((await call(request, `/orders/${order.id}/mock-payment`, person.token, 'POST', undefined, paymentKey)).status())
      .toBe(final.status === 'PAID' ? 200 : 409)
    expect(await stock(request, admin, product.id)).toMatchObject(expected)
  } finally {
    await read(request, `/admin/products/${product.id}/off-shelf`, admin, 'POST')
  }
})
