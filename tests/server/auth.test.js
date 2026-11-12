import assert from 'node:assert/strict'
import test from 'node:test'
import { sessionCookie } from '../../server/auth.js'
import { browserApi, createTestEnvironment, dispatch } from '../support/api.js'

test('game reads, writes, and takeover all require a valid server session', async () => {
  const env = createTestEnvironment()
  try {
    for (const [path, method] of [['/api/game', 'GET'], ['/api/game', 'PUT'], ['/api/control', 'POST']]) {
      const response = await dispatch(env, path, { method })
      assert.equal(response.status, 401)
      assert.equal((await response.json()).state, undefined)
    }
  } finally { env.close() }
})

test('wrong passwords stay locked and successful login uses a secure HttpOnly cookie without exposing the password', async () => {
  const env = createTestEnvironment()
  try {
    const bad = await dispatch(env, '/api/login', { method: 'POST', body: { password: '0000' } })
    assert.equal(bad.status, 401)
    assert.equal(bad.headers.get('Set-Cookie'), null)
    const good = await dispatch(env, '/api/login', { method: 'POST', body: { password: env.GAME_PASSWORD } })
    assert.equal(good.status, 200)
    const cookie = good.headers.get('Set-Cookie')
    for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict']) assert.ok(cookie.includes(flag))
    assert.equal(cookie.includes(env.GAME_PASSWORD), false)
    assert.equal((await good.text()).includes(env.SESSION_SECRET), false)
    const response = await dispatch(env, '/api/game', { cookie: cookie.split(';')[0] })
    assert.equal(response.status, 200)
    assert.equal((await response.json()).state, null)
    assert.equal(response.headers.get('Cache-Control'), 'no-store')
  } finally { env.close() }
})

test('forged and expired cookies cannot open game data', async () => {
  const env = createTestEnvironment()
  try {
    const api = await browserApi(env, 'test-phone-device-0001')
    const badCookie = `${api.cookie.slice(0, -1)}${api.cookie.endsWith('a') ? 'b' : 'a'}`
    assert.equal((await dispatch(env, '/api/game', { cookie: badCookie })).status, 401)
    const expired = await sessionCookie(new Request('https://game.test'), env, crypto.randomUUID(), Date.now() - 13 * 60 * 60 * 1000)
    assert.equal((await dispatch(env, '/api/game', { cookie: expired.split(';')[0] })).status, 401)
  } finally { env.close() }
})

test('cross-site writes and login requests are rejected, even with a valid cookie', async () => {
  const env = createTestEnvironment()
  try {
    const api = await browserApi(env, 'test-phone-device-0001')
    assert.equal((await api.call('/api/control', { method: 'POST', origin: 'https://another.test' })).status, 403)
    assert.equal((await dispatch(env, '/api/login', { method: 'POST', origin: 'https://another.test', body: { password: env.GAME_PASSWORD } })).status, 403)
  } finally { env.close() }
})

test('repeated guesses are rate limited and missing server configuration fails closed', async () => {
  const env = createTestEnvironment()
  try {
    for (let index = 0; index < 10; index++) assert.equal((await dispatch(env, '/api/login', { method: 'POST', body: { password: '0000' } })).status, 401)
    const limited = await dispatch(env, '/api/login', { method: 'POST', body: { password: env.GAME_PASSWORD } })
    assert.equal(limited.status, 429)
    assert.ok(Number(limited.headers.get('Retry-After')) > 0)
    assert.equal((await dispatch({ ...env, SESSION_SECRET: '' }, '/api/game')).status, 503)
  } finally { env.close() }
})
