# Basketball Team Manager

A production-oriented operations tool for Drew men's basketball. The app helps coaches and staff manage practice stats, game rotations, injuries, roster review, and reporting from one lightweight web interface.

Deployment is currently in private testing.

## Problem

Team operations often happen across spreadsheets, manual notes, and ad-hoc game-day decisions. This project turns that workflow into a deployable web app with persistent data, admin review, scheduled roster sync, and test-covered game logic.

## What It Includes

- **Landing view:** main navigation into practice, game, injuries, and admin workflows.
- **Practice view:** player practice stats, ranking views, resets, and PDF practice report generation.
- **Game view:** on-court rotation control, game clock state, fouls, half resets, player toggles, and CSV-style operational data.
- **Injuries view:** tracks unavailable players and keeps game/practice workflows aligned.
- **Admin review:** syncs Drew roster data, reviews new players, manages positions, active status, and image paths.
- **Roster automation:** a standalone Cloudflare Worker Cron periodically syncs roster data from the source site.

## Architecture

```text
Vue 3 / Vite frontend
        |
        v
Cloudflare Pages Functions API
        |
        v
Cloudflare D1 database

Worker Cron -> roster sync service -> D1
```

## Tech Stack

- **Frontend:** Vue 3, Vite, Tailwind CSS
- **API:** Cloudflare Pages Functions
- **Database:** Cloudflare D1
- **Automation:** Cloudflare Worker Cron Trigger
- **Testing:** Node test runner for API, roster parsing, and game-state logic
- **Reporting:** text-to-PDF practice report generator

## Repository Map

```text
functions/api/[[path]].js       Cloudflare Pages Functions entrypoint
migrations/                     D1 schema and seed data
src/components/                 Practice, game, injuries, landing, admin views
src/cloudflare/api.js           API router
src/cloudflare/d1.js            D1 service layer
src/cloudflare/game-state.js    Rotation and clock business logic
src/cloudflare/roster.js        Roster fetch, parse, and diff logic
tests/cloudflare/               Node tests
workers/roster-sync.js          Scheduled roster sync worker
wrangler.toml                   Pages + D1 config
wrangler.roster-sync.toml       Worker Cron config
```

## API Surface

Representative endpoints:

- `GET /api/players`
- `GET /api/practice`
- `POST /api/practice/{player_id}`
- `POST /api/practice/report`
- `GET /api/game`
- `POST /api/game/main-action`
- `POST /api/game/players/{player_id}/toggle`
- `GET /api/injuries`
- `GET /api/admin/roster-review`

Admin endpoints require an `x-admin-token` header.

## Run Locally

```powershell
npm install
npm run dev
```

Run tests:

```powershell
npm test
```

Build:

```powershell
npm run build
```

## Deployment Notes

The production Cloudflare Pages project is `drew-tracker-github`.

Before deploying, verify Cloudflare auth and D1 bindings. Do not commit `.dev.vars` or real admin tokens.

## What This Project Demonstrates

- Turning a real sports workflow into a full-stack product.
- Designing a serverless API with Cloudflare Pages Functions and D1.
- Keeping game-state business logic testable outside the UI.
- Adding operational automation through Worker Cron.
- Writing documentation that maps product flows to implementation evidence.
