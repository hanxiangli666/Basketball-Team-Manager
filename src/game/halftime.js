export const HALFTIME_MS = 15 * 60 * 1000

export const createHalftime = () => ({ remainingMs: HALFTIME_MS, status: 'READY', lastTickAt: null })

export function settleHalftime(timer, now) {
  if (timer.status !== 'RUNNING') return timer
  const remainingMs = Math.max(0, timer.remainingMs - Math.max(0, now - timer.lastTickAt))
  return { remainingMs, status: remainingMs === 0 ? 'ENDED' : 'RUNNING', lastTickAt: remainingMs === 0 ? null : now }
}

// An optional, damaged break timer must not discard the saved game's minutes.
export function restoreHalftime(timer, now) {
  if (!timer || !Number.isFinite(timer.remainingMs) || timer.remainingMs < 0 || timer.remainingMs > HALFTIME_MS
    || !['READY', 'RUNNING', 'PAUSED', 'ENDED'].includes(timer.status)
    || (timer.status === 'RUNNING' && (!Number.isFinite(timer.lastTickAt) || timer.lastTickAt < 0 || timer.lastTickAt > now))) return null
  if (timer.remainingMs === 0) return { remainingMs: 0, status: 'ENDED', lastTickAt: null }
  return settleHalftime({ remainingMs: timer.remainingMs, status: timer.status === 'ENDED' ? 'PAUSED' : timer.status, lastTickAt: timer.status === 'RUNNING' ? timer.lastTickAt : null }, now)
}
