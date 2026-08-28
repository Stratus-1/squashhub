CREATE TABLE public.sportyhq_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sportyhq_user_id BIGINT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  profile_path TEXT NOT NULL,
  club_label TEXT,
  location_label TEXT,
  sport TEXT NOT NULL DEFAULT 'Squash (Singles)',
  rating NUMERIC,
  rating_confidence NUMERIC,
  matches_ytd INTEGER,
  matches_all_time INTEGER,
  rankings JSONB NOT NULL DEFAULT '[]'::jsonb,
  governing_bodies JSONB NOT NULL DEFAULT '[]'::jsonb,
  clubs JSONB NOT NULL DEFAULT '[]'::jsonb,
  person_id UUID REFERENCES public.people(id) ON DELETE SET NULL,
  club_member_id UUID REFERENCES public.club_members(id) ON DELETE SET NULL,
  verified_by UUID,
  verified_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sportyhq_profiles_person ON public.sportyhq_profiles(person_id);
CREATE INDEX idx_sportyhq_profiles_member ON public.sportyhq_profiles(club_member_id);
CREATE INDEX idx_sportyhq_profiles_name ON public.sportyhq_profiles(lower(name));

GRANT SELECT ON public.sportyhq_profiles TO authenticated;
GRANT ALL ON public.sportyhq_profiles TO service_role;

ALTER TABLE public.sportyhq_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can view sportyhq profiles"
  ON public.sportyhq_profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Platform admins manage sportyhq profiles"
  ON public.sportyhq_profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_sportyhq_profiles_updated_at
  BEFORE UPDATE ON public.sportyhq_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();