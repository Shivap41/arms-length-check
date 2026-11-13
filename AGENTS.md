<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Application structure
- Keep the frontend-only prototype shell in a shared component mounted around the root Outlet so navigation stays consistent across pages.
- Use a cases layout with an Outlet and separate index/detail leaves so both list and dynamic case URLs render correctly.
- Keep all visual tokens and shell styles in src/styles.css and use design-system controls for actions so the reference styling stays consistent.
- Keep case and screening data behind typed src/data/screeningService.ts functions with browser-only in-memory mutations and shared Zod validation; components must not import data directly.
- Mount session-backed case content after hydration and use an unnested screening leaf so the full case page does not swallow the screening destination.
- Keep fictional scenario fixtures in demoScenario.ts and expose cloned profiles and choice-driven outcomes only through screeningService.ts; loading replaces the demo roster and never performs identifier lookups.
- Keep identity-step views free of conflict outcomes, derive progress from actual choices, and route every choice/undo through confirmIdentity; finalize the same screening snapshot only after all rows are handled.
- Derive results counts, sorting, reasons, and evidence from the current screening snapshot through service helpers; name-only paper decisions update only that evidence match, while identity changes reset its outcome.

- Record chair decisions and audit snapshots through screeningService in browser memory; invalidate decisions when identity or evidence changes so exports never contain stale approvals.
- Generate audit downloads as escaped standalone HTML from the service snapshot, keeping exports usable offline without server dependencies.
- Research-session logging writes anonymous, insert-only rows from the browser through a background queue in src/lib/research-session.ts so it never blocks the UI; results are read only by a passcode-checked server function and computed by pure helpers in src/lib/session-metrics.ts.
- Simulated check latency, stages, profile-search waits and failures live only in screeningService.ts (runCheck/searchProfiles); components subscribe via subscribeChecks so a real backend can replace the timing without UI changes.
- Live mode lives alongside the demo: screeningService.ts owns DATA_MODE (research sessions force demo) and all live-table access through its live functions; live pages sit under the _authenticated gate because RLS scopes every live table to the signed-in user's own cases.
- All OpenAlex/ORCID HTTP calls live exclusively in src/lib/sources.server.ts, dynamically imported inside server handlers with injected credentials and a server-managed cache; this keeps API keys and upstream requests out of browser code.
- Create one sources client per screening and reuse its screeningId across tasks; the shared four-slot limiter prevents parallel reviewer checks from exceeding the source concurrency limit within a worker.
- New app-internal endpoints use authenticated TanStack server functions, not new Edge Functions; this matches the deployed runtime and protects paid source calls and cache writes.
