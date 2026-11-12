import assert from 'node:assert/strict'
import test from 'node:test'
import { roster } from '../../src/data/roster.js'
import { createPlayerDisplayNames } from '../../src/data/playerNames.js'
import { matchesPlayerSearch } from '../../src/game/playerSearch.js'

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

test('display labels remain searchable by shorthand and official name', () => {
  const names = createPlayerDisplayNames(roster)
  for (const player of roster) {
    assert.equal(matchesPlayerSearch(player, names.get(player.id)), true)
    assert.equal(matchesPlayerSearch(player, player.name), true)
  }
})
