
-- Add time and court fields to challenges table for the simplified flow
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS proposed_time time;
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS court_id integer REFERENCES public.courts(id);
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS counter_date date;
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS counter_time time;
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS confirmed_by uuid;
