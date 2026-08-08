ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS annual_billing_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS annual_billing_requested_by uuid,
  ADD COLUMN IF NOT EXISTS annual_billing_request_note text;