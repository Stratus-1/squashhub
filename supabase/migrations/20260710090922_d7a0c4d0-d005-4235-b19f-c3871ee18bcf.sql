ALTER TABLE public.club_champs
  ADD COLUMN IF NOT EXISTS swiss_pools jsonb,
  ADD COLUMN IF NOT EXISTS swiss_rounds jsonb;