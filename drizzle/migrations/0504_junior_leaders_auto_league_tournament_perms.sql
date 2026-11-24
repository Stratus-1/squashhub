CREATE OR REPLACE FUNCTION public._junior_leader_grant_perms()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.role = 'admin' AND COALESCE(NEW.status::text,'active') = 'active' AND EXISTS (
    SELECT 1 FROM public.organisations o JOIN public.junior_body_settings s ON s.org_id = o.id WHERE o.club_id = NEW.club_id
  ) THEN
    IF EXISTS (SELECT 1 FROM public.club_member_permissions WHERE club_member_id = NEW.id) THEN
      UPDATE public.club_member_permissions
         SET custom_permissions = ARRAY(SELECT DISTINCT unnest(custom_permissions || ARRAY['leagues','champs'])), updated_at = now()
       WHERE club_member_id = NEW.id AND NOT (custom_permissions @> ARRAY['leagues','champs']);
    ELSE
      INSERT INTO public.club_member_permissions (club_member_id, custom_permissions) VALUES (NEW.id, ARRAY['leagues','champs']);
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS junior_leader_grant_perms ON public.club_members;
CREATE TRIGGER junior_leader_grant_perms AFTER INSERT OR UPDATE OF role, status ON public.club_members
FOR EACH ROW EXECUTE FUNCTION public._junior_leader_grant_perms();

-- backfill existing leaders
UPDATE public.club_member_permissions p
   SET custom_permissions = ARRAY(SELECT DISTINCT unnest(p.custom_permissions || ARRAY['leagues','champs'])), updated_at = now()
  FROM public.club_members cm
 WHERE cm.id = p.club_member_id AND cm.role = 'admin' AND COALESCE(cm.status::text,'active') = 'active'
   AND EXISTS (SELECT 1 FROM public.organisations o JOIN public.junior_body_settings s ON s.org_id = o.id WHERE o.club_id = cm.club_id)
   AND NOT (p.custom_permissions @> ARRAY['leagues','champs']);
INSERT INTO public.club_member_permissions (club_member_id, custom_permissions)
SELECT cm.id, ARRAY['leagues','champs'] FROM public.club_members cm
 WHERE cm.role = 'admin' AND COALESCE(cm.status::text,'active') = 'active'
   AND EXISTS (SELECT 1 FROM public.organisations o JOIN public.junior_body_settings s ON s.org_id = o.id WHERE o.club_id = cm.club_id)
   AND NOT EXISTS (SELECT 1 FROM public.club_member_permissions p WHERE p.club_member_id = cm.id);