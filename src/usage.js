export const STALE_MS = 30 * 60 * 1000
export const EXPIRY_SKEW_MS = 2 * 60 * 1000
export const RING_RADIUS = 12
export const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

const STROKE = {
  green: 'stroke-green-500',
  yellow: 'stroke-yellow-500',
  red: 'stroke-red-500',
  muted: 'stroke-nim-muted'
}

export function parseBilling(body) {
  const percent = body?.config?.creditUsagePercent
  const periodEnd = body?.config?.currentPeriod?.end
  if (typeof percent !== 'number' || !Number.isFinite(percent)) {
    throw new Error('billing 응답에 creditUsagePercent가 없습니다')
  }
  if (typeof periodEnd !== 'string' || periodEnd.length === 0) {
    throw new Error('billing 응답에 currentPeriod.end가 없습니다')
  }
  return { percent, periodEnd }
}

export function pickAuthEntry(data) {
  if (!data || typeof data !== 'object') return null
  const entries = Object.values(data).filter(
    (entry) => entry && typeof entry.key === 'string' && entry.key && typeof entry.user_id === 'string' && entry.user_id
  )
  if (entries.length === 0) return null
  entries.sort((a, b) => (Date.parse(b.expires_at) || 0) - (Date.parse(a.expires_at) || 0))
  return entries[0]
}

export function expiresSoon(expiresAt, now = Date.now(), skewMs = EXPIRY_SKEW_MS) {
  const at = Date.parse(expiresAt)
  if (Number.isNaN(at)) return true
  return at - now <= skewMs
}

export function ringColor(percent) {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) return 'muted'
  if (percent >= 80) return 'red'
  if (percent >= 50) return 'yellow'
  return 'green'
}

export function isStale(record, now = Date.now()) {
  if (!record || typeof record.percent !== 'number' || !Number.isFinite(record.percent)) return true
  const end = Date.parse(record.periodEnd)
  if (!Number.isNaN(end) && end <= now) return true
  const updated = Date.parse(record.updatedAt)
  if (Number.isNaN(updated) || now - updated > STALE_MS) return true
  return false
}

export function resetLabel(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function extensionUsagePath(extensionPath) {
  const trimmed = String(extensionPath).replace(/[\\/]+$/, '')
  const sep = trimmed.includes('\\') ? '\\' : '/'
  return `${trimmed}${sep}usage.json`
}

export function ringView(record, now = Date.now()) {
  if (!record || record.error || isStale(record, now)) {
    const title = record?.error === 'grok 실행 필요'
      ? 'grok 실행 필요'
      : record?.error
        ? `Grok 주간: -- (${record.error})`
        : 'Grok 주간: --'
    return { label: '--', stroke: STROKE.muted, title, dashOffset: RING_CIRCUMFERENCE }
  }
  const percent = Math.round(record.percent)
  const reset = resetLabel(record.periodEnd)
  const color = ringColor(record.percent)
  return {
    label: `${percent}%`,
    stroke: STROKE[color],
    title: reset ? `Grok 주간: ${percent}% (resets ${reset})` : `Grok 주간: ${percent}%`,
    dashOffset: RING_CIRCUMFERENCE * (1 - record.percent / 100)
  }
}
