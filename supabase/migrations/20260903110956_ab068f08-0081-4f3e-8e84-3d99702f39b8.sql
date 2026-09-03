ALTER TABLE public.club_members
  ADD COLUMN IF NOT EXISTS gobook_client_id integer,
  ADD COLUMN IF NOT EXISTS gobook_client_name text,
  ADD COLUMN IF NOT EXISTS gobook_linked_at timestamptz;

CREATE INDEX IF NOT EXISTS club_members_gobook_client_idx
  ON public.club_members (club_id, gobook_client_id);