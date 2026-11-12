import assert from 'node:assert/strict'
import test from 'node:test'
import { roster } from '../../src/data/roster.js'
import { reconcileBenchOrder } from '../../src/game/benchOrder.js'

const initialPlayers = () => roster.map((player) => ({ ...player, isOnCourt: Boolean(player.starter) }))
const swap = (players, incoming, outgoing) => players.map((player) => ({
  ...player,
  isOnCourt: player.id === incoming ? true : player.id === outgoing ? false : player.isOnCourt,
}))

test('a swap changes just one bench seat and undo restores the same seats', () => {
  const players = initialPlayers()
  const order = reconcileBenchOrder(null, players)
  const seat = order.indexOf(2)
  const changed = reconcileBenchOrder(order, swap(players, 2, 26))
  assert.equal(changed[seat], 26)
  assert.deepEqual(changed.filter((_, index) => index !== seat), order.filter((_, index) => index !== seat))
  assert.deepEqual(reconcileBenchOrder(changed, players), order)
})

test('consecutive swaps, reopening and restoring saved order never move unaffected players', () => {
  const players = initialPlayers()
  const order = reconcileBenchOrder(null, players)
  const firstPlayers = swap(players, 2, 26)
  const firstOrder = reconcileBenchOrder(order, firstPlayers)
  const secondPlayers = swap(firstPlayers, 15, 6)
  const secondOrder = reconcileBenchOrder(firstOrder, secondPlayers)
  assert.equal(secondOrder[order.indexOf(2)], 26)
  assert.equal(secondOrder[order.indexOf(15)], 6)
  for (const id of order.filter((id) => ![2, 15].includes(id))) {
    assert.equal(secondOrder.indexOf(id), order.indexOf(id))
  }
  assert.deepEqual(reconcileBenchOrder(JSON.parse(JSON.stringify(secondOrder)), secondPlayers), secondOrder)
  assert.deepEqual(reconcileBenchOrder(secondOrder, firstPlayers), firstOrder)
})

test('stale, duplicate or malformed saved seats cannot hide or duplicate a bench player', () => {
  const players = initialPlayers()
  const order = reconcileBenchOrder(null, players)
  assert.deepEqual(reconcileBenchOrder([2, 2, 999], players), order)
  assert.deepEqual(reconcileBenchOrder({ bad: 'save' }, players), order)
  assert.deepEqual(reconcileBenchOrder(order, players), order)
})
