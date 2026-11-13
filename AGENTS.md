# Arm's Length Check: notes for coding agents

Arm's Length Check screens proposed external reviewers in a tenure case for conflicts of interest
using public data (OpenAlex, ORCID). The tool flags; the chair decides.

## Architecture (decision D56)

- **App:** TanStack Start (React 19, Vite, Tailwind), built for Cloudflare Workers by
  `@lovable.dev/vite-tanstack-config`. It runs locally with `npm run dev`.
- **Server code is TanStack server functions** (`createServerFn` in `src/lib/*.functions.ts`),
  not Supabase edge functions. Protect them with `requireSupabaseAuth`. Load server-only modules
  inside handlers with `await import(...)`, because `*.functions.ts` files also ship to the client.
  Server-only modules end in `.server.ts`.
- **Database and auth:** the PM's own Supabase project (`supabase/config.toml`), with email +
  password sign-in. Migrations are plain SQL in `drizzle/migrations/` (`drizzle.config.ts` reads
  `DATABASE_URL`); add the next numbered file and a `_journal.json` entry. Every table has
  row-level security, and grants are explicit: new tables get no default grants (migration 0004).
- **Secrets:** only in `.env.local`, which is never committed (`.env*` is ignored; see
  `.env.example`). `OPENALEX_API_KEY`, `RESEARCH_PASSCODE` and `SUPABASE_SERVICE_ROLE_KEY` are
  server-only. Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` may reach the browser.
  After a build, check that no secret value appears in `.output/public`.
- **Git:** work on the `claude-code` branch. `main` is the Lovable snapshot (tag
  `lovable-snapshot`). Lovable is no longer used.

## Non-negotiable rules

- No check runs on an unconfirmed identity. The candidate is confirmed before any reviewer.
- Nothing without an ORCID is confirmed automatically (v1). A valid ORCID (ISO 7064 check digit)
  confirms; everything else goes to the chair (pick a card, paste, or Can't tell).
- An API error is never shown as "No conflict found", "Insufficient data" or "no matches". Show
  "Couldn't check" / "Couldn't search: try again" with Retry.
- The OpenAlex key never reaches the browser. All OpenAlex and ORCID HTTP calls live in
  `src/lib/sources.server.ts`, with the 24-hour `api_cache`, retries, a 10 s timeout and at most
  4 calls in flight per screening.
- Components get data only through `src/data/screeningService.ts`.
- Rules (B4) are pure functions with no network calls; their numbers live in one config file.

## Application structure

- Keep the frontend-only prototype shell in a shared component mounted around the root Outlet so navigation stays consistent across pages.
- Use a cases layout with an Outlet and separate index/detail leaves so both list and dynamic case URLs render correctly.
- Keep all visual tokens and shell styles in src/styles.css and use design-system controls for actions so the reference styling stays consistent.
- Keep case and screening data behind typed src/data/screeningService.ts functions with shared Zod validation; components must not import data directly. Demo data stays in browser memory.
- Mount session-backed case content after hydration and use an unnested screening leaf so the full case page does not swallow the screening destination.
- Keep fictional scenario fixtures in demoScenario.ts and expose cloned profiles and choice-driven outcomes only through screeningService.ts; loading replaces the demo roster and never performs identifier lookups.
- Keep identity-step views free of conflict outcomes, derive progress from actual choices, and route every demo choice/undo through confirmIdentity; finalize the same screening snapshot only after all rows are handled.
- Derive results counts, sorting, reasons, and evidence from the current screening snapshot through service helpers; name-only paper decisions update only that evidence match, while identity changes reset its outcome.
- Record chair decisions and audit snapshots through screeningService in browser memory; invalidate decisions when identity or evidence changes so exports never contain stale approvals.
- Generate audit downloads as escaped standalone HTML from the service snapshot, keeping exports usable offline without server dependencies.
- Research-session logging writes anonymous, insert-only rows from the browser through a background queue in src/lib/research-session.ts so it never blocks the UI; results are read only by a passcode-checked server function and computed by pure helpers in src/lib/session-metrics.ts.
- Simulated check latency, stages, profile-search waits and failures live only in screeningService.ts (runCheck/searchProfiles); components subscribe via subscribeChecks so a real backend can replace the timing without UI changes.
- Live mode lives alongside the demo: screeningService.ts owns DATA_MODE (research sessions force demo) and all live-table access through its live functions; live pages sit under the _authenticated gate because RLS scopes every live table to the signed-in user's own cases.
- Create one sources client per screening (`serverSources` in src/lib/server-sources.server.ts) and reuse its screeningId across tasks; the shared four-slot limiter prevents parallel reviewer checks from exceeding the source concurrency limit within a worker.
- Live identity (B3): pure helpers in src/lib/identity.ts (check digit, link parsing, 0.5/0.4/0.1 scoring, profile summaries), the server step in src/lib/identify.server.ts behind the `identifyPerson` / `resolveProfileLink` server functions, and the UI in src/components/live-identity.tsx. Choices are saved to `cases` (candidate) and `screening_names` (reviewers).

## Checks before committing

`npx tsc --noEmit`, `npm test`, `npm run build`, then scan `.output/public` for secret values.
