import assert from 'node:assert/strict'
import test from 'node:test'
import { matchesPlayerSearch } from '../../src/game/playerSearch.js'
import { roster } from '../../src/data/roster.js'

const find = query => roster.filter(player => matchesPlayerSearch(player, query)).map(player => player.name)

test('bench search accepts full names, name fragments and initials without choosing an ambiguous name', () => {
  assert.deepEqual(find('dyl'), ['Dylan Napoleon'])
  assert.deepEqual(find('BM'), ['Ben Manns'])
  assert.deepEqual(find('c t'), ['Charlie Thornton'])
  assert.deepEqual(find('ADLR'), ['Andre De Los Reyes'])
  assert.deepEqual(find('DLR'), ['Andre De Los Reyes'])
  assert.deepEqual(find('j c'), ['Jameson Cassidy'])
  assert.deepEqual(find('charli th'), ['Charlie Thornton'])
  assert.deepEqual(find('Ben'), ['Ben Kipnis', 'Ben Manns'])
  assert.deepEqual(find('Charlie'), ['Charlie Thornton', 'Charlie Dunner'])
})

test('known shorthand can find the official full name while retired players remain absent', () => {
  assert.deepEqual(find('Kip'), ['Ben Kipnis'])
  assert.deepEqual(find('Jeppy'), ['Connor Jepson'])
  assert.deepEqual(find('Mark'), ['Marc Herasme'])
  assert.deepEqual(find('KevCot'), ['Kevin Cotton'])
  assert.deepEqual(find('Devin'), [])
  assert.deepEqual(find('not-a-player'), [])
  assert.equal(find('').length, 20)
})

test('search tolerates case, punctuation and accents without changing the player record', () => {
  const player = { id: 99, name: 'José D’Angelo' }
  assert.equal(matchesPlayerSearch(player, 'JOSE'), true)
  assert.equal(matchesPlayerSearch(player, 'jd'), true)
  assert.equal(player.name, 'José D’Angelo')
})
