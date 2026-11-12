import assert from 'node:assert/strict'
import test from 'node:test'
import { roster } from '../../src/data/roster.js'
import { createPlayerDisplayNames } from '../../src/data/playerNames.js'

test('roster labels use nicknames and only disambiguate the repeated display name', () => {
  const before = JSON.stringify(roster)
  const names = createPlayerDisplayNames(roster)
  assert.equal(names.get(2), 'Kip')
  assert.equal(names.get(15), 'Jeppy')
  assert.equal(names.get(16), 'B Manns')
  assert.equal(names.get(0), 'Charlie T')
  assert.equal(names.get(18), 'Charlie D')
  assert.equal(names.get(6), 'Andre')
  assert.equal(names.get(24), 'Chandler')
  assert.equal(new Set(names.values()).size, roster.length)
  assert.equal(JSON.stringify(roster), before)
})

test('the same roster labels survive refresh and do not depend on who is playing', () => {
  const names = createPlayerDisplayNames(roster)
  const restored = JSON.parse(JSON.stringify(roster)).map((player) => ({ ...player, isOnCourt: true }))
  assert.deepEqual(createPlayerDisplayNames(restored), names)
})
