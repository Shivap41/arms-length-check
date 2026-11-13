REVOKE ALL ON public.api_cache FROM anon, authenticated;
DROP POLICY IF EXISTS "Signed-in users share the API cache" ON public.api_cache;
GRANT ALL ON public.api_cache TO service_role;
COMMENT ON TABLE public.api_cache IS 'Server-managed 24-hour OpenAlex/ORCID response cache. Keys never contain API credentials.';