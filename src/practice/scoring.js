// Practice records stay keyed by the existing player IDs and category names.
export function changePracticeStat(stats, playerId, key, delta = 1) {
  const current = stats[playerId]
  if (!current || !Object.hasOwn(current, key) || !Number.isSafeInteger(delta)) return null
  const before = current[key]
  const after = Math.max(0, before + delta)
  if (!Number.isSafeInteger(after) || before === after) return null
  return {
    stats: { ...stats, [playerId]: { ...current, [key]: after } },
    record: { playerId, key, before, after },
  }
}

export function undoPracticeStat(stats, record) {
  if (!record || stats[record.playerId]?.[record.key] !== record.after) return null
  return { ...stats, [record.playerId]: { ...stats[record.playerId], [record.key]: record.before } }
}

export function practiceLeaders(players) {
  const score = Math.max(0, ...players.map((player) => player.practiceTotal || 0))
  return { score, players: score > 0 ? players.filter((player) => player.practiceTotal === score) : [] }
}
