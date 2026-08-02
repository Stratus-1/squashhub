ALTER TABLE public.outreach_campaigns
  ADD COLUMN IF NOT EXISTS rate_window_hours integer NOT NULL DEFAULT 24;