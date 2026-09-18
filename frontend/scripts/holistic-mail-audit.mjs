import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const environment = JSON.parse(await readFile(resolve('../artifacts/sitewide-quality/docker-environment.json'), 'utf8'))
assert.equal(new URL(environment.mailURL).hostname, '127.0.0.1')
const output = resolve('../artifacts/holistic', `mail-${Date.now()}`)
await mkdir(output, { recursive: true })
async function read(path) {
  const response = await fetch(`${environment.mailURL}${path}`, { signal: AbortSignal.timeout(5000) })
  assert.equal(response.status, 200)
  return response.json()
}
const list = await read('/api/v1/messages')
assert.ok(list.messages.length >= 2)
const messages = []
for (const entry of list.messages) {
  const message = await read(`/api/v1/message/${encodeURIComponent(entry.ID)}`)
  assert.ok(message.To.length > 0)
  assert.ok(message.To.every(to => to.Address.endsWith('@example.test')))
  assert.ok(message.Text.trim().length > 0)
  if (message.Subject === '模拟支付成功') assert.match(message.Text, /订单 \S+ 已支付/)
  else assert.equal(message.Subject, '预约已确认')
  messages.push({ id: message.ID, subject: message.Subject,
    recipientHashes: message.To.map(to => createHash('sha256').update(to.Address).digest('hex')),
    textHash: createHash('sha256').update(message.Text).digest('hex'), bodyPresent: true })
}
assert.ok(messages.some(message => message.subject === '预约已确认'))
assert.ok(messages.some(message => message.subject === '模拟支付成功'))
const evidence = { timestamp: new Date().toISOString(), project: environment.projectName,
  scope: 'Local Mailpit receipt and message shape only; not public deliverability or per-order reconciliation.', passed: true, messages }
await writeFile(resolve(output, 'summary.json'), JSON.stringify(evidence, null, 2))
console.log(JSON.stringify({ output, passed: true, messages: messages.length }))
