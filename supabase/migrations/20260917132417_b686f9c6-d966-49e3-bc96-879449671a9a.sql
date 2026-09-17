-- 1. Scope scraped SportyHQ profiles instead of exposing them platform-wide
DROP POLICY IF EXISTS "Signed-in users can view sportyhq profiles" ON public.sportyhq_profiles;

CREATE POLICY "Related users can view sportyhq profiles"
ON public.sportyhq_profiles
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'moderator'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.id = sportyhq_profiles.club_member_id
      AND public.is_club_member(auth.uid(), cm.club_id)
  )
  OR (
    sportyhq_profiles.person_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.club_members cm2
      WHERE cm2.user_id = auth.uid()
        AND cm2.person_id = sportyhq_profiles.person_id
    )
  )
);

-- 2. Make sure entrants from other clubs keep access to tournaments they play in
CREATE POLICY "Entrants can view their tournament"
ON public.tournaments
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'moderator'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.club_champs_registrations r
    JOIN public.club_members cm ON cm.id = r.club_member_id
    WHERE r.champ_id = tournaments.id AND cm.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.club_champs_registrations r2
    JOIN public.club_members cm2 ON cm2.id = r2.partner_member_id
    WHERE r2.champ_id = tournaments.id AND cm2.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.club_champs_entries e
    JOIN public.club_members cm3 ON cm3.id = e.club_member_id
    WHERE e.champ_id = tournaments.id AND cm3.user_id = auth.uid()
  )
);

-- 3. The club_champs compatibility view must run with the caller's own permissions
ALTER VIEW public.club_champs SET (security_invoker = on);