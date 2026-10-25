// Game time is measured from timestamps, never from the number of timer callbacks.
export const SESSION_VERSION = 1
export const STORAGE_KEY = 'drew.rotation.session.v1'

const copy = (session) => ({ ...session, players: session.players.map((player) => ({ ...player })) })
export const periodDuration = (period) => period <= 2 ? 20 * 60 * 1000 : 5 * 60 * 1000
export const clockLimit = (period) => period <= 2 ? periodDuration(period) : Infinity
export const periodLabel = (period) => period === 1 ? '1st half' : period === 2 ? '2nd half' : `Overtime ${period - 2}`

export function parseTimeParts(minutes, seconds) {
  if (!/^\d+$/.test(minutes) || !/^\d{1,2}$/.test(seconds) || Number(seconds) > 59) return null
  const value = Number(minutes) * 60 + Number(seconds)
  return Number.isSafeInteger(value * 1000) ? value : null
}

export function formatTime(ms, countdown = false) {
  const seconds = Math.max(0, countdown ? Math.ceil(ms / 1000) : Math.floor(ms / 1000))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export function createSession(roster) {
  return {
    version: SESSION_VERSION,
    period: 1,
    clockMs: periodDuration(1),
    status: 'SETUP',
    lastTickAt: null,
    defaultLineupKey: roster.filter((player) => player.starter).map((player) => player.id).sort((a, b) => a - b).join(','),
    players: roster.map((player) => ({
      id: player.id,
      isOnCourt: Boolean(player.starter),
      stintMs: 0,
      totalMs: 0,
      restMs: 0,
      hasPlayed: false,
      lastSubOutClockMs: null,
    })),
  }
}

function creditTime(session, elapsed) {
  for (const player of session.players) {
    if (player.isOnCourt) {
      player.stintMs = Math.max(0, player.stintMs + elapsed)
      player.totalMs = Math.max(0, player.totalMs + elapsed)
      if (elapsed > 0) player.hasPlayed = true
    } else if (player.hasPlayed) {
      player.restMs = Math.max(0, player.restMs + elapsed)
    }
  }
}

export function settleSession(session, now = Date.now()) {
  if (session.status !== 'PLAYING') return session
  const elapsed = Math.min(session.clockMs, Math.max(0, now - session.lastTickAt))
  if (elapsed === 0 && session.clockMs > 0) return session
  const next = copy(session)
  creditTime(next, elapsed)
  next.clockMs -= elapsed
  next.lastTickAt = now
  if (next.clockMs === 0) {
    next.status = 'PAUSED'
    next.lastTickAt = null
  }
  return next
}

export function applyAction(session, action, now = Date.now()) {
  const next = copy(settleSession(session, now))
  const player = next.players.find((candidate) => candidate.id === action.playerId)
  const courtCount = () => next.players.filter((candidate) => candidate.isOnCourt).length

  switch (action.type) {
    case 'confirm-starters':
      if (next.status !== 'SETUP') throw new Error('Starters have already been confirmed.')
      if (courtCount() !== 5 && !action.allowShortHanded) throw new Error('Select five players before confirming.')
      next.status = 'PAUSED'
      break
    case 'clock': {
      if (next.status === 'PLAYING') {
        next.status = 'PAUSED'
        next.lastTickAt = null
      } else {
        if (next.clockMs <= 0) throw new Error('This period has ended. Start the next period below.')
        if (courtCount() !== 5 && !action.allowShortHanded) throw new Error('Select five players before starting the clock.')
        next.status = 'PLAYING'
        next.lastTickAt = now
      }
      break
    }
    case 'toggle': {
      if (!player) throw new Error('Player not found.')
      if (!player.isOnCourt && courtCount() >= 5) throw new Error('Select a player to sub out first.')
      player.isOnCourt = !player.isOnCourt
      if (!player.isOnCourt) player.lastSubOutClockMs = next.clockMs
      player.stintMs = 0
      player.restMs = 0
      break
    }
    case 'swap': {
      const outgoing = next.players.find((candidate) => candidate.id === action.outId)
      if (!outgoing?.isOnCourt || !player || player.isOnCourt) throw new Error('Choose one player on court and one on the bench.')
      outgoing.isOnCourt = false
      outgoing.lastSubOutClockMs = next.clockMs
      outgoing.stintMs = 0
      outgoing.restMs = 0
      player.isOnCourt = true
      player.stintMs = 0
      player.restMs = 0
      break
    }
    case 'adjust-clock': {
      const target = action.seconds === undefined ? next.clockMs + action.delta * 1000 : action.seconds * 1000
      if (!Number.isFinite(target)) throw new Error('Enter a valid time.')
      if (!Number.isSafeInteger(Math.round(target))) throw new Error('Enter a valid time.')
      const clockMs = Math.max(0, Math.min(clockLimit(next.period), target))
      // A scoreboard correction also corrects the current lineup's recorded time.
      if (next.status !== 'SETUP') creditTime(next, next.clockMs - clockMs)
      next.clockMs = clockMs
      if (clockMs === 0) {
        next.status = 'PAUSED'
        next.lastTickAt = null
      }
      break
    }
    case 'adjust-player-time': {
      if (!player?.isOnCourt) throw new Error('Choose a player on court.')
      const delta = action.deltaSeconds * 1000
      if (!Number.isSafeInteger(delta) || player.stintMs + delta < 0
        || !Number.isSafeInteger(Math.ceil(player.totalMs + delta))) throw new Error('Enter a valid player time.')
      // Apply the correction, preserving any time played while the editor was open.
      player.stintMs += delta
      player.totalMs += delta
      if (player.totalMs > 0) player.hasPlayed = true
      break
    }
    case 'next-period': {
      next.period += 1
      const seconds = next.period > 2 ? action.durationSeconds ?? 300 : 1200
      if (!Number.isSafeInteger(seconds * 1000) || seconds <= 0) throw new Error('Enter a valid period duration.')
      next.clockMs = seconds * 1000
      next.status = 'PAUSED'
      next.lastTickAt = null
      next.players.forEach((candidate) => { candidate.stintMs = 0; candidate.restMs = 0 })
      break
    }
    default:
      throw new Error('Unknown game action.')
  }
  return next
}

// Saved files contain game stats only. Roster names and photos always come from roster.js.
export function restoreSession(raw, roster, now = Date.now()) {
  const saved = typeof raw === 'string' ? JSON.parse(raw) : raw
  const finite = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0
  if (!saved || saved.version !== SESSION_VERSION || !Array.isArray(saved.players)
    || !Number.isInteger(saved.period) || saved.period < 1 || saved.period > 100
    || !finite(saved.clockMs) || saved.clockMs > clockLimit(saved.period)
    || !['SETUP', 'PAUSED', 'PLAYING'].includes(saved.status)
    || (saved.status === 'PLAYING' && (!finite(saved.lastTickAt) || saved.lastTickAt > now))) {
    throw new Error('Saved game could not be read.')
  }
  const next = createSession(roster)
  Object.assign(next, { period: saved.period, clockMs: saved.clockMs, status: saved.status, lastTickAt: saved.lastTickAt })
  next.players = next.players.map((player) => {
    const stored = saved.players.find((candidate) => candidate.id === player.id)
    if (!stored) return { ...player, isOnCourt: false }
    if (!['stintMs', 'totalMs', 'restMs'].every((key) => finite(stored[key]))
      || typeof stored.isOnCourt !== 'boolean' || typeof stored.hasPlayed !== 'boolean'
      || stored.stintMs > stored.totalMs) throw new Error('Saved player data could not be read.')
    const lastSubOutClockMs = stored.lastSubOutClockMs ?? null
    if (lastSubOutClockMs !== null && !finite(lastSubOutClockMs)) throw new Error('Saved substitution time could not be read.')
    return { id: player.id, isOnCourt: stored.isOnCourt, stintMs: stored.stintMs, totalMs: stored.totalMs,
      restMs: stored.restMs, hasPlayed: stored.hasPlayed, lastSubOutClockMs }
  })
  if (next.players.filter((player) => player.isOnCourt).length > 5) throw new Error('Saved lineup is invalid.')
  // Old setup saves must not override a newly configured default lineup. Once
  // migrated, the key preserves later manual selections across reloads.
  if (saved.defaultLineupKey !== next.defaultLineupKey && next.status === 'SETUP' && next.period === 1
    && next.players.every((player) => !player.hasPlayed && player.totalMs === 0 && player.stintMs === 0 && player.restMs === 0)) {
    const starters = new Set(roster.filter((player) => player.starter).map((player) => player.id))
    next.players.forEach((player) => { player.isOnCourt = starters.has(player.id) })
  }
  return settleSession(next, now)
}
