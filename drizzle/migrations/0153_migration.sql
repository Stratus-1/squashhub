CREATE OR REPLACE FUNCTION public.bar_can_manage_pins(_user_id uuid, _club_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _user_id IS NOT NULL AND (
    COALESCE(public.is_platform_admin(_user_id), false)
    OR CASE WHEN public.club_new_perms_on(_club_id)
         THEN public.has_cap(_user_id, _club_id, 'bar.pin.manage')
         ELSE public.bar_staff_can_serve(_user_id, _club_id)
              OR COALESCE(public.is_club_admin_or_permitted(_user_id, _club_id, 'finance'), false) END)
$$;