ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS visitor_home_clubs_enabled boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.clubs.visitor_home_clubs_enabled IS
  'When true the club still asks casual visitors which club they come from. Off by default: a visitor is a local guest, players from another club register with their own club instead.';

ALTER TABLE public.club_visitors ALTER COLUMN home_club_name SET DEFAULT 'Visitor';