const positions = ['PG', 'SG', 'SF', 'PF', 'C']

export function groupBenchSeats(players) {
  return positions.map((position) => ({
    position,
    players: players.filter((player) => player.pos === position)
      .sort((a, b) => Number(Boolean(b.starter)) - Number(Boolean(a.starter))),
  })).filter((group) => group.players.length)
}
