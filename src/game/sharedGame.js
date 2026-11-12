export function translateClockEpoch(state, delta) {
  return {
    ...state,
    lastTickAt: state.lastTickAt === null ? null : state.lastTickAt + delta,
    ...(state.halftime ? { halftime: { ...state.halftime, lastTickAt: state.halftime.lastTickAt === null ? null : state.halftime.lastTickAt + delta } } : {}),
  }
}

export function createSharedGame({ deviceId, getNow, onRemote, onAccess, onStatus, onExpired, onLostControl, onPending = () => {}, onSynced = () => {}, fetchImpl = fetch, uuid = () => crypto.randomUUID(), pollMs = 1000, retryMs = 1200 }) {
  let revision = 0, offset = 0, canControl = false, stopped = false
  let queued = null, active = null, writing = false, reading = false, pollTimer, retryTimer

  async function request(path, options = {}) {
    const start = getNow()
    const response = await fetchImpl(`/api/${path}`, {
      credentials: 'same-origin', cache: 'no-store', ...options,
      headers: { 'Content-Type': 'application/json', 'X-Drew-Device': deviceId, ...options.headers },
      signal: AbortSignal.timeout(6000),
    })
    const data = await response.json()
    if (Number.isFinite(data.serverNow)) offset = ((data.receivedAt ?? data.serverNow) + data.serverNow - start - getNow()) / 2
    if (response.status === 401) {
      if (!stopped) { stopped = true; clearTimeout(pollTimer); clearTimeout(retryTimer); onExpired() }
      throw new Error('Please log in again.')
    }
    if (!response.ok && response.status !== 409) throw new Error(data.error || 'Could not connect to the shared game.')
    return { data, conflict: response.status === 409 }
  }

  function accept(data, applyState = true) {
    if (stopped || data.revision < revision) return
    revision = data.revision
    const lost = canControl && !data.canControl
    canControl = data.canControl
    if (!canControl) { queued = null; active = null }
    onAccess(canControl)
    if (data.state && (applyState || !canControl) && (!canControl || (!queued && !active))) onRemote(translateClockEpoch(data.state, -offset))
    if (lost) onLostControl()
  }

  async function read() {
    if (stopped || reading) return
    reading = true
    try {
      const { data } = await request('game')
      if (stopped) return
      accept(data, !writing && !queued && !active)
      if (!writing && !queued && !active) onStatus('synced')
      return data
    } catch (error) { if (!stopped) onStatus('offline'); throw error }
    finally { reading = false }
  }

  function poll() {
    clearTimeout(pollTimer)
    if (!stopped) pollTimer = setTimeout(async () => { try { await read() } catch {} finally { poll() } }, pollMs)
  }

  async function write() {
    if (stopped || writing || !canControl || (!active && !queued)) return
    if (!active) { active = { state: queued, writeId: uuid() }; queued = null }
    writing = true
    onStatus('saving')
    const update = active
    try {
      const { data, conflict } = await request('game', { method: 'PUT', keepalive: true, body: JSON.stringify({ revision, writeId: update.writeId, state: translateClockEpoch(update.state, offset) }) })
      if (stopped) return
      if (conflict && data.canControl) {
        accept(data, false)
        // Rebase the same controller's latest snapshot after an uncertain reply.
      } else {
        active = null
        accept(data, !queued)
      }
      if (!active && !queued) { onStatus('synced'); if (canControl) onSynced() }
    } catch {
      if (!stopped) onStatus('offline')
    } finally {
      writing = false
      clearTimeout(retryTimer)
      if (!stopped && canControl && (active || queued)) retryTimer = setTimeout(write, active ? retryMs : 0)
    }
  }

  return {
    async connect(initialState, pendingServerState = null) {
      const data = await read()
      if (!data?.state) {
        queued = initialState
        await write()
        if (active) throw new Error('Could not start the shared game. Please try again.')
      } else if (data.canControl && pendingServerState) {
        queued = translateClockEpoch(pendingServerState, -offset)
        onRemote(queued)
        await write()
      }
      poll()
    },
    publish(state) { if (!stopped && canControl) { queued = state; onPending(translateClockEpoch(state, offset)); void write() } },
    async takeControl() {
      const { data } = await request('control', { method: 'POST' })
      queued = null; active = null
      accept(data)
      onStatus('synced')
      onSynced()
    },
    refresh: read,
    close() { stopped = true; clearTimeout(pollTimer); clearTimeout(retryTimer) },
  }
}
