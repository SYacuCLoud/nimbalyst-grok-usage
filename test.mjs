import assert from 'node:assert/strict'
import { expiresSoon, isStale, parseBilling, pickAuthEntry, resetLabel, ringColor, ringView, STALE_MS } from './src/usage.js'

const body = {
  config: {
    creditUsagePercent: 19,
    currentPeriod: { type: 'USAGE_PERIOD_TYPE_WEEKLY', end: '2026-11-08T00:44:43.423231+00:00' }
  }
}
assert.deepEqual(parseBilling(body), { percent: 19, periodEnd: '2026-11-08T00:44:43.423231+00:00' })
assert.throws(() => parseBilling({}), /creditUsagePercent/)
assert.throws(() => parseBilling({ config: { creditUsagePercent: 1 } }), /currentPeriod/)

assert.equal(ringColor(19), 'green')
assert.equal(ringColor(49.9), 'green')
assert.equal(ringColor(50), 'yellow')
assert.equal(ringColor(79), 'yellow')
assert.equal(ringColor(80), 'red')
assert.equal(ringColor(null), 'muted')

const now = Date.parse('2026-11-06T00:00:00Z')
const fresh = {
  percent: 19,
  periodEnd: '2026-11-08T00:44:43.423231+00:00',
  updatedAt: new Date(now - 60_000).toISOString(),
  error: null
}
assert.equal(isStale(fresh, now), false)
assert.equal(isStale({ ...fresh, periodEnd: '2026-11-06T00:00:00Z' }, now), true)
assert.equal(isStale({ ...fresh, updatedAt: new Date(now - STALE_MS - 1).toISOString() }, now), true)
assert.equal(isStale({ ...fresh, updatedAt: new Date(now - STALE_MS).toISOString() }, now), false)

const local = new Date(2026, 10, 8, 9, 44)
assert.equal(resetLabel(local.toISOString()), '11/8 09:44')
assert.equal(ringView({ ...fresh, periodEnd: local.toISOString(), updatedAt: new Date(now).toISOString() }, now).title, 'Grok 주간: 19% (resets 11/8 09:44)')
assert.equal(ringView({ ...fresh, error: 'grok 실행 필요' }, now).title, 'grok 실행 필요')
assert.equal(ringView({ ...fresh, error: 'grok 실행 필요' }, now).label, '--')

const picked = pickAuthEntry({
  old: { key: 'a', user_id: 'u1', expires_at: '2026-11-01T00:00:00Z' },
  next: { key: 'b', user_id: 'u2', expires_at: '2026-11-20T00:00:00Z' }
})
assert.equal(picked.user_id, 'u2')
assert.equal(expiresSoon('2026-11-06T00:01:00Z', now), true)
assert.equal(expiresSoon('2026-11-06T00:03:00Z', now), false)
assert.equal(expiresSoon('not-a-date', now), true)

console.log('ok')
