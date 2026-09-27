import { randomBytes, randomUUID } from 'node:crypto'
import { expect, test, type APIRequestContext } from '@playwright/test'
import { qualityEnvironment } from './environment'

async function read<T>(request: APIRequestContext, path: string, token: string): Promise<T> {
  const response = await request.get(`/api/v1${path}`, { headers: { Authorization: `Bearer ${token}` } })
  expect(response.status()).toBe(200)
  return (await response.json()).data as T
}

test('公开注册伪造 ADMIN 字段仍只能获得 USER，读写后台均拒绝', async ({ request }) => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 16)
  const credentials = { username: `roles_${suffix}`, password: randomBytes(24).toString('base64url') }
  const registered = await request.post('/api/v1/auth/register', { data: {
    ...credentials, nickname: '隔离权限验收', email: `roles-${suffix}@example.test`,
    role: 'ADMIN', roles: ['ADMIN'], authorities: ['ROLE_ADMIN'], isAdmin: true,
  } })
  expect(registered.status()).toBe(201)
  expect((await registered.json()).data.roles).toEqual(['USER'])
  const loggedIn = await request.post('/api/v1/auth/login', { data: credentials })
  expect(loggedIn.status()).toBe(200)
  const token = (await loggedIn.json()).data.accessToken as string
  expect((await read<{ roles: string[] }>(request, '/auth/me', token)).roles).toEqual(['USER'])
  const headers = { Authorization: `Bearer ${token}` }
  expect((await request.get('/api/v1/admin/dashboard/summary', { headers })).status()).toBe(403)
  expect((await request.post('/api/v1/admin/appointment-slots', { headers, data: {} })).status()).toBe(403)
})

interface Page<T> { items: T[]; total: number; totalPages: number }
interface Order { id: number; status: string; payableAmount: string }

test('后台预约数、订单数及销售额与完整分页记录一致', async ({ request }) => {
  const login = await request.post('/api/v1/auth/login', { data: qualityEnvironment.admin })
  expect(login.status()).toBe(200)
  const token = (await login.json()).data.accessToken as string
  const summary = await read<{ appointmentCount: number; orderCount: number; salesAmount: string }>(request, '/admin/dashboard/summary', token)
  const first = await read<Page<Order>>(request, '/admin/orders?page=1&size=100', token)
  const orders = [...first.items]
  for (let page = 2; page <= first.totalPages; page++) {
    orders.push(...(await read<Page<Order>>(request, `/admin/orders?page=${page}&size=100`, token)).items)
  }
  expect(orders).toHaveLength(first.total)
  expect(new Set(orders.map(order => order.id)).size).toBe(first.total)
  expect(summary.orderCount).toBe(first.total)
  const appointments = await read<Page<unknown>>(request, '/admin/appointments?page=1&size=1', token)
  expect(summary.appointmentCount).toBe(appointments.total)
  // Decimal strings are converted to integer cents, avoiding floating-point sum drift.
  const cents = (amount: string) => {
    expect(amount).toMatch(/^\d+(?:\.\d{1,2})?$/)
    const [whole = '0', fraction = ''] = amount.split('.')
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
  }
  const sales = orders.filter(order => ['PAID', 'COMPLETED'].includes(order.status))
    .reduce((sum, order) => sum + cents(order.payableAmount), 0n)
  expect(cents(summary.salesAmount)).toBe(sales)
})
