CREATE OR REPLACE FUNCTION public.club_members_guard_members_perm()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  -- Members-permission holders (non-admins) may never grant or change the admin/captain role.
  IF auth.uid() IS NOT NULL
     AND NOT public.is_club_admin(auth.uid(), NEW.club_id)
     AND NOT public.has_role(auth.uid(), 'admin'::app_role)
     AND public.has_club_permission(auth.uid(), NEW.club_id, 'members')
     AND NEW.user_id IS DISTINCT FROM auth.uid() THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.role IN ('admin','captain') THEN NEW.role := 'member'; END IF;
    ELSE
      NEW.role := OLD.role;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Let the self-field guard treat members-permission holders like admins when editing OTHER members.
CREATE OR REPLACE FUNCTION public.is_club_member_manager(_user_id uuid, _club_id uuid, _target_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _target_user IS DISTINCT FROM _user_id AND public.has_club_permission(_user_id, _club_id, 'members');
$$;

DROP TRIGGER IF EXISTS zz_club_members_guard_members_perm ON public.club_members;
CREATE TRIGGER zz_club_members_guard_members_perm BEFORE INSERT OR UPDATE ON public.club_members
FOR EACH ROW EXECUTE FUNCTION public.club_members_guard_members_perm();