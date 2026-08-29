ALTER TABLE public.sportyhq_org_members
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS birthday text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS age integer,
  ADD COLUMN IF NOT EXISTS nationality text,
  ADD COLUMN IF NOT EXISTS handedness text,
  ADD COLUMN IF NOT EXISTS nickname text,
  ADD COLUMN IF NOT EXISTS rating numeric,
  ADD COLUMN IF NOT EXISTS rating_confidence integer,
  ADD COLUMN IF NOT EXISTS matches_ytd integer,
  ADD COLUMN IF NOT EXISTS matches_all_time integer,
  ADD COLUMN IF NOT EXISTS wins_all_time integer,
  ADD COLUMN IF NOT EXISTS rankings jsonb,
  ADD COLUMN IF NOT EXISTS sportyhq_user_id integer,
  ADD COLUMN IF NOT EXISTS profile_path text,
  ADD COLUMN IF NOT EXISTS profile_fetched_at timestamptz;

CREATE INDEX IF NOT EXISTS sportyhq_org_members_profile_fetched_idx
  ON public.sportyhq_org_members (profile_fetched_at NULLS FIRST);