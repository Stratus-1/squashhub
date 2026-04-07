
-- Visitor registrations for tournaments/leagues (no auth account needed)
CREATE TABLE public.club_visitors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  home_club_name TEXT NOT NULL,
  member_number TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.club_visitors ENABLE ROW LEVEL SECURITY;

-- Anyone can register as a visitor (public insert, no auth required)
CREATE POLICY "Anyone can register as a visitor"
  ON public.club_visitors FOR INSERT
  WITH CHECK (true);

-- Authenticated members of the club can view visitors
CREATE POLICY "Club members can view visitors"
  ON public.club_visitors FOR SELECT
  TO authenticated
  USING (public.is_club_member(auth.uid(), club_id) OR public.is_club_admin(auth.uid(), club_id));

-- Club admins can update visitors
CREATE POLICY "Club admins can update visitors"
  ON public.club_visitors FOR UPDATE
  TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id));

-- Club admins can delete visitors
CREATE POLICY "Club admins can delete visitors"
  ON public.club_visitors FOR DELETE
  TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id));

-- Index for fast lookups by club
CREATE INDEX idx_club_visitors_club_id ON public.club_visitors(club_id);
