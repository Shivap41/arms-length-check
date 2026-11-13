-- B4: when a check started/finished, and notes (timing, API calls fresh vs cached, name-scan coverage).
ALTER TABLE public.screening_names
  ADD COLUMN check_started_at timestamptz,
  ADD COLUMN check_finished_at timestamptz,
  ADD COLUMN check_notes jsonb NOT NULL DEFAULT '{}';
