import assert from 'node:assert/strict'
import test from 'node:test'
import { applyAction, createSession, formatTime, parseTimeParts, periodDuration, restoreSession, settleSession } from '../../src/game/session.js'
import { roster as teamRoster } from '../../src/data/roster.js'

// Timing rules use a complete fixture lineup, independent of seasonal roster choices.
const roster = teamRoster.map((player, index) => ({ ...player, starter: index < 5 }))

const start = (now = 1000) => applyAction(createSession(roster), { type: 'clock' }, now)
const stateOf = (session, id) => session.players.find((player) => player.id === id)
const starterId = roster.find((player) => player.starter).id
const benchId = roster.find((player) => !player.starter).id

test('respects a selected five-player lineup and starts with a 20-minute clock', () => {
  const session = createSession(roster)
  assert.equal(session.players.filter((player) => player.isOnCourt).length, 5)
  assert.equal(session.clockMs, 1200000)
  assert.equal(session.status, 'SETUP')
})

test('delayed callbacks catch up from timestamps without accumulating drift', () => {
  let session = start()
  for (const now of [1037, 1192, 4500, 9033, 10457]) session = settleSession(session, now)
  assert.equal(session.clockMs, 1200000 - 9457)
  assert.equal(stateOf(session, starterId).totalMs, 9457)
  assert.equal(stateOf(session, benchId).totalMs, 0)
})

test('a swap settles the outgoing player at the exact click and starts the incoming player together', () => {
  const session = applyAction(start(), { type: 'swap', outId: starterId, playerId: benchId }, 2250)
  assert.equal(stateOf(session, starterId).totalMs, 1250)
  assert.equal(stateOf(session, starterId).isOnCourt, false)
  assert.equal(stateOf(session, benchId).isOnCourt, true)
  assert.equal(session.players.filter((player) => player.isOnCourt).length, 5)
  const later = settleSession(session, 3500)
  assert.equal(stateOf(later, starterId).totalMs, 1250)
  assert.equal(stateOf(later, starterId).restMs, 1250)
  assert.equal(stateOf(later, benchId).totalMs, 1250)
})

test('pauses freeze both playing time and rest time', () => {
  let session = applyAction(start(), { type: 'swap', outId: starterId, playerId: benchId }, 2000)
  session = applyAction(session, { type: 'clock' }, 3000)
  assert.strictEqual(settleSession(session, 999999), session)
  session = applyAction(session, { type: 'clock' }, 1000000)
  session = settleSession(session, 1001000)
  assert.equal(stateOf(session, starterId).totalMs, 1000)
  assert.equal(stateOf(session, starterId).restMs, 2000)
  assert.equal(stateOf(session, benchId).totalMs, 2000)
})

test('running-game refresh restores elapsed time, including time spent off page', () => {
  const restored = restoreSession(JSON.stringify(start()), roster, 4321)
  assert.equal(restored.status, 'PLAYING')
  assert.equal(restored.clockMs, 1196679)
  assert.equal(stateOf(restored, starterId).totalMs, 3321)
})

test('background time is capped exactly at the period boundary', () => {
  const session = settleSession(start(), 2000000)
  assert.equal(session.clockMs, 0)
  assert.equal(session.status, 'PAUSED')
  assert.equal(session.lastTickAt, null)
  assert.equal(stateOf(session, starterId).totalMs, 1200000)
  assert.throws(() => applyAction(session, { type: 'clock' }, 2000001), /ended/)
})

test('clock correction immediately adjusts the active lineup and can restore an ended clock', () => {
  let session = applyAction(start(), { type: 'adjust-clock', delta: -10 }, 2000)
  assert.equal(session.clockMs, 1189000)
  assert.equal(stateOf(session, starterId).totalMs, 11000)
  assert.equal(stateOf(session, benchId).totalMs, 0)
  session = applyAction(session, { type: 'adjust-clock', delta: 1 }, 2000)
  assert.equal(stateOf(session, starterId).totalMs, 10000)
  session = applyAction(session, { type: 'adjust-clock', seconds: 0 }, 2000)
  assert.equal(session.status, 'PAUSED')
  session = applyAction(session, { type: 'adjust-clock', delta: 1 }, 2000)
  assert.equal(session.clockMs, 1000)
  assert.equal(session.status, 'PAUSED')
})

test('pregame clock setup never gives players fictitious minutes', () => {
  const session = applyAction(createSession(roster), { type: 'adjust-clock', seconds: 600 }, 1000)
  assert.equal(session.clockMs, 600000)
  assert.equal(stateOf(session, starterId).totalMs, 0)
})

