import { takeControl } from '../../server/room.js'

export async function onRequestPost({ env, data }) { return takeControl(env, data.controller) }
