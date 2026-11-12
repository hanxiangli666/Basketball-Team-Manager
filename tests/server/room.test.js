import assert from 'node:assert/strict'
import test from 'node:test'
import { createSession, applyAction } from '../../src/game/session.js'
import { roster } from '../../src/data/roster.js'
import { browserApi, createTestEnvironment } from '../support/api.js'

const initial = () => ({ revision: 0, writeId: 'initial-game-write-0001', state: createSession(roster) })

test('the first phone shares its saved game; a second phone can read but cannot change it', async () => {
  const env = createTestEnvironment()
  try {
    const a = await browserApi(env, 'test-phone-device-0001'), b = await browserApi(env, 'test-phone-device-0002')
    const body = initial()
    body.state = applyAction(body.state, { type: 'adjust-player-time', playerId: 4, deltaSeconds: 120 })
    const saved = await a.call('/api/game', { method: 'PUT', body })
    assert.equal(saved.status, 200)
    const viewed = await (await b.call('/api/game')).json()
    assert.equal(viewed.canControl, false)
    assert.equal(viewed.state.players.find((player) => player.id === 4).totalMs, 120000)
    const blocked = await b.call('/api/game', { method: 'PUT', body: { ...initial(), revision: 1, writeId: 'viewer-write-attempt-1' } })
    assert.equal(blocked.status, 409)
    assert.equal((await (await a.call('/api/game')).json()).state.players.find((player) => player.id === 4).totalMs, 120000)
  } finally { env.close() }
})

test('takeover is atomic, preserves game data, and rejects the former controller’s queued writes', async () => {
  const env = createTestEnvironment()
  try {
    const a = await browserApi(env, 'test-phone-device-0001'), b = await browserApi(env, 'test-phone-device-0002')
    const shared = await (await a.call('/api/game', { method: 'PUT', body: initial() })).json()
    const taken = await (await b.call('/api/control', { method: 'POST' })).json()
    assert.equal(taken.canControl, true)
    assert.equal(taken.revision, shared.revision + 1)
    assert.deepEqual(taken.state, shared.state)
    const stale = await a.call('/api/game', { method: 'PUT', body: { ...initial(), revision: shared.revision, writeId: 'stale-controller-write' } })
    assert.equal(stale.status, 409)
    assert.equal((await stale.json()).canControl, false)
    assert.equal((await (await a.call('/api/game')).json()).canControl, false)
  } finally { env.close() }
})

test('retried writes are idempotent, and simultaneous updates cannot silently overwrite a newer revision', async () => {
  const env = createTestEnvironment()
  try {
    const api = await browserApi(env, 'test-phone-device-0001')
    assert.equal((await (await api.call('/api/game', { method: 'PUT', body: initial() })).json()).revision, 1)
    assert.equal((await (await api.call('/api/game', { method: 'PUT', body: initial() })).json()).revision, 1)
    const bodies = ['simultaneous-write-001', 'simultaneous-write-002'].map((writeId) => ({ ...initial(), revision: 1, writeId }))
    const results = await Promise.all(bodies.map((body) => api.call('/api/game', { method: 'PUT', body })))
    assert.deepEqual(results.map((response) => response.status).sort(), [200, 409])
    assert.equal((await (await api.call('/api/game')).json()).revision, 2)
  } finally { env.close() }
})

test('malformed snapshots cannot replace a valid shared game', async () => {
  const env = createTestEnvironment()
  try {
    const api = await browserApi(env, 'test-phone-device-0001')
    await api.call('/api/game', { method: 'PUT', body: initial() })
    const bad = initial()
    bad.revision = 1
    bad.writeId = 'malformed-game-write-1'
    bad.state.players.pop()
    assert.equal((await api.call('/api/game', { method: 'PUT', body: bad })).status, 400)
    assert.equal((await (await api.call('/api/game')).json()).state.players.length, 20)
  } finally { env.close() }
})
