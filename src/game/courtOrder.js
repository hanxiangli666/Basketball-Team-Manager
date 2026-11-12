const positions = ['PG', 'SG', 'SF', 'PF', 'C']

export function orderCourtPlayers(players, order, isSetup) {
  const rank = (id) => order.indexOf(id) < 0 ? order.length : order.indexOf(id)
  return players.filter((player) => player.isOnCourt).sort((a, b) => {
    const difference = isSetup
      ? (positions.indexOf(a.pos) < 0 ? positions.length : positions.indexOf(a.pos)) - (positions.indexOf(b.pos) < 0 ? positions.length : positions.indexOf(b.pos))
      : b.stintMs - a.stintMs
    return difference || rank(a.id) - rank(b.id)
  })
}
