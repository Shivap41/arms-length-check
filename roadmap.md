# Faculty Review shell
- [x] Create the reference-matched shared header, navigation, search, footer, and contact control.
- [x] Create Home summary, Cases list, and sample case page.
- [x] Verify navigation, dropdown, and desktop layouts; run routing tests.

# External evaluations
- [x] Add the case header, steps, tabs, and reviewer entry/paste/remove controls.
- [x] Add typed in-memory screening service and validation tests.
- [x] Add candidate confirmation and screening navigation; verify the full reviewer flow.
- [x] Load the session demo list.

# Demo scenario
- [x] Add fictional candidate and reviewer profiles, paper samples, and choice-specific results.
- [x] Connect demo loading and scenario access through the screening service.
- [x] Test all correct outcomes, ambiguous identities, and demo loading in the page.

# Confirm reviewer identities
- [x] Add ordered reviewer rows, profile selection, profile merging, paste, and undo.
- [x] Add keyboard controls, live progress, and a gated results-step destination.
- [x] Test identity changes and verify the full 15-reviewer flow at desktop widths.

# Review results
- [x] Add sorted, filterable results and expandable evidence.
- [x] Add name-only match decisions and targeted identity changes.
- [x] Verify counts, evidence, and updated outcomes through the full screening flow.
# Declarations, chair decisions, audit record
- [x] Add candidate declarations and a results backlink.
- [x] Add validated chair decisions, reasons, and decided progress.
- [x] Add gated printable HTML audit download and verify the full flow.
# Research session mode
- [x] Session start page, printable reviewer notes, header badge.
- [x] Non-blocking identity event logging to the database.
- [x] Passcode-protected results with accuracy, timings, and CSV export.

## Live-feeling checks
- [x] Seeded latency setting, early checks, skeletons, progress screen, failure + retry, wait logging

# Live mode
- [x] Demo/Live data mode with a Cases toggle; session mode always uses the demo.
- [x] Live case tables with per-user access rules; sign-in (Google, Lovable) and protected live routes.
- [x] New live case form, live reviewers and paste list, declarations form, candidate confirmation.
- [ ] Full live conflict screening (future scope; this request supplies source access and connection testing only).

# Shared live data sources
- [x] Centralize OpenAlex and ORCID access with 24-hour caching, typed failures, retries, timeout, and concurrency limit.
- [x] Protect the API cache from browser writes and add an authenticated health check with a Live Cases button.
- [x] Test source rules and verify a signed-in connection check and cache hit.
