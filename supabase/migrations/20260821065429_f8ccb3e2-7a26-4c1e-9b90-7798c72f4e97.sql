ALTER TABLE public.email_send_state
  ADD COLUMN IF NOT EXISTS max_emails_per_hour integer NOT NULL DEFAULT 90;

ALTER TABLE public.email_send_state
  ALTER COLUMN send_delay_ms SET DEFAULT 1000;

UPDATE public.email_send_state
SET send_delay_ms = 1000,
    max_emails_per_hour = 90,
    updated_at = now()
WHERE id = 1;