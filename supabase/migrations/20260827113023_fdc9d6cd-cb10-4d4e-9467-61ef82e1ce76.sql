CREATE OR REPLACE FUNCTION public.is_club_member(_user_id uuid, _club_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.club_members cm
    WHERE cm.user_id = _user_id
      AND cm.club_id = _club_id
      AND cm.is_pending_approval = false
  )
$function$;

ALTER FUNCTION public.is_club_member(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_club_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_club_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_club_member(uuid, uuid) TO service_role;