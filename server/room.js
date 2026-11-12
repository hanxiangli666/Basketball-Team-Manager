import { roster } from '../src/data/roster.js'
import { restoreSession } from '../src/game/session.js'
import { ApiError, json } from './http.js'

const database = (env) => env.DB.withSession('first-primary')
export const readRoom = (env) => database(env).prepare('SELECT * FROM game_room WHERE id = 1').first()

export function roomPayload(room, controller, now = Date.now(), receivedAt = now) {
  return {
    revision: room?.revision ?? 0,
    state: room ? restoreSession(JSON.parse(room.state), roster, now) : null,
    canControl: room ? room.controller === controller : true,
    serverNow: now,
    receivedAt,
  }
}

export function validateState(raw, now) {
  if (!raw || !Array.isArray(raw.players) || raw.players.length !== roster.length || !raw.players.every((player) => player && typeof player === 'object')
    || new Set(raw.players.map((player) => player.id)).size !== roster.length
    || !roster.every((player) => raw.players.some((candidate) => candidate.id === player.id))) throw new ApiError(400, 'Invalid game data.')
  const state = { ...raw, halftime: raw.halftime ? { ...raw.halftime } : undefined }
  // Clock alignment may be a few milliseconds ahead after a short round trip.
  for (const timer of [state, state.halftime].filter(Boolean)) {
    if (timer.lastTickAt > now && timer.lastTickAt <= now + 5000) timer.lastTickAt = now
  }
  try { return restoreSession(state, roster, now) }
  catch { throw new ApiError(400, 'Invalid game data.') }
}

export async function saveRoom(env, controller, body, now = Date.now()) {
  if (!Number.isSafeInteger(body?.revision) || body.revision < 0 || !/^[\w-]{16,64}$/.test(body.writeId || '')) throw new ApiError(400, 'Invalid update.')
  const room = await readRoom(env)
  if (room?.controller === controller && room.write_id === body.writeId) return json(roomPayload(room, controller, Date.now(), now))
  if (room && (room.controller !== controller || room.revision !== body.revision)) return json({ ...roomPayload(room, controller, Date.now(), now), error: 'The shared game changed. Reloading the latest game.' }, 409)
  if (!room && body.revision !== 0) return json({ ...roomPayload(null, controller, Date.now(), now), error: 'The shared game has not been started.' }, 409)
  const state = JSON.stringify(validateState(body.state, now))
  const db = database(env)
  const result = room
    ? await db.prepare('UPDATE game_room SET state = ?, revision = revision + 1, write_id = ?, updated_at = ? WHERE id = 1 AND revision = ? AND controller = ?').bind(state, body.writeId, now, body.revision, controller).run()
    : await db.prepare('INSERT OR IGNORE INTO game_room (id, revision, state, controller, write_id, updated_at) VALUES (1, 1, ?, ?, ?, ?)').bind(state, controller, body.writeId, now).run()
  const updated = await readRoom(env)
  return json({ ...roomPayload(updated, controller, Date.now(), now), ...(result.meta.changes ? {} : { error: 'The shared game changed. Reloading the latest game.' }) }, result.meta.changes ? 200 : 409)
}

export async function takeControl(env, controller, now = Date.now()) {
  const result = await database(env).prepare('UPDATE game_room SET controller = ?, revision = revision + 1, write_id = NULL, updated_at = ? WHERE id = 1').bind(controller, now).run()
  if (!result.meta.changes) throw new ApiError(409, 'Open a shared game first.')
  return json(roomPayload(await readRoom(env), controller, Date.now(), now))
}
