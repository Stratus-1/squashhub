ALTER TABLE public.platform_league_associations
  ADD COLUMN IF NOT EXISTS last_members_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_members_sync_summary text;