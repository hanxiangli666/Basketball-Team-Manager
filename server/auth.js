import { ApiError } from './http.js'

const encoder = new TextEncoder()
const COOKIE = 'drew_game'
const MAX_AGE = 12 * 60 * 60
const base64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
const keyFor = (secret) => crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])

export async function signText(secret, text) {
  return base64url(await crypto.subtle.sign('HMAC', await keyFor(secret), encoder.encode(text)))
}

export async function readAuth(request, env, now = Date.now()) {
  const token = request.headers.get('Cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1)
  if (!token || token.length > 256) return null
  const [sid, expiration, signature, extra] = token.split('.')
  if (extra || !/^[a-f0-9-]{36}$/.test(sid || '') || !/^\d+$/.test(expiration || '') || Number(expiration) <= now || !/^[\w-]{43}$/.test(signature || '')) return null
  const signatureBytes = Uint8Array.from(atob(signature.replaceAll('-', '+').replaceAll('_', '/') + '='), (char) => char.charCodeAt(0))
  const valid = await crypto.subtle.verify('HMAC', await keyFor(env.SESSION_SECRET), signatureBytes, encoder.encode(`${sid}.${expiration}`))
  return valid ? { sid } : null
}

export async function sessionCookie(request, env, sid, now = Date.now()) {
  const payload = `${sid}.${now + MAX_AGE * 1000}`
  const signature = await signText(env.SESSION_SECRET, payload)
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''
  return `${COOKIE}=${payload}.${signature}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${MAX_AGE}${secure}`
}

export async function checkPassword(actual, expected) {
  if (typeof actual !== 'string' || actual.length > 64) return false
  const [a, b] = await Promise.all([actual, expected].map((value) => crypto.subtle.digest('SHA-256', encoder.encode(value))))
  const aa = new Uint8Array(a), bb = new Uint8Array(b)
  let mismatch = 0
  for (let index = 0; index < aa.length; index++) mismatch |= aa[index] ^ bb[index]
  return mismatch === 0
}

export function controllerIdentity(request, auth) {
  const device = request.headers.get('X-Drew-Device')
  if (!/^[\w-]{16,64}$/.test(device || '')) throw new ApiError(400, 'A device identifier is required.')
  return `${auth.sid}:${device}`
}
