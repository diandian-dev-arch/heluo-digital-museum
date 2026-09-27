import http from 'k6/http'
import { check, sleep } from 'k6'

const { baseURL } = JSON.parse(open(__ENV.HELUO_QUALITY_ENV_FILE || '../../artifacts/sitewide-quality/mysql-environment.json'))
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(baseURL)) {
  throw new Error('Load tests require an isolated loopback quality environment.')
}
export const options = {
  stages: [
    { duration: '10s', target: 1 },
    { duration: '15s', target: 5 },
    { duration: '15s', target: 10 },
    { duration: '10s', target: 10 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500', 'max<1500'],
    checks: ['rate>=0.99'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'max'],
}
const paths = ['/api/v1/categories', '/api/v1/appointment-slots', '/api/v1/products', '/api/v1/search?keyword=青铜&page=1&size=12']

export function setup() {
  const ready = http.get(`${baseURL}/api/v1/ready`, { redirects: 0, timeout: '5s' })
  if (ready.status !== 200 || ready.json('data.status') !== 'UP') throw new Error('Quality API is not ready.')
  for (const path of paths) {
    const response = http.get(`${baseURL}${encodeURI(path)}`, { redirects: 0, timeout: '5s' })
    if (response.status !== 200 || response.json('code') !== 'OK') throw new Error(`Preflight failed: ${path} (${response.status})`)
  }
}

export default function () {
  for (const path of paths) {
    const response = http.get(`${baseURL}${encodeURI(path)}`, { redirects: 0, timeout: '5s', tags: { name: path.split('?')[0] } })
    check(response, {
      'HTTP 200': value => value.status === 200,
      'JSON business response': value => {
        try { return value.json('code') === 'OK' && value.json('data') !== null } catch { return false }
      },
    })
  }
  sleep(1)
}
