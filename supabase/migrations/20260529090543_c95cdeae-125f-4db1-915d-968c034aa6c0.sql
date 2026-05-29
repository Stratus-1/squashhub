
CREATE TABLE public.club_visitor_home_clubs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_club_visitor_home_clubs_club_lower_name
  ON public.club_visitor_home_clubs (club_id, lower(name));

CREATE INDEX idx_club_visitor_home_clubs_club_id
  ON public.club_visitor_home_clubs (club_id);

GRANT SELECT ON public.club_visitor_home_clubs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_visitor_home_clubs TO authenticated;
GRANT ALL ON public.club_visitor_home_clubs TO service_role;

ALTER TABLE public.club_visitor_home_clubs ENABLE ROW LEVEL SECURITY;

-- Public read so the visitor sign-up dropdown works for unauthenticated users
CREATE POLICY "Anyone can view home-club options"
  ON public.club_visitor_home_clubs FOR SELECT
  USING (true);

-- Club admins manage their own list
CREATE POLICY "Club admins can add home-club options"
  ON public.club_visitor_home_clubs FOR INSERT
  TO authenticated
  WITH CHECK (public.is_club_admin(auth.uid(), club_id));

CREATE POLICY "Club admins can edit home-club options"
  ON public.club_visitor_home_clubs FOR UPDATE
  TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id));

CREATE POLICY "Club admins can remove home-club options"
  ON public.club_visitor_home_clubs FOR DELETE
  TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id));

CREATE TRIGGER update_club_visitor_home_clubs_updated_at
  BEFORE UPDATE ON public.club_visitor_home_clubs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed from existing visitor records so existing names don't disappear
INSERT INTO public.club_visitor_home_clubs (club_id, name)
SELECT DISTINCT v.club_id, trim(v.home_club_name)
FROM public.club_visitors v
WHERE v.home_club_name IS NOT NULL
  AND trim(v.home_club_name) <> ''
  AND lower(trim(v.home_club_name)) NOT IN ('no club', 'club visitor', 'visitor')
ON CONFLICT DO NOTHING;

INSERT INTO public.club_visitor_home_clubs (club_id, name)
SELECT DISTINCT m.club_id, trim(m.home_club_name)
FROM public.club_members m
WHERE m.role = 'visitor'
  AND m.home_club_name IS NOT NULL
  AND trim(m.home_club_name) <> ''
  AND lower(trim(m.home_club_name)) NOT IN ('no club', 'club visitor', 'visitor')
ON CONFLICT DO NOTHING;
