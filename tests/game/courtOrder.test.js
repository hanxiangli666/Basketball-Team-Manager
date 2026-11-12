import assert from 'node:assert/strict'
import test from 'node:test'
import { orderCourtPlayers } from '../../src/game/courtOrder.js'
import { roster } from '../../src/data/roster.js'

test('starter confirmation lists the five starters by position, even with old recorded time', () => {
  const players = roster.map((player) => ({ ...player, isOnCourt: player.starter, stintMs: player.pos === 'C' ? 120000 : 0 }))
  const order = players.filter((player) => player.isOnCourt).map((player) => player.id)
  assert.deepEqual(orderCourtPlayers(players, order, true).map((player) => player.pos), ['PG', 'SG', 'SF', 'PF', 'C'])
  assert.deepEqual(orderCourtPlayers(players, order, true).map((player) => player.id), [6, 4, 26, 0, 16])
})

test('after confirmation, longest continuous playing time comes first and ties keep their order', () => {
  const players = [
    { id: 1, pos: 'PG', isOnCourt: true, stintMs: 10000 },
    { id: 2, pos: 'C', isOnCourt: true, stintMs: 120000 },
    { id: 3, pos: 'SF', isOnCourt: true, stintMs: 60000 },
    { id: 4, pos: 'SG', isOnCourt: true, stintMs: 60000 },
    { id: 5, pos: 'PF', isOnCourt: false, stintMs: 999999 },
  ]
  assert.deepEqual(orderCourtPlayers(players, [1, 4, 3, 2], false).map((player) => player.id), [2, 4, 3, 1])
  assert.equal(players[0].id, 1)
})
