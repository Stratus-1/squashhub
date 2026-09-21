ALTER TABLE public.club_champs_registrations
  ADD COLUMN IF NOT EXISTS whatsapp_group_opt_in boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.club_champs_registrations.whatsapp_group_opt_in IS
  'Player opted into the tournament WhatsApp group at entry time. Opt-outs are never sent the group join link.';