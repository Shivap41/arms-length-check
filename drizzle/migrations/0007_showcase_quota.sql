-- D59 public showcase: global daily cap on fresh OpenAlex calls and a per-visitor rate limit.
-- Server-only (service role). No case data. Visitors are stored as salted hashes, never raw IPs.
CREATE TABLE public.showcase_daily_usage (
  day date PRIMARY KEY,
  fresh_calls integer NOT NULL DEFAULT 0
);
CREATE TABLE public.showcase_visitor_usage (
  visitor text PRIMARY KEY CHECK (char_length(visitor) = 64),
  window_start timestamptz NOT NULL DEFAULT now(),
  hits integer NOT NULL DEFAULT 0
);
ALTER TABLE public.showcase_daily_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.showcase_visitor_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.showcase_daily_usage, public.showcase_visitor_usage FROM anon, authenticated;
GRANT ALL ON public.showcase_daily_usage, public.showcase_visitor_usage TO service_role;

-- Take one fresh call from today's (UTC) budget; false when the cap is reached.
CREATE FUNCTION public.showcase_take_fresh_call(p_limit integer) RETURNS boolean
LANGUAGE sql SET search_path = public AS $$
  WITH upsert AS (
    INSERT INTO public.showcase_daily_usage AS u (day, fresh_calls) VALUES ((now() AT TIME ZONE 'utc')::date, 1)
    ON CONFLICT (day) DO UPDATE SET fresh_calls = u.fresh_calls + 1 WHERE u.fresh_calls < p_limit
    RETURNING 1
  ) SELECT EXISTS (SELECT 1 FROM upsert);
$$;
-- Count one request for a visitor in a rolling window; false when over the limit.
CREATE FUNCTION public.showcase_visitor_hit(p_visitor text, p_limit integer, p_window_seconds integer) RETURNS boolean
LANGUAGE sql SET search_path = public AS $$
  WITH upsert AS (
    INSERT INTO public.showcase_visitor_usage AS v (visitor, window_start, hits) VALUES (p_visitor, now(), 1)
    ON CONFLICT (visitor) DO UPDATE SET
      window_start = CASE WHEN v.window_start < now() - make_interval(secs => p_window_seconds) THEN now() ELSE v.window_start END,
      hits = CASE WHEN v.window_start < now() - make_interval(secs => p_window_seconds) THEN 1 ELSE v.hits + 1 END
    RETURNING hits
  ) SELECT (SELECT hits FROM upsert) <= p_limit;
$$;
REVOKE ALL ON FUNCTION public.showcase_take_fresh_call(integer), public.showcase_visitor_hit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.showcase_take_fresh_call(integer), public.showcase_visitor_hit(text, integer, integer) TO service_role;
