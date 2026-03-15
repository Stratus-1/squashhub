
-- Club Events table
CREATE TABLE public.club_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  title text NOT NULL,
  description text,
  event_type text NOT NULL DEFAULT 'social' CHECK (event_type IN ('social', 'coaching', 'training', 'other')),
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  invite_scope text NOT NULL DEFAULT 'all' CHECK (invite_scope IN ('all', 'category', 'league')),
  invite_scope_id uuid,
  booked_by_member_id uuid REFERENCES public.club_members(id) ON DELETE SET NULL,
  is_club_booking boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.club_events ENABLE ROW LEVEL SECURITY;

-- Club members can view events for their club
CREATE POLICY "Club members can view club events"
  ON public.club_events FOR SELECT TO authenticated
  USING (is_club_member(auth.uid(), club_id));

-- Any club member can create events
CREATE POLICY "Club members can create club events"
  ON public.club_events FOR INSERT TO authenticated
  WITH CHECK (is_club_member(auth.uid(), club_id) AND auth.uid() = created_by);

-- Creator or admin can update
CREATE POLICY "Creator or admin can update club events"
  ON public.club_events FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR is_club_admin(auth.uid(), club_id));

-- Creator or admin can delete
CREATE POLICY "Creator or admin can delete club events"
  ON public.club_events FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR is_club_admin(auth.uid(), club_id));

-- Club Event Courts (multi-court selection)
CREATE TABLE public.club_event_courts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.club_events(id) ON DELETE CASCADE,
  court_id integer NOT NULL REFERENCES public.courts(id) ON DELETE CASCADE,
  UNIQUE(event_id, court_id)
);

ALTER TABLE public.club_event_courts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Viewable by club members"
  ON public.club_event_courts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.club_events ce WHERE ce.id = event_id AND is_club_member(auth.uid(), ce.club_id)));

CREATE POLICY "Insertable by event creator"
  ON public.club_event_courts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.club_events ce WHERE ce.id = event_id AND (auth.uid() = ce.created_by OR is_club_admin(auth.uid(), ce.club_id))));

CREATE POLICY "Deletable by event creator"
  ON public.club_event_courts FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.club_events ce WHERE ce.id = event_id AND (auth.uid() = ce.created_by OR is_club_admin(auth.uid(), ce.club_id))));

-- Club Event RSVPs
CREATE TABLE public.club_event_rsvps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.club_events(id) ON DELETE CASCADE,
  club_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'confirmed', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, club_member_id)
);

ALTER TABLE public.club_event_rsvps ENABLE ROW LEVEL SECURITY;

-- Club members can view RSVPs for their club events
CREATE POLICY "Club members can view event RSVPs"
  ON public.club_event_rsvps FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.club_events ce WHERE ce.id = event_id AND is_club_member(auth.uid(), ce.club_id)));

-- Event creator/admin can insert RSVPs (invitations)
CREATE POLICY "Creator can insert event RSVPs"
  ON public.club_event_rsvps FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.club_events ce WHERE ce.id = event_id AND (auth.uid() = ce.created_by OR is_club_admin(auth.uid(), ce.club_id))));

-- Members can update their own RSVP status
CREATE POLICY "Members can update own RSVP"
  ON public.club_event_rsvps FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.club_members cm WHERE cm.id = club_member_id AND cm.user_id = auth.uid()));

-- Creator/admin can delete RSVPs
CREATE POLICY "Creator can delete event RSVPs"
  ON public.club_event_rsvps FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.club_events ce WHERE ce.id = event_id AND (auth.uid() = ce.created_by OR is_club_admin(auth.uid(), ce.club_id))));
