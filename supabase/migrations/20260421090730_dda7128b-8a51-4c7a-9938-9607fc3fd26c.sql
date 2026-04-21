ALTER TABLE public.clubs
ADD COLUMN IF NOT EXISTS auto_number_existing_onboarding boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clubs.auto_number_existing_onboarding IS
'When true, pre-existing members (admin-created/CSV-imported) who lack a club_member_number will be auto-allocated one during onboarding.';