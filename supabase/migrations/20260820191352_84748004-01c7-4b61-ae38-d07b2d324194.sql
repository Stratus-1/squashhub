ALTER TABLE public.club_champs_registrations
  DROP CONSTRAINT IF EXISTS club_champs_registrations_status_check;

ALTER TABLE public.club_champs_registrations
  ADD CONSTRAINT club_champs_registrations_status_check
  CHECK (status IN ('invited', 'pending_payment', 'pending_eft', 'paid', 'waived', 'cancelled'));