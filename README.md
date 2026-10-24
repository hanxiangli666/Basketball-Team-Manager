# Drew Rangers · Courtside Desk

A browser-only game rotation tracker for Drew men's basketball. Game day opens directly, with an optional practice tab.

## Game day

- Large start/stop control, separated ±1 / ±10 second buttons, and an exact-time editor available while paused.
- A compact clock bar remains available when scrolling through the lineup or bench.
- Timestamp-based countdown with millisecond-accurate substitutions. A delayed callback does not lose playing time.
- Current stint, total minutes, player fouls and bench rest time.
- Select **Sub out**, choose a replacement, then **Confirm swap**. Both players change at the same instant. Player photos and cards never trigger substitutions.
- **Off court only** supports short-handed lineups. Starting with fewer than five requires confirmation.
- Undo recent substitutions, foul changes and clock corrections. Starting/stopping the clock, changing periods, refreshing or starting a new game clears undo history.
- Two 20-minute halves and 5-minute overtime periods. Next period preserves total minutes and fouls, and resets stints. Period changes and new games require confirmation.
- Duplicate taps within 350 ms are ignored for the same control.

Clock corrections adjust the active lineup's recorded time by the same amount. Pregame clock setup does not award playing time. When the clock reaches zero it stops automatically.

## Local data

Game state and practice stats are saved in `localStorage` on the current browser and origin. Reloading a running game catches up from its saved timestamp, capped at the end of the period. Pausing before leaving the page keeps the game paused. Clearing browser data removes the saved game. Devices and browser tabs do not share live game state; use one tab as the game desk.

There are no API requests, database requirements, admin pages, injury tracking, reports, or CSV exports. The previous Cloudflare database is not modified or migrated into local storage. Historical SQL migrations remain as a record of the previous schema; the static app does not execute them. Any separately deployed legacy roster-sync Worker must be disabled separately in Cloudflare if it is still running.

## Roster updates

Edit `src/data/roster.js` and place supplied photos in `public/Photos/`. Keep IDs stable for returning players and assign new IDs to new players. Names, jersey numbers, positions and photos come from this file, so an old saved game cannot overwrite roster updates. The current roster is retained until the new season's changes are confirmed.

## Development

Requires Node.js 22.12+ or a compatible current LTS version.

```powershell
npm ci
npm run dev
npm test
npm run build
```

The production output is `dist/`. Deploy it as a static website. The retained Cloudflare Pages project name is `drew-tracker-github`; no Functions or D1 binding is needed.

Vue 3 handles the interface, while the framework-independent JavaScript engine in `src/game/session.js` handles all game time and rotation changes locally. Vite builds the static bundle.

## Development handoff

The 18 game-engine tests pass. Components were compiled and main interactions were checked with a temporary cached Vue preview on Windows. The production Vite build remains unverified because dependency downloads were blocked in that environment. After cloning or pulling on the Mac Mini, run `npm ci`, `npm test`, and `npm run build` before deployment. The temporary preview harness is excluded from Git and is not required to run the project.
