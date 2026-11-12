import assert from 'node:assert/strict'
import test from 'node:test'
import { roster } from '../../src/data/roster.js'
import { groupBenchSeats } from '../../src/game/benchGroups.js'

const seatIds = (players) => groupBenchSeats(players).map((group) => group.players.map((player) => player.id))

test('all twenty fixed seats are grouped by position with the default starter first', () => {
  assert.deepEqual(groupBenchSeats(roster).map((group) => group.position), ['PG', 'SG', 'SF', 'PF', 'C'])
  assert.deepEqual(seatIds(roster), [[6, 8, 10, 12, 21], [4, 15, 18, 20], [26, 2, 19, 24], [0, 17, 25], [16, 9, 22, 23]])
  assert.equal(new Set(seatIds(roster).flat()).size, 20)
})

test('playing status and elapsed minutes never change a fixed seat', () => {
  const before = JSON.stringify(roster)
  const changed = roster.map((player) => ({ ...player, isOnCourt: [2, 8, 15, 22, 25].includes(player.id), totalMs: player.id * 1000, stintMs: player.id * 500 }))
  assert.deepEqual(seatIds(changed), seatIds(roster))
  assert.deepEqual(seatIds(JSON.parse(JSON.stringify(changed))), seatIds(roster))
  assert.equal(JSON.stringify(roster), before)
})
