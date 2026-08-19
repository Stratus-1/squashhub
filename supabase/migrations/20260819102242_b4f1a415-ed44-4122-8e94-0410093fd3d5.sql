ALTER TABLE public.club_champs_registrations
  ADD COLUMN IF NOT EXISTS proof_url text,
  ADD COLUMN IF NOT EXISTS proof_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS proof_uploaded_by uuid;