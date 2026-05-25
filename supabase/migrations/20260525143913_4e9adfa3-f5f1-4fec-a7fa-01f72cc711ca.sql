
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS participation_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sla_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_accepted_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS sla_accepted_name text,
  ADD COLUMN IF NOT EXISTS sla_accepted_role text,
  ADD COLUMN IF NOT EXISTS sla_version text,
  ADD COLUMN IF NOT EXISTS sla_billing_option text CHECK (sla_billing_option IN ('monthly','annual_upfront'));
