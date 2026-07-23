# TraderMind

ابزار حرفه‌ای برای ثبت معاملات، تحلیل استراتژی، و ژورنال روزانه معامله‌گر — a fully offline-first trading journal and analytics platform.

## Run & Operate

- `pnpm --filter @workspace/tradermind run dev` — run the frontend (port 23583, served at `/`)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000, served at `/api`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite + Tailwind CSS v4
- Local DB: Dexie (IndexedDB) — no backend required
- State: Zustand
- Routing: Wouter
- UI: shadcn/ui + Radix UI
- Drag & Drop: @dnd-kit
- Charts: Recharts
- API: Express 5 (currently health check only)
- Validation: Zod, drizzle-zod

## Where things live

- `artifacts/tradermind/src/db/database.ts` — all Dexie table definitions (source of truth for data model)
- `artifacts/tradermind/src/pages/` — all app pages
- `artifacts/tradermind/src/services/` — data access logic
- `artifacts/tradermind/src/components/` — shared components (Layout, Sidebar, …)
- `artifacts/tradermind/src/security/` — security service (PIN/password lock)
- `artifacts/tradermind/src/store/` — Zustand stores
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contracts)

## Architecture decisions

- All data stored offline-first in IndexedDB (Dexie) — no backend dependency
- PWA-ready with installability (vite-plugin-pwa)
- Export/import support (JSZip)
- PIN-based security lock (Security service)
- Lazy-loaded pages for faster initial load

## Product

- Dashboard and trade statistics
- Strategy builder with drag & drop
- Trade journal (daily entries)
- Multi-timeframe analysis
- Trader profile
- Knowledge Base
- Edge Analytics reports
- Live Trade tracker
- Backup and restore

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Restoration process: files live in `artifacts/tradermind/`, packages installed via pnpm workspace
- Frontend is fully offline-first (IndexedDB/Dexie) — no database connection needed to run

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
