CREATE TABLE public.research_sessions (
  id uuid PRIMARY KEY,
  participant_code text NOT NULL CHECK (participant_code ~ '^[A-Za-z0-9-]{1,12}$'),
  facilitator text NOT NULL CHECK (char_length(facilitator) BETWEEN 1 AND 80),
  consented boolean NOT NULL CHECK (consented),
  started_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.research_sessions TO anon, authenticated;
GRANT ALL ON public.research_sessions TO service_role;
ALTER TABLE public.research_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can start a consented research session" ON public.research_sessions FOR INSERT TO anon, authenticated WITH CHECK (consented);

CREATE TABLE public.identity_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.research_sessions(id) ON DELETE CASCADE,
  participant_code text NOT NULL CHECK (char_length(participant_code) <= 12),
  reviewer_id text CHECK (char_length(reviewer_id) <= 20),
  event text NOT NULL CHECK (event IN ('row_opened','card_picked','second_profile_added','orcid_pasted','cant_tell','undo','changed_later','screening_started','session_finished')),
  option_position integer CHECK (option_position BETWEEN 1 AND 3),
  profile_id text CHECK (char_length(profile_id) <= 40),
  selection text CHECK (char_length(selection) <= 80),
  ms_since_row_opened integer CHECK (ms_since_row_opened >= 0),
  ms_since_session_start integer CHECK (ms_since_session_start >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX identity_events_session_idx ON public.identity_events (session_id, id);
GRANT INSERT ON public.identity_events TO anon, authenticated;
GRANT ALL ON public.identity_events TO service_role;
ALTER TABLE public.identity_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can log research events" ON public.identity_events FOR INSERT TO anon, authenticated WITH CHECK (true);