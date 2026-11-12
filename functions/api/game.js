import { json, readJson } from '../../server/http.js'
import { readRoom, roomPayload, saveRoom } from '../../server/room.js'

export async function onRequestGet({ env, data }) {
  const receivedAt = Date.now()
  return json(roomPayload(await readRoom(env), data.controller, Date.now(), receivedAt))
}
export async function onRequestPut({ request, env, data }) { return saveRoom(env, data.controller, await readJson(request)) }
