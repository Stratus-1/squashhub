ALTER TABLE public.club_bar_settings
  ADD COLUMN IF NOT EXISTS open_tab_reminder_whatsapp boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS open_tab_reminder_sms boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS open_tab_reminder_email boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.bar_open_tab_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  tab_id uuid NOT NULL REFERENCES public.bar_guest_tabs(id) ON DELETE CASCADE,
  reminder_date date NOT NULL,
  channel text NOT NULL CHECK (channel IN ('whatsapp','sms','email')),
  status text NOT NULL DEFAULT 'sending',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tab_id, reminder_date, channel)
);
GRANT SELECT ON public.bar_open_tab_reminders TO authenticated;
GRANT ALL ON public.bar_open_tab_reminders TO service_role;
ALTER TABLE public.bar_open_tab_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Club admins view open tab reminders" ON public.bar_open_tab_reminders
  FOR SELECT TO authenticated USING (public.is_club_admin(auth.uid(), club_id));