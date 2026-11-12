import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { onRequest as middleware } from '../../functions/api/_middleware.js'
import { onRequestPost as login } from '../../functions/api/login.js'
import { onRequestGet as getGame, onRequestPut as putGame } from '../../functions/api/game.js'
import { onRequestPost as control } from '../../functions/api/control.js'

export function createTestEnvironment() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(readFileSync(new URL('../../migrations/0001_shared_game.sql', import.meta.url), 'utf8'))
  const wrap = (sql, args = []) => ({
    bind: (...values) => wrap(sql, values),
    async first() { return sqlite.prepare(sql).get(...args) ?? null },
    async run() { const result = sqlite.prepare(sql).run(...args); return { meta: { changes: result.changes } } },
  })
  const DB = { prepare: (sql) => wrap(sql), withSession() { return this } }
  return { DB, GAME_PASSWORD: '2468', SESSION_SECRET: 'a-test-only-signing-key-with-more-than-32-characters', close: () => sqlite.close() }
}

export function dispatch(env, path, { method = 'GET', cookie, device = 'test-phone-device-0001', body, origin = 'https://game.test', headers = {} } = {}) {
  const request = new Request(`https://game.test${path}`, { method, headers: { 'Content-Type': 'application/json', 'X-Drew-Device': device, ...(cookie ? { Cookie: cookie } : {}), ...(origin ? { Origin: origin } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
  const data = {}
  const handlers = { 'POST /api/login': login, 'GET /api/game': getGame, 'PUT /api/game': putGame, 'POST /api/control': control }
  return middleware({ request, env, data, next: () => handlers[`${method} ${path}`]?.({ request, env, data }) || new Response('', { status: 405 }) })
}

export async function browserApi(env, device) {
  const loggedIn = await dispatch(env, '/api/login', { method: 'POST', device, body: { password: env.GAME_PASSWORD } })
  const cookie = loggedIn.headers.get('Set-Cookie').split(';')[0]
  return {
    cookie,
    call: (path, options = {}) => dispatch(env, path, { ...options, device, cookie }),
    fetch: (path, options = {}) => dispatch(env, path, { method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : undefined, device, cookie }),
  }
}

export async function until(predicate, timeout = 1500) {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeout) throw new Error('The expected sync did not finish.')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}
