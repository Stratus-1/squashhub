ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS ssa_membership_number text,
  ADD COLUMN IF NOT EXISTS ssa_membership_status text,
  ADD COLUMN IF NOT EXISTS ssa_membership_source text,
  ADD COLUMN IF NOT EXISTS ssa_membership_checked_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS uq_people_ssa_membership_number
  ON public.people (ssa_membership_number) WHERE ssa_membership_number IS NOT NULL AND merged_into_person_id IS NULL;
COMMENT ON COLUMN public.people.ssa_membership_number IS 'Official Squash South Africa membership ID (e.g. from SportyHQ). Distinct from national_player_number, which is SquashHub''s internal SSA###### id.';