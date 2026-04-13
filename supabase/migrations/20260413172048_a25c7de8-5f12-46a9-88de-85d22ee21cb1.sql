CREATE TABLE public.platform_league_members (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  association_id uuid NOT NULL REFERENCES public.platform_league_associations(id) ON DELETE CASCADE,
  user_code text NOT NULL,
  surname text NOT NULL,
  first_name text NOT NULL,
  affiliation text NOT NULL DEFAULT '',
  club_name text NOT NULL DEFAULT '',
  user_state text NOT NULL DEFAULT 'ACTIVE',
  league_matches integer DEFAULT 0,
  qualifications text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_platform_league_members_association ON public.platform_league_members(association_id);
CREATE INDEX idx_platform_league_members_user_code ON public.platform_league_members(user_code);
CREATE UNIQUE INDEX idx_platform_league_members_unique ON public.platform_league_members(association_id, user_code);

ALTER TABLE public.platform_league_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can manage league members"
  ON public.platform_league_members
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view league members"
  ON public.platform_league_members
  FOR SELECT
  TO authenticated
  USING (true);