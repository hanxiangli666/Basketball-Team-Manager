export const practiceCategories = [
  { key: "charges", label: "CHG", title: "Charges" },
  { key: "sprint", label: "SPR", title: "Sprints" },
  { key: "bDrives", label: "BLD", title: "Blow-By Drives" },
  { key: "pTouch", label: "PNT", title: "Paint Touches" },
  { key: "ast", label: "AST", title: "Assists" },
  { key: "stl", label: "STL", title: "Steals" },
  { key: "defl", label: "DEF", title: "Deflections" },
  { key: "dReb", label: "DRB", title: "Defensive Rebounds" },
  { key: "oReb", label: "ORB", title: "Offensive Rebounds" },
]

export function createEmptyPracticeStats() {
  return Object.fromEntries(practiceCategories.map((category) => [category.key, 0]))
}
