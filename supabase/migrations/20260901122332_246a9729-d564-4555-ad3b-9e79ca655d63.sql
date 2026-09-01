CREATE OR REPLACE FUNCTION public.club_has_no_admin(_club_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.club_members m
    WHERE m.club_id = _club_id
      AND m.role = 'admin'::public.club_member_role
  );
$$;

GRANT EXECUTE ON FUNCTION public.club_has_no_admin(uuid) TO authenticated;

DROP POLICY IF EXISTS "Club admins can insert members" ON public.club_members;
CREATE POLICY "Club admins can insert members"
ON public.club_members
FOR INSERT
TO authenticated
WITH CHECK (
  is_club_admin(auth.uid(), club_id)
  OR (
    auth.uid() = user_id
    AND role <> ALL (ARRAY['admin'::club_member_role, 'captain'::club_member_role])
  )
  OR (
    auth.uid() = user_id
    AND role = 'admin'::club_member_role
    AND public.club_has_no_admin(club_id)
  )
);

CREATE OR REPLACE FUNCTION public.club_members_prevent_self_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.role = 'admin'::public.club_member_role
     AND NOT public.is_club_admin(auth.uid(), NEW.club_id)
     AND NOT public.club_has_no_admin(NEW.club_id)
  THEN
    RAISE EXCEPTION 'Only club admins can assign the admin role';
  END IF;
  RETURN NEW;
END;
$function$;