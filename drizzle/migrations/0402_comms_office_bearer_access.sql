-- Member Communications access: club admins, members granted the "communications"
-- permission, and every current office bearer (club officer posts incl. treasurer,
-- or an open club_offices appointment).
CREATE OR REPLACE FUNCTION public.can_manage_club_comms(_user_id uuid, _club_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT _user_id IS NOT NULL AND _club_id IS NOT NULL AND (
    public.is_club_admin(_user_id, _club_id)
    OR public.is_club_admin_or_permitted(_user_id, _club_id, 'communications')
    OR EXISTS (
      SELECT 1
      FROM public.clubs c
      JOIN public.club_members cm ON cm.club_id = c.id AND cm.user_id = _user_id AND cm.status = 'active'
      WHERE c.id = _club_id
        AND cm.id IN (c.chairman_member_id, c.vice_chairman_member_id, c.secretary_member_id,
                      c.treasurer_member_id, c.club_captain_member_id, c.club_manager_member_id)
    )
    OR EXISTS (
      SELECT 1
      FROM public.club_offices o
      JOIN public.club_members cm ON cm.id = o.club_member_id AND cm.user_id = _user_id AND cm.status = 'active'
      WHERE o.club_id = _club_id AND o.ended_at IS NULL
    )
  );
$function$;

REVOKE ALL ON FUNCTION public.can_manage_club_comms(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_club_comms(uuid, uuid) TO authenticated, service_role;

-- Caller-scoped check for the app (never reveals other users' access).
CREATE OR REPLACE FUNCTION public.my_can_manage_club_comms(_club_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.can_manage_club_comms(auth.uid(), _club_id);
$function$;

REVOKE ALL ON FUNCTION public.my_can_manage_club_comms(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_can_manage_club_comms(uuid) TO authenticated;

DROP POLICY IF EXISTS "Club admins manage comms templates" ON public.comms_templates;
CREATE POLICY "Comms managers manage comms templates" ON public.comms_templates
  FOR ALL TO authenticated
  USING (public.can_manage_club_comms(auth.uid(), club_id))
  WITH CHECK (public.can_manage_club_comms(auth.uid(), club_id));

DROP POLICY IF EXISTS "Club admins manage comms template versions" ON public.comms_template_versions;
CREATE POLICY "Comms managers manage comms template versions" ON public.comms_template_versions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.comms_templates t WHERE t.id = comms_template_versions.template_id AND public.can_manage_club_comms(auth.uid(), t.club_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.comms_templates t WHERE t.id = comms_template_versions.template_id AND public.can_manage_club_comms(auth.uid(), t.club_id)));

DROP POLICY IF EXISTS "Club admins manage comms campaigns" ON public.comms_campaigns;
CREATE POLICY "Comms managers manage comms campaigns" ON public.comms_campaigns
  FOR ALL TO authenticated
  USING (public.can_manage_club_comms(auth.uid(), club_id))
  WITH CHECK (public.can_manage_club_comms(auth.uid(), club_id));

DROP POLICY IF EXISTS "Club admins view comms deliveries" ON public.comms_deliveries;
CREATE POLICY "Comms managers view comms deliveries" ON public.comms_deliveries
  FOR SELECT TO authenticated
  USING (public.can_manage_club_comms(auth.uid(), club_id));