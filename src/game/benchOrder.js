// Keep every unaffected bench seat in place; the outgoing player takes the incoming player's seat.
export function reconcileBenchOrder(previousOrder, players) {
  const available = players.filter((player) => !player.isOnCourt).map((player) => player.id)
  const remaining = new Set(available)
  const seats = (Array.isArray(previousOrder) ? previousOrder : []).map((id) => remaining.delete(id) ? id : null)
  const arrivals = available.filter((id) => remaining.has(id))
  let nextArrival = 0
  for (let index = 0; index < seats.length && nextArrival < arrivals.length; index++) {
    if (seats[index] === null) seats[index] = arrivals[nextArrival++]
  }
  return [...seats.filter((id) => id !== null), ...arrivals.slice(nextArrival)]
}
