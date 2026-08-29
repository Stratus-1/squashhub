CREATE TABLE public.stitch_webhook_quarantine (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'stitch-collection-webhook',
  collection_id uuid,
  club_id uuid,
  svix_id text,
  event_type text,
  payload jsonb,
  error text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

GRANT ALL ON public.stitch_webhook_quarantine TO service_role;

ALTER TABLE public.stitch_webhook_quarantine ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_stitch_webhook_quarantine_unresolved
  ON public.stitch_webhook_quarantine (created_at)
  WHERE resolved_at IS NULL;