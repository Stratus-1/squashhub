-- Default payment-gateway fee rates are only needed on Club Admin > Banking.
-- Restrict reading to platform admins/moderators and club staff (club admins, captains,
-- office bearers and anyone holding a club permission role, e.g. Treasurer), instead of every signed-in user.
-- Fee calculations for payments use SECURITY DEFINER functions and are unaffected.
CREATE OR REPLACE FUNCTION public.can_view_gateway_fee_defaults(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _user_id IS NOT NULL AND (
    public.has_role(_user_id, 'admin'::public.app_role)
    OR public.has_role(_user_id, 'moderator'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.user_id = _user_id
        AND (
          cm.role IN ('admin', 'captain')
          OR EXISTS (SELECT 1 FROM public.club_member_permissions cmp WHERE cmp.club_member_id = cm.id)
          OR EXISTS (
            SELECT 1 FROM public.clubs c
            WHERE c.id = cm.club_id
              AND cm.id IN (c.chairman_member_id, c.vice_chairman_member_id, c.secretary_member_id,
                            c.club_captain_member_id, c.club_manager_member_id)
          )
        )
    )
  );
$$;

REVOKE ALL ON FUNCTION public.can_view_gateway_fee_defaults(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_gateway_fee_defaults(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Signed-in users read default gateway fees" ON public.payment_gateway_fee_defaults;
CREATE POLICY "Club staff read default gateway fees" ON public.payment_gateway_fee_defaults
  FOR SELECT TO authenticated
  USING (public.can_view_gateway_fee_defaults(auth.uid()));