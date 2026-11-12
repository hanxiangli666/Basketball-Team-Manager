export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

export function json(value, status = 200, extraHeaders = {}) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extraHeaders } })
}

export async function readJson(request, limit = 32768) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new ApiError(415, 'Use JSON for this request.')
  const reader = request.body?.getReader()
  if (!reader) throw new ApiError(400, 'A request body is required.')
  const chunks = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) { await reader.cancel(); throw new ApiError(413, 'The request is too large.') }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  try { return JSON.parse(new TextDecoder().decode(bytes)) }
  catch { throw new ApiError(400, 'Invalid request.') }
}
