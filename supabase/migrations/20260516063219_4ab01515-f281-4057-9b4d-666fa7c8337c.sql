ALTER TABLE public.yoco_payment_sessions
  ADD COLUMN IF NOT EXISTS bar_tab_entry_ids uuid[] NOT NULL DEFAULT '{}';

ALTER TABLE public.yoco_payment_sessions
  DROP CONSTRAINT IF EXISTS yoco_payment_sessions_purpose_check;

ALTER TABLE public.yoco_payment_sessions
  ADD CONSTRAINT yoco_payment_sessions_purpose_check
  CHECK (purpose IN ('fee','topup','bartab'));