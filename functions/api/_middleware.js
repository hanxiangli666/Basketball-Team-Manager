import { controllerIdentity, readAuth } from '../../server/auth.js'
import { ApiError, json } from '../../server/http.js'

export async function onRequest(context) {
  try {
    const { request, env } = context
    const url = new URL(request.url)
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new ApiError(403, 'Use the secure game website.')
    if (!env.DB || !env.GAME_PASSWORD || !env.SESSION_SECRET) throw new ApiError(503, 'Game access is temporarily unavailable. Please try again.')
    if (!['GET', 'HEAD'].includes(request.method) && request.headers.get('Origin') !== url.origin) throw new ApiError(403, 'This request must come from the game website.')
    if (url.pathname !== '/api/login') {
      const auth = await readAuth(request, env)
      if (!auth) throw new ApiError(401, 'Please enter the game password.')
      context.data.controller = controllerIdentity(request, auth)
    }
    return await context.next()
  } catch (error) {
    if (!(error instanceof ApiError)) console.error('Game API failed:', error.message)
    return json({ error: error instanceof ApiError ? error.message : 'Could not connect to the shared game. Please try again.' }, error instanceof ApiError ? error.status : 503)
  }
}
