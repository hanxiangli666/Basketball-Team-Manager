import assert from 'node:assert/strict'
import test from 'node:test'
import { changePracticeStat, practiceLeaders, undoPracticeStat } from '../../src/practice/scoring.js'
import { createEmptyPracticeStats } from '../../src/data/players.js'

test('quick scoring across categories and players can be undone in the actual tap order', () => {
  const original = { 4: { ...createEmptyPracticeStats(), ast: 3 }, 26: createEmptyPracticeStats() }
  let stats = original
  const history = []
  for (const [playerId, key] of [[4, 'charges'], [26, 'sprint'], [4, 'ast']]) {
    const change = changePracticeStat(stats, playerId, key)
    stats = change.stats
    history.push(change.record)
  }
  assert.equal(stats[4].charges, 1)
  assert.equal(stats[4].ast, 4)
  assert.equal(stats[26].sprint, 1)
  for (let record; (record = history.pop());) stats = undoPracticeStat(stats, record)
  assert.deepEqual(stats, original)
  assert.equal(original[4].ast, 3)
  assert.equal(original[26].sprint, 0)
})

test('leaders include every tied winner, never choose zero scores, and keep roster order', () => {
  const players = [{ id: 26, practiceTotal: 0 }, { id: 4, practiceTotal: 0 }, { id: 0, practiceTotal: 0 }]
  assert.deepEqual(practiceLeaders(players), { score: 0, players: [] })
  players[0].practiceTotal = 4
  players[2].practiceTotal = 4
  assert.deepEqual(practiceLeaders(players).players.map(p => p.id), [26, 0])
  players[1].practiceTotal = 5
  assert.deepEqual(practiceLeaders(players).players.map(p => p.id), [4])
  assert.deepEqual(players.map(p => p.id), [26, 4, 0])
})

test('existing nine-category records survive edits and serialization without losing other values', () => {
  const saved = { 19: { ...createEmptyPracticeStats(), stl: 7, dReb: 2 }, 20: { ...createEmptyPracticeStats(), ast: 5 } }
  const updated = changePracticeStat(JSON.parse(JSON.stringify(saved)), 19, 'pTouch')
  assert.equal(Object.values(updated.stats[19]).reduce((sum, n) => sum + n, 0), 10)
  assert.equal(updated.stats[19].stl, 7)
  assert.equal(updated.stats[19].dReb, 2)
  assert.deepEqual(updated.stats[20], saved[20])
  assert.deepEqual(undoPracticeStat(updated.stats, updated.record), saved)
})

test('invalid scoring and stale undo records cannot corrupt stored counts', () => {
  const stats = { 4: createEmptyPracticeStats() }
  for (const args of [[99, 'ast', 1], [4, 'unknown', 1], [4, 'ast', NaN], [4, 'ast', .5], [4, 'ast', -1]]) {
    assert.equal(changePracticeStat(stats, ...args), null)
  }
  const changed = changePracticeStat(stats, 4, 'ast')
  assert.equal(undoPracticeStat(stats, changed.record), null)
  assert.equal(undoPracticeStat(stats, undefined), null)
  assert.equal(stats[4].ast, 0)
})
