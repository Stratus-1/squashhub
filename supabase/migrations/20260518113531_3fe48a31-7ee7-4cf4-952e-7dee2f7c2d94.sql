ALTER TABLE public.clubs 
  ADD COLUMN IF NOT EXISTS contact_person_name text,
  ADD COLUMN IF NOT EXISTS email_signature_html text,
  ADD COLUMN IF NOT EXISTS email_disclaimer text;