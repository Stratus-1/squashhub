CREATE OR REPLACE FUNCTION public.club_members_prevent_self_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role / no auth context (edge functions, migrations) is unrestricted.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       AND NOT public.is_club_admin(auth.uid(), NEW.club_id) THEN
      RAISE EXCEPTION 'Only club admins can change a member role';
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF NOT public.is_club_admin(auth.uid(), NEW.club_id)
       AND NEW.role NOT IN ('member'::club_member_role, 'visitor'::club_member_role) THEN
      RAISE EXCEPTION 'Self sign-up may only create a member or visitor record';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_club_members_prevent_self_role_change ON public.club_members;
CREATE TRIGGER trg_club_members_prevent_self_role_change
BEFORE INSERT OR UPDATE ON public.club_members
FOR EACH ROW EXECUTE FUNCTION public.club_members_prevent_self_role_change();