test('clock corrections clamp to the period limits and never create negative minutes', () => {
  let session = applyAction(start(), { type: 'adjust-clock', delta: 100 }, 1000)
  assert.equal(session.clockMs, periodDuration(1))
  assert.equal(stateOf(session, starterId).totalMs, 0)
  session = applyAction(session, { type: 'adjust-clock', delta: -999999 }, 1000)
  assert.equal(session.clockMs, 0)
  assert.equal(stateOf(session, starterId).totalMs, 1200000)
  assert.throws(() => applyAction(session, { type: 'adjust-clock', seconds: NaN }, 1000), /valid time/)
})

test('no sixth player can enter in setup or during play', () => {
  for (const session of [createSession(roster), start()]) {
    assert.throws(() => applyAction(session, { type: 'toggle', playerId: benchId }, 1000), /Sub|sub/)
  }
})

test('short-handed starts require an explicit override', () => {
  const short = applyAction(createSession(roster), { type: 'toggle', playerId: starterId }, 1000)
  assert.throws(() => applyAction(short, { type: 'clock' }, 1000), /five/)
  assert.equal(applyAction(short, { type: 'clock', allowShortHanded: true }, 1000).status, 'PLAYING')
})

test('next half preserves totals and lineup, resets stints, and supports 5-minute overtime', () => {
  let session = settleSession(start(), 4000)
  session = applyAction(session, { type: 'next-period' }, 4000)
  assert.equal(session.period, 2)
  assert.equal(session.clockMs, 1200000)
  assert.equal(session.status, 'PAUSED')
  assert.equal(stateOf(session, starterId).totalMs, 3000)
  assert.equal(stateOf(session, starterId).stintMs, 0)
  assert.equal(stateOf(session, starterId).isOnCourt, true)
  session = applyAction(session, { type: 'next-period' }, 5000)
  assert.equal(session.period, 3)
  assert.equal(session.clockMs, 300000)
})

test('undo snapshot restores the original lineup and attributes elapsed time correctly', () => {
  const before = settleSession(start(), 2000)
  const swapped = applyAction(before, { type: 'swap', outId: starterId, playerId: benchId }, 2000)
  assert.equal(stateOf(swapped, benchId).isOnCourt, true)
  const undone = settleSession(before, 3500)
  assert.equal(stateOf(undone, starterId).totalMs, 2500)
  assert.equal(stateOf(undone, benchId).totalMs, 0)
  assert.equal(undone.clockMs, 1197500)
})

test('transitions never mutate earlier snapshots needed by undo', () => {
  const original = start()
  const serialized = JSON.stringify(original)
  applyAction(original, { type: 'swap', outId: starterId, playerId: benchId }, 5000)
  applyAction(original, { type: 'adjust-clock', delta: -10 }, 5000)
  assert.equal(JSON.stringify(original), serialized)
})

test('saved stats follow stable IDs when the roster changes, with new players on the bench', () => {
  const updatedRoster = [...roster.filter((player) => player.id !== starterId), { id: 99, name: 'New Player', starter: true }]
  const restored = restoreSession(JSON.stringify(start()), updatedRoster, 2000)
  assert.equal(restored.players.some((player) => player.id === starterId), false)
  assert.equal(stateOf(restored, 99).isOnCourt, false)
  assert.equal(stateOf(restored, 99).totalMs, 0)
})

test('rejects corrupted saved state rather than silently loading an invalid clock or lineup', () => {
  assert.throws(() => restoreSession('{broken', roster, 1000))
  for (const change of [{ clockMs: -1 }, { clockMs: Infinity }, { version: 999 }, { period: 0 }, { status: 'INVALID' }]) {
    assert.throws(() => restoreSession({ ...createSession(roster), ...change }, roster, 1000))
  }
  const corrupt = createSession(roster)
  corrupt.players[0].totalMs = 'invalid'
  assert.throws(() => restoreSession(corrupt, roster, 1000), /player data/)
})

test('formats countdown and elapsed minutes without showing zero early', () => {
  assert.equal(formatTime(1199999, true), '20:00')
  assert.equal(formatTime(1001, true), '00:02')
  assert.equal(formatTime(1999), '00:01')
  assert.equal(formatTime(0, true), '00:00')
})

test('classic starter confirmation keeps the clock paused until an explicit start', () => {
  const confirmed = applyAction(createSession(roster), { type: 'confirm-starters' }, 1000)
  assert.equal(confirmed.status, 'PAUSED')
  assert.equal(confirmed.lastTickAt, null)
  assert.strictEqual(settleSession(confirmed, 9000), confirmed)
  assert.equal(applyAction(confirmed, { type: 'clock' }, 9000).status, 'PLAYING')
  const short = applyAction(createSession(roster), { type: 'toggle', playerId: starterId }, 1000)
  assert.throws(() => applyAction(short, { type: 'confirm-starters' }, 1000), /five/)
})

