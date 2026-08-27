CREATE OR REPLACE FUNCTION public.club_members_prevent_self_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Service role / no auth context (edge functions, migrations) is unrestricted.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.role = 'admin'::public.club_member_role
     AND NOT public.is_club_admin(auth.uid(), NEW.club_id)
  THEN
    RAISE EXCEPTION 'Only club admins can assign the admin role';
  END IF;
  RETURN NEW;
END;
$function$;