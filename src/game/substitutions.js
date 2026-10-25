// A ready player remains on the bench until a matching substitution is recorded.
export const createSubstitutionPlan = () => ({ readyIds: [], activeId: null, outgoingId: null })

export function reconcilePlan(plan, players) {
  const readyIds = [...new Set(plan.readyIds)].filter((id) => players.some((player) => player.id === id && !player.isOnCourt)).slice(0, 5)
  return {
    readyIds,
    activeId: readyIds.includes(plan.activeId) ? plan.activeId : readyIds[0] ?? null,
    outgoingId: players.some((player) => player.id === plan.outgoingId && player.isOnCourt) ? plan.outgoingId : null,
  }
}

export function activateReady(plan, playerId) {
  return plan.readyIds.includes(playerId) ? { ...plan, activeId: playerId } : plan
}

export function chooseIncoming(plan, playerId, players) {
  const next = reconcilePlan(plan, players)
  if (!players.some((player) => player.id === playerId && !player.isOnCourt)) return { plan: next }
  if (next.outgoingId !== null) return { plan: next, action: { type: 'swap', outId: next.outgoingId, playerId } }
  if (players.filter((player) => player.isOnCourt).length < 5) return { plan: next, action: { type: 'toggle', playerId } }
  const readyIds = next.readyIds.includes(playerId)
    ? next.readyIds.filter((id) => id !== playerId)
    : next.readyIds.length < 5 ? [...next.readyIds, playerId] : next.readyIds
  return { plan: reconcilePlan({ ...next, readyIds }, players) }
}

export function chooseOutgoing(plan, playerId, players) {
  const next = reconcilePlan(plan, players)
  if (!players.some((player) => player.id === playerId && player.isOnCourt)) return { plan: next }
  if (next.activeId !== null) return { plan: next, action: { type: 'swap', outId: playerId, playerId: next.activeId } }
  return { plan: { ...next, outgoingId: playerId } }
}

export function completeSubstitution(plan, incomingId) {
  const readyIds = plan.readyIds.filter((id) => id !== incomingId)
  return { readyIds, activeId: readyIds.includes(plan.activeId) ? plan.activeId : readyIds[0] ?? null, outgoingId: null }
}

// Keep the four unchanged cards in place as a substitute enters the fifth slot.
export function reconcileCourtOrder(order, players) {
  const ids = players.filter((player) => player.isOnCourt).map((player) => player.id)
  const added = ids.filter((id) => !order.includes(id))
  const next = order.flatMap((id) => ids.includes(id) ? [id] : added.length ? [added.shift()] : [])
  return [...next, ...added]
}
