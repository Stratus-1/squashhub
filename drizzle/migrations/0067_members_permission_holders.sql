CREATE OR REPLACE FUNCTION public.has_club_permission(_user_id uuid, _club_id uuid, _slug text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_member_permissions cmp
    JOIN public.club_members cm ON cm.id = cmp.club_member_id
    LEFT JOIN public.club_permission_roles r ON r.id = cmp.permission_role_id
    WHERE cm.user_id = _user_id AND cm.club_id = _club_id
      AND (cmp.is_full_admin OR COALESCE(r.is_full_admin,false)
           OR _slug = ANY(COALESCE(cmp.custom_permissions,'{}'))
           OR _slug = ANY(COALESCE(r.permissions,'{}')))
  );
$$;

DROP POLICY IF EXISTS "Members-permission holders can insert members" ON public.club_members;
CREATE POLICY "Members-permission holders can insert members" ON public.club_members
FOR INSERT TO authenticated
WITH CHECK (public.has_club_permission(auth.uid(), club_id, 'members') AND role <> 'admin'::club_member_role);

DROP POLICY IF EXISTS "Members-permission holders can update members" ON public.club_members;
CREATE POLICY "Members-permission holders can update members" ON public.club_members
FOR UPDATE TO authenticated
USING (public.has_club_permission(auth.uid(), club_id, 'members') AND role <> 'admin'::club_member_role)
WITH CHECK (public.has_club_permission(auth.uid(), club_id, 'members') AND role <> 'admin'::club_member_role);

CREATE OR REPLACE FUNCTION public.notify_club_admins_of_application()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.is_pending_approval THEN
    INSERT INTO public.notifications (user_id, type, title, message, url, data)
    SELECT DISTINCT cm.user_id, 'membership_application',
           'New membership application',
           COALESCE(NEW.name, 'A new applicant') || ' has applied to join the club.',
           '/club-admin?tab=members&filter=pending',
           jsonb_build_object('club_member_id', NEW.id, 'club_id', NEW.club_id)
    FROM public.club_members cm
    WHERE cm.club_id = NEW.club_id
      AND cm.user_id IS NOT NULL
      AND cm.id <> NEW.id
      AND (cm.role = 'admin' OR public.has_club_permission(cm.user_id, NEW.club_id, 'members'));
  END IF;
  RETURN NEW;
END;
$function$;