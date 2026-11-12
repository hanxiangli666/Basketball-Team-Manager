import assert from 'node:assert/strict'
import test from 'node:test'
import { createSession, applyAction, restoreSession } from '../../src/game/session.js'
import { chooseIncoming, reconcilePlan } from '../../src/game/substitutions.js'
import { groupBenchSeats } from '../../src/game/benchGroups.js'
import { roster } from '../../src/data/roster.js'

const originalFive = [0, 4, 6, 16, 26]
const courtIds = (state) => state.players.filter((player) => player.isOnCourt).map((player) => player.id).sort((a, b) => a - b)

test('injured players keep their fixed seats and recorded minutes but cannot be selected or substituted in', () => {
  const before = createSession(roster)
  const injured = applyAction(before, { type: 'set-injured', playerId: 2, injured: true })
  assert.equal(injured.players.find((player) => player.id === 2).isInjured, true)
  const metadata = (state) => roster.map((player) => ({ ...player, ...state.players.find((candidate) => candidate.id === player.id) }))
  assert.deepEqual(groupBenchSeats(metadata(injured)).map((group) => group.players.map((player) => player.id)), groupBenchSeats(metadata(before)).map((group) => group.players.map((player) => player.id)))
  assert.throws(() => applyAction(injured, { type: 'swap', outId: 26, playerId: 2 }), /injured/)
  assert.throws(() => applyAction(injured, { type: 'toggle', playerId: 2 }), /injured/)
  const plan = { readyIds: [2, 15], activeId: 2, outgoingId: null }
  assert.deepEqual(reconcilePlan(plan, injured.players).readyIds, [15])
  assert.equal(chooseIncoming(plan, 2, injured.players).action, undefined)
  assert.equal(before.players.find((player) => player.id === 2).isInjured, false)
})

test('injury management requires a player to be off court, and clearing an injury makes the same seat available', () => {
  const initial = createSession(roster)
  assert.throws(() => applyAction(initial, { type: 'set-injured', playerId: 26, injured: true }), /Sub this player out/)
  let session = applyAction(initial, { type: 'set-injured', playerId: 2, injured: true })
  session = applyAction(session, { type: 'set-injured', playerId: 2, injured: false })
  const swapped = applyAction(session, { type: 'swap', outId: 26, playerId: 2 })
  assert.equal(swapped.players.find((player) => player.id === 2).isOnCourt, true)
})

test('injuries survive save recovery and new-game initialization while older saves default to available', () => {
  const injured = applyAction(createSession(roster), { type: 'set-injured', playerId: 2, injured: true })
  assert.equal(restoreSession(JSON.stringify(injured), roster).players.find((player) => player.id === 2).isInjured, true)
  const fresh = createSession(roster, [26, 2])
  assert.equal(fresh.players.find((player) => player.id === 26).isOnCourt, false)
  assert.equal(fresh.players.find((player) => player.id === 2).isInjured, true)
  const old = createSession(roster)
  old.players.forEach((player) => { delete player.isInjured })
  assert.ok(restoreSession(JSON.stringify(old), roster).players.every((player) => !player.isInjured))
})

test('the second half restores the five actually confirmed at the start, rather than the last first-half lineup', () => {
  let session = applyAction(createSession(roster), { type: 'swap', outId: 26, playerId: 2 }, 1000)
  session = applyAction(session, { type: 'confirm-starters' }, 1000)
  assert.deepEqual([...session.startingLineup].sort((a, b) => a - b), [0, 2, 4, 6, 16])
  session = applyAction(session, { type: 'clock' }, 2000)
  session = applyAction(session, { type: 'swap', outId: 2, playerId: 19 }, 62000)
  session = applyAction(session, { type: 'clock' }, 122000)
  session = restoreSession(JSON.stringify(session), roster, 123000)
  const totals = session.players.map((player) => player.totalMs)
  const second = applyAction(session, { type: 'next-period' }, 124000)
  assert.deepEqual(courtIds(second), [0, 2, 4, 6, 16])
  assert.deepEqual(second.players.map((player) => player.totalMs), totals)
  assert.ok(second.players.every((player) => player.stintMs === 0))
  assert.equal(second.status, 'PAUSED')
})

test('an injured original starter stays on the bench in the second half; overtime retains the current lineup', () => {
  let session = applyAction(createSession(roster), { type: 'confirm-starters' })
  session = applyAction(session, { type: 'swap', outId: 26, playerId: 2 })
  session = applyAction(session, { type: 'set-injured', playerId: 26, injured: true })
  session = applyAction(session, { type: 'next-period' })
  assert.deepEqual(courtIds(session), originalFive.filter((id) => id !== 26))
  session = applyAction(session, { type: 'toggle', playerId: 2 })
  const overtime = applyAction(session, { type: 'next-period' })
  assert.deepEqual(courtIds(overtime), courtIds(session))
})

test('older games without recorded starters use the configured default five for the second half', () => {
  let session = applyAction(createSession(roster), { type: 'clock' }, 1000)
  session = applyAction(session, { type: 'swap', outId: 26, playerId: 2 }, 2000)
  delete session.startingLineup
  const restored = restoreSession(JSON.stringify(session), roster, 3000)
  const second = applyAction(restored, { type: 'next-period' }, 4000)
  assert.deepEqual(courtIds(second), originalFive)
})