test('last sub-out clock survives substitution, period changes and a reload', () => {
  const swapped = applyAction(start(), { type: 'swap', outId: starterId, playerId: benchId }, 2250)
  assert.equal(stateOf(swapped, starterId).lastSubOutClockMs, 1198750)
  const nextHalf = applyAction(swapped, { type: 'next-period' }, 2250)
  const restored = restoreSession(JSON.stringify(nextHalf), roster, 3000)
  assert.equal(stateOf(restored, starterId).lastSubOutClockMs, 1198750)
})

test('loading a previous local save without substitution metadata remains compatible', () => {
  const saved = createSession(roster)
  for (const player of saved.players) delete player.lastSubOutClockMs
  const restored = restoreSession(saved, roster, 1000)
  assert.equal(stateOf(restored, starterId).lastSubOutClockMs, null)
})

// Older local saves may still contain retired players and removed foul counters.
test('season migration drops retired players and legacy foul restrictions without losing returning minutes', () => {
  const saved = start()
  for (const player of saved.players) player.fouls = 5
  const currentRoster = roster.filter((player) => player.id !== starterId)
  const restored = restoreSession(saved, currentRoster, 2000)
  assert.equal(restored.players.some((player) => player.id === starterId), false)
  assert.ok(restored.players.every((player) => !('fouls' in player)))
  assert.equal(stateOf(restored, roster[1].id).totalMs, 1000)
  const next = applyAction(restored, { type: 'toggle', playerId: benchId }, 2000)
  assert.equal(stateOf(next, benchId).isOnCourt, true)
})

test('legacy two-player setup restores the current five default starters automatically', () => {
  const saved = createSession(teamRoster)
  delete saved.defaultLineupKey
  saved.players.forEach((player) => { player.isOnCourt = [6, 8].includes(player.id) })
  const restored = restoreSession(JSON.stringify(saved), teamRoster, 1000)
  assert.deepEqual(restored.players.filter((player) => player.isOnCourt).map((player) => player.id),
    teamRoster.filter((player) => player.starter).map((player) => player.id))
  assert.equal(restored.clockMs, saved.clockMs)
  assert.equal(restored.status, 'SETUP')
})

test('changed defaults migrate an unstarted setup without resetting its clock', () => {
  const previousRoster = teamRoster.map((player) => ({ ...player, starter: [4, 6].includes(player.id) }))
  const saved = applyAction(createSession(previousRoster), { type: 'adjust-clock', seconds: 600 }, 1000)
  const restored = restoreSession(saved, teamRoster, 2000)
  assert.deepEqual(restored.players.filter((player) => player.isOnCourt).map((player) => player.id),
    teamRoster.filter((player) => player.starter).map((player) => player.id))
  assert.equal(restored.clockMs, 600000)
})

test('a manually selected setup survives subsequent reloads with the same defaults', () => {
  const saved = applyAction(createSession(teamRoster), { type: 'swap', outId: 26, playerId: 19 }, 1000)
  const once = restoreSession(JSON.stringify(saved), teamRoster, 2000)
  const twice = restoreSession(JSON.stringify(once), teamRoster, 3000)
  assert.equal(stateOf(twice, 19).isOnCourt, true)
  assert.equal(stateOf(twice, 26).isOnCourt, false)
})

test('updated defaults never replace the lineup or minutes of a started game', () => {
  const oldRoster = teamRoster.map((player) => ({ ...player, starter: [6, 8].includes(player.id) }))
  const running = applyAction(createSession(oldRoster), { type: 'clock', allowShortHanded: true }, 1000)
  delete running.defaultLineupKey
  for (const saved of [running, applyAction(running, { type: 'clock' }, 1500)]) {
    const restored = restoreSession(saved, teamRoster, 2000)
    assert.deepEqual(restored.players.filter((player) => player.isOnCourt).map((player) => player.id), [6, 8])
    assert.equal(stateOf(restored, 6).totalMs, saved.status === 'PLAYING' ? 1000 : 500)
    assert.equal(restored.status, saved.status)
  }
})

