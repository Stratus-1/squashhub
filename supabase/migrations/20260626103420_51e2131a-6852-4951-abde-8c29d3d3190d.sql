CREATE OR REPLACE FUNCTION public.is_club_admin(_user_id uuid, _club_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
    OR public.has_role(_user_id, 'moderator'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.club_members
      WHERE user_id = _user_id AND club_id = _club_id AND role = 'admin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.club_member_permissions cmp
      JOIN public.club_members cm ON cm.id = cmp.club_member_id
      WHERE cm.user_id = _user_id
        AND cm.club_id = _club_id
        AND cmp.is_full_admin = true
    )
    OR EXISTS (
      SELECT 1
      FROM public.clubs c
      JOIN public.club_members cm ON cm.club_id = c.id AND cm.user_id = _user_id
      WHERE c.id = _club_id
        AND cm.id IN (c.chairman_member_id, c.secretary_member_id, c.club_captain_member_id)
    );
$function$;