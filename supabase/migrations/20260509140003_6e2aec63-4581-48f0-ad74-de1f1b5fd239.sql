ALTER TABLE public.club_member_permissions
ADD COLUMN IF NOT EXISTS is_full_admin BOOLEAN NOT NULL DEFAULT false;