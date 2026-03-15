
-- Add new columns to club_events
ALTER TABLE public.club_events 
  ADD COLUMN IF NOT EXISTS recurrence text NOT NULL DEFAULT 'once',
  ADD COLUMN IF NOT EXISTS light_fee_split text NOT NULL DEFAULT 'creator',
  ADD COLUMN IF NOT EXISTS reminder_hours integer NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS num_instances integer NOT NULL DEFAULT 12;

-- Create club_event_instances table
CREATE TABLE public.club_event_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.club_events(id) ON DELETE CASCADE,
  instance_date date NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  light_fee_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.club_event_instances ENABLE ROW LEVEL SECURITY;

-- RLS: Club members can view instances
CREATE POLICY "Club members can view event instances"
  ON public.club_event_instances FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.club_events ce 
    WHERE ce.id = club_event_instances.event_id 
    AND is_club_member(auth.uid(), ce.club_id)
  ));

-- RLS: Creator or admin can insert instances
CREATE POLICY "Creator or admin can insert event instances"
  ON public.club_event_instances FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.club_events ce 
    WHERE ce.id = club_event_instances.event_id 
    AND (auth.uid() = ce.created_by OR is_club_admin(auth.uid(), ce.club_id))
  ));

-- RLS: Creator or admin can update instances
CREATE POLICY "Creator or admin can update event instances"
  ON public.club_event_instances FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.club_events ce 
    WHERE ce.id = club_event_instances.event_id 
    AND (auth.uid() = ce.created_by OR is_club_admin(auth.uid(), ce.club_id))
  ));

-- RLS: Creator or admin can delete instances
CREATE POLICY "Creator or admin can delete event instances"
  ON public.club_event_instances FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.club_events ce 
    WHERE ce.id = club_event_instances.event_id 
    AND (auth.uid() = ce.created_by OR is_club_admin(auth.uid(), ce.club_id))
  ));

-- Create instance-level RSVPs table
CREATE TABLE public.club_event_instance_rsvps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES public.club_event_instances(id) ON DELETE CASCADE,
  club_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'invited',
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(instance_id, club_member_id)
);

ALTER TABLE public.club_event_instance_rsvps ENABLE ROW LEVEL SECURITY;

-- RLS for instance RSVPs
CREATE POLICY "Club members can view instance RSVPs"
  ON public.club_event_instance_rsvps FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.club_event_instances cei
    JOIN public.club_events ce ON ce.id = cei.event_id
    WHERE cei.id = club_event_instance_rsvps.instance_id
    AND is_club_member(auth.uid(), ce.club_id)
  ));

CREATE POLICY "Creator or admin can insert instance RSVPs"
  ON public.club_event_instance_rsvps FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.club_event_instances cei
    JOIN public.club_events ce ON ce.id = cei.event_id
    WHERE cei.id = club_event_instance_rsvps.instance_id
    AND (auth.uid() = ce.created_by OR is_club_admin(auth.uid(), ce.club_id))
  ));

CREATE POLICY "Members can update own instance RSVP"
  ON public.club_event_instance_rsvps FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.id = club_event_instance_rsvps.club_member_id
    AND cm.user_id = auth.uid()
  ));
