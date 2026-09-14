ALTER TABLE public.tournaments
  DROP CONSTRAINT IF EXISTS club_champs_partner_mode_check;
ALTER TABLE public.tournaments
  ADD CONSTRAINT club_champs_partner_mode_check
  CHECK (partner_mode = ANY (ARRAY['admin'::text, 'players'::text, 'rotate'::text]));