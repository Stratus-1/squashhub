CREATE OR REPLACE FUNCTION public.can_view_member_stats(_member_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_club uuid;
BEGIN
  -- internal maintenance context (pg_cron / service_role): no end user involved
  IF auth.uid() IS NULL AND current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN true;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT club_id INTO v_club FROM public.club_members WHERE id = _member_id;
  IF v_club IS NULL THEN
    RETURN false;
  END IF;

  -- platform admins (support / "view as" mode)
  IF public.is_platform_admin(auth.uid()) THEN
    RETURN true;
  END IF;

  -- own record, a linked member record, or a club-mate
  RETURN EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.club_id = v_club
  );
END;
$function$;