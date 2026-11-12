import assert from 'node:assert/strict'
import test from 'node:test'
import { createSharedGame, translateClockEpoch } from '../../src/game/sharedGame.js'
import { createSession, applyAction, settleSession } from '../../src/game/session.js'
import { roster } from '../../src/data/roster.js'
import { browserApi, createTestEnvironment, until } from '../support/api.js'

function client(api, deviceId, skew = 0, fetchImpl = api.fetch, extra = {}) {
  const result = { state: null, access: false, status: '', lost: 0, expired: 0 }
  result.now = () => Date.now() + skew
  result.connection = createSharedGame({ deviceId, getNow: result.now, fetchImpl, pollMs: 60000, retryMs: 10,
    onRemote: (state) => { result.state = state }, onAccess: (access) => { result.access = access }, onStatus: (status) => { result.status = status }, onLostControl: () => { result.lost++ }, onExpired: () => { result.expired++ },
    ...extra,
  })
  return result
}

test('two phones share the lineup and a running clock despite different device clock settings', async () => {
  const env = createTestEnvironment()
  let a, b
  try {
    a = client(await browserApi(env, 'test-phone-device-0001'), 'test-phone-device-0001', 120000)
    b = client(await browserApi(env, 'test-phone-device-0002'), 'test-phone-device-0002', -60000)
    const running = applyAction(createSession(roster), { type: 'clock' }, a.now())
    await a.connection.connect(running)
    await b.connection.connect(createSession(roster))
    assert.equal(a.access, true)
    assert.equal(b.access, false)
    const first = settleSession(a.state, a.now()), second = settleSession(b.state, b.now())
    assert.ok(Math.abs(first.clockMs - second.clockMs) < 100)
    assert.deepEqual(first.players.map((player) => player.isOnCourt), second.players.map((player) => player.isOnCourt))
  } finally { a?.connection.close(); b?.connection.close(); env.close() }
})

test('rapid local actions do not wait for a network reply, and the latest state is eventually shared', async () => {
  const env = createTestEnvironment()
  let a, release
  try {
    const api = await browserApi(env, 'test-phone-device-0001')
    let delayWrites = false
    const fetchImpl = async (path, options) => {
      if (options.method === 'PUT' && delayWrites) { delayWrites = false; await new Promise((resolve) => { release = resolve }) }
      return api.fetch(path, options)
    }
    a = client(api, 'test-phone-device-0001', 0, fetchImpl)
    await a.connection.connect(createSession(roster))
    delayWrites = true
    const one = applyAction(a.state, { type: 'adjust-player-time', playerId: 4, deltaSeconds: 60 })
    assert.equal(a.connection.publish(one), undefined)
    assert.equal(a.status, 'saving')
    const two = applyAction(one, { type: 'adjust-player-time', playerId: 4, deltaSeconds: 60 })
    a.connection.publish(two)
    assert.equal(two.players.find((player) => player.id === 4).stintMs, 120000)
    release()
    await until(() => a.status === 'synced')
    const saved = await (await api.call('/api/game')).json()
    assert.equal(saved.state.players.find((player) => player.id === 4).stintMs, 120000)
  } finally { release?.(); a?.connection.close(); env.close() }
})

test('an ambiguous failed reply retries safely without duplicating or losing an update', async () => {
  const env = createTestEnvironment()
  let a
  try {
    const api = await browserApi(env, 'test-phone-device-0001')
    let failReply = false
    a = client(api, 'test-phone-device-0001', 0, async (path, options) => {
      const response = await api.fetch(path, options)
      if (options.method === 'PUT' && failReply) { failReply = false; throw new Error('Reply lost after server save') }
      return response
    })
    await a.connection.connect(createSession(roster))
    failReply = true
    a.connection.publish(applyAction(a.state, { type: 'adjust-player-time', playerId: 4, deltaSeconds: 60 }))
    await until(() => a.status === 'offline')
    await until(() => a.status === 'synced')
    const saved = await (await api.call('/api/game')).json()
    assert.equal(saved.revision, 2)
    assert.equal(saved.state.players.find((player) => player.id === 4).totalMs, 60000)
  } finally { a?.connection.close(); env.close() }
})

