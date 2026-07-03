
-- Suspension rules on clubs
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS suspension_rules jsonb NOT NULL DEFAULT jsonb_build_object(
    'enabled', false,
    'grace_days', 30,
    'amount_threshold', 500,
    'age_days_threshold', 60,
    'exempt_with_mandate', true,
    'blocks', jsonb_build_array('bookings','door','league','challenges','events','bar'),
    'grace_message', 'Your account is in arrears. Please settle outstanding fees to restore access.'
  );

-- Suspension status on club_members
DO $$ BEGIN
  CREATE TYPE public.member_suspension_status AS ENUM ('active','warning','suspended','manual_hold');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.club_members
  ADD COLUMN IF NOT EXISTS suspension_status public.member_suspension_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS suspension_reason text,
  ADD COLUMN IF NOT EXISTS suspension_outstanding numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspension_cleared_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspension_manual boolean NOT NULL DEFAULT false;

-- Audit log
CREATE TABLE IF NOT EXISTS public.member_suspension_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  club_member_id uuid NOT NULL,
  previous_status public.member_suspension_status,
  new_status public.member_suspension_status NOT NULL,
  reason text,
  outstanding numeric(12,2),
  changed_by uuid,
  automatic boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.member_suspension_log TO authenticated;
GRANT ALL ON public.member_suspension_log TO service_role;

ALTER TABLE public.member_suspension_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "club admins view suspension log"
  ON public.member_suspension_log FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = member_suspension_log.club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'admin'
    )
  );

CREATE POLICY "member views own suspension log"
  ON public.member_suspension_log FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.id = member_suspension_log.club_member_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "service inserts suspension log"
  ON public.member_suspension_log FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = member_suspension_log.club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'admin'
    )
  );

CREATE INDEX IF NOT EXISTS idx_suspension_log_member ON public.member_suspension_log(club_member_id, created_at DESC);
