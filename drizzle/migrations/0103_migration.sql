CREATE TABLE public.platform_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_on date NOT NULL DEFAULT current_date,
  area text NOT NULL DEFAULT 'general',
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  audience_hint text NOT NULL DEFAULT 'all',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_change_log TO authenticated;
GRANT ALL ON public.platform_change_log TO service_role;
ALTER TABLE public.platform_change_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admins manage change log" ON public.platform_change_log
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX platform_change_log_on_idx ON public.platform_change_log (changed_on DESC);

INSERT INTO public.platform_change_log (changed_on, area, title, summary, audience_hint) VALUES
('2026-10-08','navigation','Edit your menu','Everyone can reorder and hide their own side-menu items with Edit menu (drag, up/down arrows, eye to hide, Save, Cancel, Reset to default). Saved per person and per club, across devices. Never changes access.','all'),
('2026-10-08','navigation','Bar / POS moved after Club Books','In Club Admin, Bar / POS now sits directly after Club Books.','admins'),
('2026-10-08','updates','Updates from SquashHub for everyone','A permanent Updates from SquashHub list is available to all members, not only club admins.','all'),
('2026-10-08','bar','Early account warning in the Bar','When a member account cannot cover a Bar/Shop purchase, a clear warning appears as soon as items are added, asking to pay by card or top up. Allowed recurring overdrafts are respected. Separate Bar and Shop switches per club.','all'),
('2026-10-08','bookings','Peak indicator on the court schedule','The P peak indicator now shows on the court booking grid and the court display screen, using the same peak rules. The view-only display shows a notice to log in to the SquashHub app to change bookings.','all'),
('2026-10-08','finance','Faster EFT and deposit approvals','Treasurers get an actionable card for pending EFTs and deposits (member, amount, reference, date) with Approve, Keep for later, or View pending approvals, and links land on the exact transaction. Club-scoped, no double approvals, fully audited.','admins'),
('2026-10-07','permissions','Club roles and permissions pilot','A new club-scoped roles model (Chairman, Treasurer, Bar Manager and more) with independent approvals: nobody approves their own transaction. Piloting at Riverside first; other clubs unchanged.','admins');