test('correcting four minutes to two preserves previous rotations and every other player', () => {
  let session = settleSession(start(), 121000)
  session = applyAction(session, { type: 'swap', outId: starterId, playerId: benchId }, 121000)
  session = applyAction(session, { type: 'swap', outId: benchId, playerId: starterId }, 181000)
  session = applyAction(session, { type: 'clock' }, 421000)
  const before = JSON.stringify(session)
  const corrected = applyAction(session, { type: 'adjust-player-time', playerId: starterId, deltaSeconds: -120 }, 422000)
  assert.equal(stateOf(corrected, starterId).stintMs, 120000)
  assert.equal(stateOf(corrected, starterId).totalMs, 240000)
  assert.equal(corrected.clockMs, session.clockMs)
  assert.equal(corrected.status, 'PAUSED')
  assert.deepEqual(corrected.players.filter((p) => p.id !== starterId), session.players.filter((p) => p.id !== starterId))
  assert.equal(JSON.stringify(session), before)
  assert.deepEqual(restoreSession(JSON.stringify(corrected), roster, 422000), corrected)
})

test('a live correction keeps the time played while editing and undo continues the original clock', () => {
  const before = settleSession(start(), 241000)
  const corrected = applyAction(before, { type: 'adjust-player-time', playerId: starterId, deltaSeconds: -120 }, 251000)
  assert.equal(stateOf(corrected, starterId).stintMs, 130000)
  assert.equal(stateOf(corrected, starterId).totalMs, 130000)
  assert.equal(corrected.clockMs, 950000)
  assert.equal(corrected.status, 'PLAYING')
  const undone = settleSession(before, 256000)
  assert.equal(stateOf(undone, starterId).stintMs, 255000)
  assert.equal(undone.clockMs, 945000)
})

test('player time can be increased or set to zero but invalid corrections cannot corrupt a save', () => {
  const session = settleSession(start(), 61000)
  const raised = applyAction(session, { type: 'adjust-player-time', playerId: starterId, deltaSeconds: 120 }, 61000)
  assert.equal(stateOf(raised, starterId).stintMs, 180000)
  const zeroed = applyAction(raised, { type: 'adjust-player-time', playerId: starterId, deltaSeconds: -180 }, 61000)
  assert.equal(stateOf(zeroed, starterId).totalMs, 0)
  for (const deltaSeconds of [-61, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => applyAction(session, { type: 'adjust-player-time', playerId: starterId, deltaSeconds }, 61000), /valid player time/)
  }
  assert.throws(() => applyAction(session, { type: 'adjust-player-time', playerId: benchId, deltaSeconds: 10 }, 61000), /on court/)
})

test('overtime accepts a custom duration above five minutes and restores it without resetting the game', () => {
  let session = applyAction(start(), { type: 'next-period' }, 61000)
  session = applyAction(session, { type: 'next-period', durationSeconds: 12 * 60 + 30 }, 61000)
  assert.equal(session.clockMs, 750000)
  assert.equal(stateOf(session, starterId).totalMs, 60000)
  assert.equal(stateOf(session, starterId).stintMs, 0)
  const running = applyAction(session, { type: 'clock' }, 61000)
  const restored = restoreSession(JSON.stringify(running), roster, 71000)
  assert.equal(restored.clockMs, 740000)
  assert.equal(stateOf(restored, starterId).totalMs, 70000)
  const edited = applyAction(restored, { type: 'adjust-clock', seconds: 123 * 60 + 45 }, 71000)
  assert.equal(edited.clockMs, 7425000)
  assert.equal(applyAction(edited, { type: 'adjust-clock', delta: 1 }, 71000).clockMs, 7426000)
  assert.equal(restoreSession(JSON.stringify(edited), roster, 71000).clockMs, 7425000)
  const nextOT = applyAction(edited, { type: 'next-period' }, 71000)
  assert.equal(nextOT.period, 4)
  assert.equal(nextOT.clockMs, 300000)
})

test('default overtime and old saves remain compatible while halves retain their limit', () => {
  let session = applyAction(createSession(roster), { type: 'next-period' }, 1000)
  assert.equal(applyAction(session, { type: 'adjust-clock', seconds: 1800 }, 1000).clockMs, 1200000)
  session = applyAction(session, { type: 'next-period' }, 1000)
  assert.equal(session.clockMs, 300000)
  assert.equal(restoreSession(JSON.stringify(session), roster, 1000).clockMs, 300000)
  for (const durationSeconds of [0, -1, Infinity, NaN]) {
    assert.throws(() => applyAction(session, { type: 'next-period', durationSeconds }, 1000), /valid period/)
  }
})

test('numeric minute and second fields support long durations without accepting malformed times', () => {
  assert.equal(parseTimeParts('123', '45'), 7425)
  assert.equal(parseTimeParts('0', '00'), 0)
  for (const [minutes, seconds] of [['', '00'], ['-1', '00'], ['1.5', '00'], ['2', '60'], ['2', ''], ['2', '000'], ['999999999999999999', '00']]) {
    assert.equal(parseTimeParts(minutes, seconds), null)
  }
})