test('taking control makes the previous phone read only and drops its offline queued writes', async () => {
  const env = createTestEnvironment()
  let a, b
  try {
    const apiA = await browserApi(env, 'test-phone-device-0001'), apiB = await browserApi(env, 'test-phone-device-0002')
    let offline = false
    a = client(apiA, 'test-phone-device-0001', 0, (path, options) => { if (offline && options.method === 'PUT') return Promise.reject(new Error('Offline')); return apiA.fetch(path, options) })
    b = client(apiB, 'test-phone-device-0002')
    await a.connection.connect(createSession(roster))
    await b.connection.connect(createSession(roster))
    offline = true
    a.connection.publish(applyAction(a.state, { type: 'adjust-player-time', playerId: 4, deltaSeconds: 60 }))
    await until(() => a.status === 'offline')
    await b.connection.takeControl()
    await a.connection.refresh()
    assert.equal(a.access, false)
    assert.equal(b.access, true)
    assert.equal(a.lost, 1)
    offline = false
    a.connection.publish(applyAction(a.state, { type: 'adjust-player-time', playerId: 4, deltaSeconds: 120 }))
    await b.connection.refresh()
    assert.equal(b.state.players.find((player) => player.id === 4).totalMs, 0)
  } finally { a?.connection.close(); b?.connection.close(); env.close() }
})

test('epoch conversion preserves saved minutes and translates both game and halftime timestamp references', () => {
  const state = { ...createSession(roster), lastTickAt: 1000, halftime: { status: 'RUNNING', remainingMs: 900000, lastTickAt: 2000 } }
  const translated = translateClockEpoch(state, 5000)
  assert.equal(translated.lastTickAt, 6000)
  assert.equal(translated.halftime.lastTickAt, 7000)
  assert.deepEqual(translated.players, state.players)
  assert.equal(state.halftime.lastTickAt, 2000)
})

test('a pending update survives reload on the controlling device and is cleared only after saving', async () => {
  const env = createTestEnvironment()
  let a, resumed, pending
  try {
    const api = await browserApi(env, 'test-phone-device-0001')
    let offline = false
    a = client(api, 'test-phone-device-0001', 0, (path, options) => offline && options.method === 'PUT' ? Promise.reject(new Error('Offline')) : api.fetch(path, options), { onPending: (state) => { pending = state }, onSynced: () => { pending = null } })
    await a.connection.connect(createSession(roster))
    offline = true
    a.connection.publish(applyAction(a.state, { type: 'adjust-player-time', playerId: 4, deltaSeconds: 60 }))
    await until(() => a.status === 'offline')
    assert.equal(pending.players.find((player) => player.id === 4).totalMs, 60000)
    a.connection.close()
    resumed = client(api, 'test-phone-device-0001', 0, api.fetch, { onSynced: () => { pending = null } })
    await resumed.connection.connect(createSession(roster), pending)
    assert.equal(resumed.state.players.find((player) => player.id === 4).totalMs, 60000)
    assert.equal(pending, null)
    assert.equal((await (await api.call('/api/game')).json()).state.players.find((player) => player.id === 4).totalMs, 60000)
  } finally { a?.connection.close(); resumed?.connection.close(); env.close() }
})

test('a slow older read cannot replace a newly acknowledged update', async () => {
  const env = createTestEnvironment()
  let a, release
  try {
    const api = await browserApi(env, 'test-phone-device-0001')
    let delayRead = false
    a = client(api, 'test-phone-device-0001', 0, async (path, options) => {
      const response = await api.fetch(path, options)
      if (delayRead && !options.method) { delayRead = false; await new Promise((resolve) => { release = resolve }) }
      return response
    })
    await a.connection.connect(createSession(roster))
    delayRead = true
    const read = a.connection.refresh()
    await until(() => Boolean(release))
    a.connection.publish(applyAction(a.state, { type: 'adjust-player-time', playerId: 4, deltaSeconds: 60 }))
    await until(() => a.status === 'synced')
    release()
    await read
    assert.equal(a.state.players.find((player) => player.id === 4).totalMs, 60000)
  } finally { release?.(); a?.connection.close(); env.close() }
})
