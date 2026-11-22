CREATE TABLE public.feature_notice_dismissals (
  user_id uuid NOT NULL,
  notice_key text NOT NULL CHECK (char_length(notice_key) BETWEEN 1 AND 100),
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, notice_key)
);

GRANT SELECT, INSERT ON public.feature_notice_dismissals TO authenticated;
GRANT ALL ON public.feature_notice_dismissals TO service_role;

ALTER TABLE public.feature_notice_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own notice dismissals"
  ON public.feature_notice_dismissals FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users record own notice dismissals"
  ON public.feature_notice_dismissals FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- True when the caller is an office bearer or full admin at a club whose
-- SquashHub subscription is active or on an unexpired trial.
CREATE OR REPLACE FUNCTION public.is_committee_at_active_club()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.club_members m
    JOIN public.club_subscriptions s ON s.club_id = m.club_id
    WHERE m.user_id = auth.uid()
      AND m.status <> 'resigned'
      AND (s.status = 'active' OR (s.status IN ('trial', 'trialing') AND s.trial_ends_at > now()))
      AND (
        public._approval_my_member(m.club_id) IS NOT NULL
        OR EXISTS (SELECT 1 FROM public.club_members a WHERE a.id = m.id AND a.role = 'admin')
        OR EXISTS (
          SELECT 1 FROM public.club_member_permissions p
          WHERE p.club_member_id = m.id AND p.is_full_admin = true
        )
      )
  )
$$;

REVOKE ALL ON FUNCTION public.is_committee_at_active_club() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_committee_at_active_club() TO authenticated;