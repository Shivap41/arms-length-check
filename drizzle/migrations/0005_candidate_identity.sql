-- B3: the candidate goes through the same identity step as reviewers.
ALTER TABLE public.cases
  ADD COLUMN candidate_identity_status text NOT NULL DEFAULT 'needs_chair' CHECK (candidate_identity_status IN ('needs_chair','confirmed','cant_tell')),
  ADD COLUMN candidate_identity_method text CHECK (candidate_identity_method IN ('orcid','chair_pick','chair_paste')),
  ADD COLUMN candidate_confirmed_at timestamptz,
  ADD COLUMN candidate_identity_reason text;
-- One identity row per reviewer per screening.
ALTER TABLE public.screening_names ADD CONSTRAINT screening_names_screening_reviewer_key UNIQUE (screening_id, reviewer_id);
