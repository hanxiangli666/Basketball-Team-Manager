const nicknames = new Map([[2, 'Kip'], [15, 'Jeppy'], [16, 'B Manns']])

export function createPlayerDisplayNames(players) {
  const preferred = players.map((player) => ({
    id: player.id,
    label: nicknames.get(player.id) || player.name.trim().split(/\s+/)[0],
    surnameInitial: player.name.trim().split(/\s+/).slice(1)[0]?.[0] || '',
  }))
  const counts = new Map()
  for (const { label } of preferred) {
    const key = label.toLowerCase()
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return new Map(preferred.map(({ id, label, surnameInitial }) => [
    id,
    counts.get(label.toLowerCase()) > 1 && surnameInitial ? `${label} ${surnameInitial.toUpperCase()}` : label,
  ]))
}
