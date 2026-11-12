import assert from 'node:assert/strict'
import test from 'node:test'
import { applyAction, createSession, restoreSession, settleSession } from '../../src/game/session.js'
import { HALFTIME_MS } from '../../src/game/halftime.js'
import { roster } from '../../src/data/roster.js'

const enterBreak = (now = 61000) => {
  const playing = applyAction(createSession(roster), { type: 'clock' }, 1000)
  const paused = applyAction(playing, { type: 'clock' }, now)
  return applyAction(paused, { type: 'enter-halftime' }, now)
}

test('halftime opens at 15:00 without changing the lineup or any recorded minutes', () => {
  const session = enterBreak()
  assert.deepEqual(session.halftime, { remainingMs: HALFTIME_MS, status: 'READY', lastTickAt: null })
  const later = settleSession(session, 999999)
  assert.deepEqual(later.players, session.players)
  assert.equal(later.clockMs, session.clockMs)
  assert.equal(later.halftime.remainingMs, HALFTIME_MS)
})

test('running, pausing, and resuming the break excludes all break time from player minutes', () => {
  const before = enterBreak()
  let session = applyAction(before, { type: 'halftime-clock' }, 62000)
  session = settleSession(session, 72037)
  assert.equal(session.halftime.remainingMs, 889963)
  session = applyAction(session, { type: 'halftime-clock' }, 75000)
  assert.equal(session.halftime.remainingMs, 887000)
  assert.equal(session.halftime.status, 'PAUSED')
  assert.equal(settleSession(session, 99000).halftime.remainingMs, 887000)
  session = applyAction(session, { type: 'halftime-clock' }, 100000)
  session = settleSession(session, 105123)
  assert.equal(session.halftime.remainingMs, 881877)
  assert.equal(session.clockMs, before.clockMs)
  assert.deepEqual(session.players, before.players)
})

test('a running break survives reload, catches up in the background, and stops at zero', () => {
  const before = enterBreak()
  const running = applyAction(before, { type: 'halftime-clock' }, 62000)
  const restored = restoreSession(JSON.stringify(running), roster, 182000)
  assert.equal(restored.halftime.remainingMs, 780000)
  const finished = restoreSession(JSON.stringify(restored), roster, 2000000)
  assert.deepEqual(finished.halftime, { remainingMs: 0, status: 'ENDED', lastTickAt: null })
  assert.equal(finished.period, 1)
  assert.equal(finished.status, 'PAUSED')
  assert.deepEqual(finished.players, before.players)
  assert.throws(() => applyAction(finished, { type: 'halftime-clock' }, 2000000), /Reset/)
})

test('reopening halftime preserves the current countdown and paused saves stay frozen', () => {
  let session = applyAction(enterBreak(), { type: 'halftime-clock' }, 62000)
  session = applyAction(session, { type: 'halftime-clock' }, 182000)
  const reopened = applyAction(session, { type: 'enter-halftime' }, 400000)
  assert.deepEqual(reopened.halftime, session.halftime)
  assert.deepEqual(restoreSession(JSON.stringify(reopened), roster, 999999).halftime, session.halftime)
})

test('reset and clock sync only change the break; invalid times cannot corrupt it', () => {
  const before = enterBreak()
  let session = applyAction(before, { type: 'halftime-clock' }, 62000)
  session = applyAction(session, { type: 'sync-halftime', seconds: 121 }, 63000)
  assert.equal(session.halftime.status, 'RUNNING')
  assert.equal(settleSession(session, 64000).halftime.remainingMs, 120000)
  assert.deepEqual(session.players, before.players)
  assert.equal(session.clockMs, before.clockMs)
  for (const seconds of [-1, 901, 1.0001, NaN, Infinity]) {
    assert.throws(() => applyAction(session, { type: 'sync-halftime', seconds }, 63000), /between/)
  }
  const ended = applyAction(session, { type: 'sync-halftime', seconds: 0 }, 64000)
  assert.equal(ended.halftime.status, 'ENDED')
  const reset = applyAction(ended, { type: 'reset-halftime' }, 65000)
  assert.deepEqual(reset.halftime, { remainingMs: HALFTIME_MS, status: 'READY', lastTickAt: null })
  assert.deepEqual(reset.players, before.players)
  assert.equal(before.halftime.status, 'READY')
})

test('ending the break prepares a paused 20-minute second half and preserves totals and lineup', () => {
  const before = enterBreak()
  let session = applyAction(before, { type: 'halftime-clock' }, 62000)
  session = applyAction(session, { type: 'next-period' }, 182000)
  assert.equal(session.period, 2)
  assert.equal(session.clockMs, 1200000)
  assert.equal(session.status, 'PAUSED')
  assert.equal(session.halftime, undefined)
  assert.deepEqual(session.players.map(({ id, totalMs, isOnCourt }) => ({ id, totalMs, isOnCourt })), before.players.map(({ id, totalMs, isOnCourt }) => ({ id, totalMs, isOnCourt })))
  assert.ok(session.players.every((player) => player.stintMs === 0 && player.restMs === 0))
  assert.equal(settleSession(session, 999999).clockMs, 1200000)
})

test('game and break clocks cannot run together and halftime is only available in the first half', () => {
  const playing = applyAction(createSession(roster), { type: 'clock' }, 1000)
  assert.throws(() => applyAction(playing, { type: 'enter-halftime' }, 2000), /Pause/)
  const halftime = enterBreak()
  assert.throws(() => applyAction(halftime, { type: 'clock' }, 62000), /End halftime/)
  assert.throws(() => applyAction(halftime, { type: 'adjust-clock', delta: -1 }, 62000), /End halftime/)
  const secondHalf = applyAction(halftime, { type: 'next-period' }, 62000)
  assert.throws(() => applyAction(secondHalf, { type: 'enter-halftime' }, 63000), /1st-half/)
})

test('old saves restore normally and invalid optional break data never erases game records', () => {
  const before = enterBreak()
  for (const halftime of [undefined, null, {}, { remainingMs: -1, status: 'PAUSED' }, { remainingMs: 901000, status: 'READY' }, { remainingMs: 800000, status: 'RUNNING', lastTickAt: 900000 }]) {
    const restored = restoreSession(JSON.stringify({ ...before, halftime }), roster, 61000)
    assert.deepEqual(restored.players, before.players)
    assert.equal(restored.clockMs, before.clockMs)
    assert.equal(restored.halftime, undefined)
  }
  assert.equal(createSession(roster).halftime, undefined)
})
