CREATE TABLE public.cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  candidate_name text NOT NULL,
  candidate_institution text NOT NULL,
  candidate_orcid text,
  candidate_profile_ids text[] NOT NULL DEFAULT '{}',
  candidate_confirmed_by text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cases TO authenticated;
GRANT ALL ON public.cases TO service_role;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own cases" ON public.cases FOR ALL TO authenticated USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

CREATE TABLE public.declarations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  declared_name text NOT NULL,
  relationship text NOT NULL CHECK (relationship IN ('advisor','mentor','student','co_supervisor','personal','financial')),
  note text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.declarations TO authenticated;
GRANT ALL ON public.declarations TO service_role;
ALTER TABLE public.declarations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage declarations on their own cases" ON public.declarations FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.created_by = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.created_by = auth.uid()));

CREATE TABLE public.proposed_reviewers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  typed_name text NOT NULL,
  typed_institution text NOT NULL,
  typed_orcid text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposed_reviewers TO authenticated;
GRANT ALL ON public.proposed_reviewers TO service_role;
ALTER TABLE public.proposed_reviewers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage reviewers on their own cases" ON public.proposed_reviewers FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.created_by = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.created_by = auth.uid()));

CREATE TABLE public.screenings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'identifying' CHECK (status IN ('identifying','checking','done')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.screenings TO authenticated;
GRANT ALL ON public.screenings TO service_role;
ALTER TABLE public.screenings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage screenings on their own cases" ON public.screenings FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.created_by = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id AND c.created_by = auth.uid()));

CREATE TABLE public.screening_names (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  screening_id uuid NOT NULL REFERENCES public.screenings(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES public.proposed_reviewers(id) ON DELETE CASCADE,
  identity_status text NOT NULL DEFAULT 'needs_chair' CHECK (identity_status IN ('needs_chair','confirmed','cant_tell')),
  identity_method text CHECK (identity_method IN ('orcid','chair_pick','chair_paste')),
  profile_ids text[] NOT NULL DEFAULT '{}',
  confirmed_by text,
  confirmed_at timestamptz,
  check_status text NOT NULL DEFAULT 'not_started' CHECK (check_status IN ('not_started','running','done','failed')),
  check_stage text CHECK (check_stage IN ('publications','institutions','declarations','done')),
  result text CHECK (result IN ('conflict','potential','insufficient','no_conflict')),
  reason text,
  error text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.screening_names TO authenticated;
GRANT ALL ON public.screening_names TO service_role;
ALTER TABLE public.screening_names ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage screening names on their own cases" ON public.screening_names FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.screenings s JOIN public.cases c ON c.id = s.case_id WHERE s.id = screening_id AND c.created_by = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.screenings s JOIN public.cases c ON c.id = s.case_id WHERE s.id = screening_id AND c.created_by = auth.uid()));

CREATE TABLE public.findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  screening_name_id uuid NOT NULL REFERENCES public.screening_names(id) ON DELETE CASCADE,
  rule text NOT NULL CHECK (rule IN ('R1','R2','R3','R4','R5','R6','LARGE_TEAM','NAME_ONLY','SAME_NAME_OTHER_PERSON')),
  severity text NOT NULL CHECK (severity IN ('conflict','potential','info')),
  evidence jsonb NOT NULL DEFAULT '{}'
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.findings TO authenticated;
GRANT ALL ON public.findings TO service_role;
ALTER TABLE public.findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage findings on their own cases" ON public.findings FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.screening_names n JOIN public.screenings s ON s.id = n.screening_id JOIN public.cases c ON c.id = s.case_id WHERE n.id = screening_name_id AND c.created_by = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.screening_names n JOIN public.screenings s ON s.id = n.screening_id JOIN public.cases c ON c.id = s.case_id WHERE n.id = screening_name_id AND c.created_by = auth.uid()));

CREATE TABLE public.decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  screening_name_id uuid NOT NULL REFERENCES public.screening_names(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('approve','exclude')),
  reason text,
  decided_by text NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.decisions TO authenticated;
GRANT ALL ON public.decisions TO service_role;
ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage decisions on their own cases" ON public.decisions FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.screening_names n JOIN public.screenings s ON s.id = n.screening_id JOIN public.cases c ON c.id = s.case_id WHERE n.id = screening_name_id AND c.created_by = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.screening_names n JOIN public.screenings s ON s.id = n.screening_id JOIN public.cases c ON c.id = s.case_id WHERE n.id = screening_name_id AND c.created_by = auth.uid()));

CREATE TABLE public.api_cache (
  key text PRIMARY KEY,
  body jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_cache TO authenticated;
GRANT ALL ON public.api_cache TO service_role;
ALTER TABLE public.api_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users share the API cache" ON public.api_cache FOR ALL TO authenticated USING (true) WITH CHECK (true);