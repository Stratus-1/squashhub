CREATE OR REPLACE FUNCTION public.create_default_permission_roles()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  full_perms text[] := ARRAY['club','fees','banking','members','visitors','leagues','bar','access','champs','ladder','users','finance','courts','settings'];
  finance_perms text[] := ARRAY['fees','banking','members','bar','finance'];
BEGIN
  INSERT INTO public.club_permission_roles (club_id, role_name, permissions) VALUES
    (NEW.id, 'Full Admin', full_perms),
    (NEW.id, 'Chairman', full_perms),
    (NEW.id, 'Secretary', full_perms),
    (NEW.id, 'Club Captain', full_perms),
    (NEW.id, 'Captain', full_perms),
    (NEW.id, 'Finance', finance_perms),
    (NEW.id, 'Treasurer', finance_perms)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;

INSERT INTO public.club_permission_roles (club_id, role_name, permissions)
SELECT c.id, 'Treasurer', ARRAY['fees','banking','members','bar','finance']
FROM public.clubs c
WHERE NOT EXISTS (
  SELECT 1 FROM public.club_permission_roles r
  WHERE r.club_id = c.id AND r.role_name = 'Treasurer'
);

CREATE OR REPLACE FUNCTION public.auto_assign_officer_roles()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.chairman_member_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.chairman_member_id IS DISTINCT FROM OLD.chairman_member_id) THEN
    PERFORM public.assign_role_to_member(NEW.id, NEW.chairman_member_id, 'Chairman');
  END IF;
  IF NEW.secretary_member_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.secretary_member_id IS DISTINCT FROM OLD.secretary_member_id) THEN
    PERFORM public.assign_role_to_member(NEW.id, NEW.secretary_member_id, 'Secretary');
  END IF;
  IF NEW.club_captain_member_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.club_captain_member_id IS DISTINCT FROM OLD.club_captain_member_id) THEN
    PERFORM public.assign_role_to_member(NEW.id, NEW.club_captain_member_id, 'Club Captain');
  END IF;
  IF NEW.treasurer_member_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.treasurer_member_id IS DISTINCT FROM OLD.treasurer_member_id) THEN
    PERFORM public.assign_role_to_member(NEW.id, NEW.treasurer_member_id, 'Treasurer');
  END IF;
  RETURN NEW;
END;
$function$;