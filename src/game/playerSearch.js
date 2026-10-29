const aliases = { 2: ['Kip'], 12: ['Mark'], 15: ['Jeppy'], 17: ['KevCot'] }
const normalize = (value) => String(value).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export function matchesPlayerSearch(player, query) {
  const search = normalize(query)
  if (!search) return true
  const compact = search.replaceAll(' ', '')
  const terms = search.split(/\s+/)
  return [player.name, ...(aliases[player.id] || [])].some((name) => {
    const words = normalize(name).split(/\s+/)
    const initials = words.map((word) => word[0]).join('')
    let lastWord = -1
    const orderedPrefixes = terms.every((term) => {
      const index = words.findIndex((word, i) => i > lastWord && word.startsWith(term))
      if (index < 0) return false
      lastWord = index
      return true
    })
    return words.join('').includes(compact) || initials.startsWith(compact)
      || (words.length > 2 && initials.slice(1).startsWith(compact))
      || orderedPrefixes
  })
}
