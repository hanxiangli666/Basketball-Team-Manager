import { checkPassword, readAuth, sessionCookie, signText } from '../../server/auth.js'
import { json, readJson } from '../../server/http.js'

export async function onRequestPost({ request, env }) {
  const now = Date.now()
  const identity = await signText(env.SESSION_SECRET, `login:${request.headers.get('CF-Connecting-IP') || 'local'}`)
  const attempts = await env.DB.prepare('INSERT INTO login_attempts (identity, attempts, expires_at) VALUES (?, 1, ?) ON CONFLICT(identity) DO UPDATE SET attempts = CASE WHEN expires_at <= ? THEN 1 ELSE attempts + 1 END, expires_at = CASE WHEN expires_at <= ? THEN ? ELSE expires_at END RETURNING attempts, expires_at').bind(identity, now + 600000, now, now, now + 600000).first()
  if (attempts.attempts > 10) return json({ error: 'Too many attempts. Please wait a few minutes.' }, 429, { 'Retry-After': String(Math.ceil((attempts.expires_at - now) / 1000)) })
  const body = await readJson(request, 1024)
  if (!(await checkPassword(body.password, env.GAME_PASSWORD))) return json({ error: 'Incorrect password.' }, 401)
  await env.DB.prepare('DELETE FROM login_attempts WHERE identity = ?').bind(identity).run()
  const auth = await readAuth(request, env, now)
  const cookie = await sessionCookie(request, env, auth?.sid || crypto.randomUUID(), now)
  return json({ ok: true }, 200, { 'Set-Cookie': cookie })
}
