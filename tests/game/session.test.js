import assert from 'node:assert/strict'
import test from 'node:test'
import { applyAction, createSession, formatTime, periodDuration, restoreSession, settleSession } from '../../src/game/session.js'
import { roster } from '../../src/data/roster.js'

const start = (now = 1000) => applyAction(createSession(roster), { type: 'clock' }, now)
const stateOf = (session, id) => session.players.find((player) => player.id === id)
const starterId = roster.find((player) => player.starter).id
const benchId = roster.find((player) => !player.starter).id

test('starts with the existing five starters and a 20-minute clock', () => {
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

test('fouls stay in range and a fouled-out player cannot enter', () => {
  let session = createSession(roster)
  for (let i = 0; i < 8; i++) session = applyAction(session, { type: 'foul', playerId: benchId, delta: 1 }, 1000)
  assert.equal(stateOf(session, benchId).fouls, 5)
  assert.throws(() => applyAction(session, { type: 'swap', outId: starterId, playerId: benchId }, 1000), /fouled out/)
  session = applyAction(session, { type: 'foul', playerId: starterId, delta: -1 }, 1000)
  assert.equal(stateOf(session, starterId).fouls, 0)
})

test('next half preserves totals, fouls and lineup, resets stints, and supports 5-minute overtime', () => {
  let session = applyAction(start(), { type: 'foul', playerId: starterId, delta: 1 }, 4000)
  session = applyAction(session, { type: 'next-period' }, 4000)
  assert.equal(session.period, 2)
  assert.equal(session.clockMs, 1200000)
  assert.equal(session.status, 'PAUSED')
  assert.equal(stateOf(session, starterId).totalMs, 3000)
  assert.equal(stateOf(session, starterId).stintMs, 0)
  assert.equal(stateOf(session, starterId).fouls, 1)
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
