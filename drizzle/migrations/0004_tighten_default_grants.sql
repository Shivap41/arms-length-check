-- A fresh Supabase project grants ALL (incl. TRUNCATE) on new public tables to anon and
-- authenticated via default privileges. Reset to exactly what 0000-0003 intended. RLS stays on.
REVOKE ALL ON public.cases, public.declarations, public.proposed_reviewers, public.screenings,
  public.screening_names, public.findings, public.decisions, public.research_sessions,
  public.identity_events, public.api_cache FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cases, public.declarations, public.proposed_reviewers,
  public.screenings, public.screening_names, public.findings, public.decisions TO authenticated;
GRANT INSERT ON public.research_sessions, public.identity_events TO anon, authenticated;
-- Tables created later must opt in to grants explicitly.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
