DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'member_status') THEN
    CREATE TYPE public.member_status AS ENUM ('active', 'suspended', 'resigned');
  END IF;
END $$;

ALTER TABLE public.club_members
  ADD COLUMN IF NOT EXISTS status public.member_status NOT NULL DEFAULT 'active';

CREATE INDEX IF NOT EXISTS idx_club_members_club_status
  ON public.club_members (club_id, status);

UPDATE public.club_members SET status = 'active' WHERE status IS NULL;