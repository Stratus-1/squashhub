CREATE TABLE IF NOT EXISTS public.impersonation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  target_club_member_id uuid,
  club_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.impersonation_log TO authenticated;
GRANT ALL ON public.impersonation_log TO service_role;

ALTER TABLE public.impersonation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins can view impersonation log" ON public.impersonation_log;
CREATE POLICY "Platform admins can view impersonation log"
  ON public.impersonation_log FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR (club_id IS NOT NULL AND public.is_club_admin(auth.uid(), club_id)));

CREATE INDEX IF NOT EXISTS impersonation_log_club_idx ON public.impersonation_log (club_id, created_at DESC);