# Empire RPG

A web app implementation of chapter 1 of AEG's *Empire* — the realm-management
supplement for D&D 3rd edition. Create a realm, manage resources and population
through the seasons, and rule like the tabletop version.

See [`rules-digest.md`](./rules-digest.md) for the condensed ruleset this app
implements (with OCR-verified values from the physical book and a few clearly-
marked homebrew additions).

## Tech stack

- **Frontend:** Vite + React 19 + TypeScript + Tailwind CSS 4
- **Routing:** React Router 7
- **Server state:** TanStack Query 5
- **Backend / database / auth:** Supabase (Postgres + Auth + Row-Level Security)
- **Tests:** Vitest + Testing Library

## Getting started

### Prerequisites
- Node.js 20+ (the project was scaffolded against Node 22)
- An `.env.local` file with Supabase credentials (already present — see `.env.example`)

### First-time setup

```bash
npm install        # ~1-3 minutes the first time
npm run dev        # starts the Vite dev server on http://localhost:5173
```

If `node_modules` looks broken (e.g. a partial install), delete it and re-run:

```bash
rm -rf node_modules package-lock.json
npm install
```

### Running tests

```bash
npm test           # interactive watch mode
npm run test:run   # one-shot, for CI
```

### Type-checking and lint

```bash
npm run typecheck
npm run lint
```

## Project structure

```
.
├── Empire-ocr.pdf          # source rulebook (reference only)
├── rules-digest.md         # condensed rules we're implementing
├── src/
│   ├── lib/                # cross-cutting infra (Supabase client, Query client)
│   ├── rules/              # pure-TS rules engine (Phase 2 onward)
│   ├── types/              # generated DB types + domain types
│   ├── components/         # reusable UI components
│   ├── pages/              # route components
│   ├── hooks/              # React hooks (auth, realm queries, etc.)
│   └── test/               # Vitest setup
└── public/                 # static assets
```

## Build phases

This project is built in phases. Where we are:

- **Phase 0 — Rules digest.** Done. See `rules-digest.md`.
- **Phase 1 — Scaffolding + auth.** Done. Vite + React + TS + Tailwind set up,
  Supabase project provisioned with initial schema (profiles, realms, areas,
  populations, strongholds, turn_history) and Row-Level Security, sign-in /
  sign-up / sign-out flow wired up.
- **Phase 2 — MVP slice.** Next. Create realm + dashboard + auto-resolved
  4-season turn loop.
- **Phase 3 — Expansion.** Random events & loyalty, then construction projects,
  then military, ministers, trade goods, diplomacy, polish.

## Deployment

The frontend is meant to deploy to Vercel (or Netlify). Set the same env vars
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) in the deploy host's
project settings. The Supabase project hosts itself.

## Homebrew rules

A few additions on top of the official chapter-1 rules — see `rules-digest.md`
for full details:
- **Citadel** (tier-3 military stronghold)
- **Stronghold stacking** (multiple settlements/fortifications per area, with
  per-scale slot caps)
- **Random Beneficial Find** (50/50 random selection between the two outcomes)

Database entities tag their `source` as `'official'` or `'homebrew'` so future
house rules slot in cleanly.
