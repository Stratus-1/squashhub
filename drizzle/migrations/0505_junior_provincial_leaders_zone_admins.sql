CREATE OR REPLACE FUNCTION public._junior_leader_zone_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE z record;
BEGIN
  IF NEW.role <> 'admin' OR COALESCE(NEW.status::text,'active') <> 'active' THEN RETURN NEW; END IF;
  FOR z IN
    SELECT DISTINCT zo.club_id AS zone_club
    FROM public.organisations o
    JOIN public.junior_body_settings s ON s.org_id = o.id
    JOIN public.org_groupings g ON g.child_org_id = o.id AND g.mode = 'include'
    JOIN public.organisations zo ON zo.id = g.parent_org_id AND zo.kind = 'zone' AND zo.club_id IS NOT NULL
    WHERE o.club_id = NEW.club_id AND o.kind <> 'zone'
  LOOP
    IF EXISTS (SELECT 1 FROM public.club_members m WHERE m.club_id = z.zone_club
               AND ((NEW.person_id IS NOT NULL AND m.person_id = NEW.person_id) OR (NEW.user_id IS NOT NULL AND m.user_id = NEW.user_id))) THEN
      UPDATE public.club_members SET role = 'admin', status = 'active'
       WHERE club_id = z.zone_club AND role <> 'admin'
         AND ((NEW.person_id IS NOT NULL AND person_id = NEW.person_id) OR (NEW.user_id IS NOT NULL AND user_id = NEW.user_id));
    ELSE
      INSERT INTO public.club_members (club_id, user_id, person_id, name, email, phone, role, status, billing_exempt)
      VALUES (z.zone_club, NEW.user_id, NEW.person_id, NEW.name, NEW.email, NEW.phone, 'admin', 'active', true);
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS junior_leader_zone_admin ON public.club_members;
CREATE TRIGGER junior_leader_zone_admin AFTER INSERT OR UPDATE OF role, status ON public.club_members
FOR EACH ROW EXECUTE FUNCTION public._junior_leader_zone_admin();

-- backfill current provincial/regional leaders
UPDATE public.club_members cm SET status = cm.status
 WHERE cm.role = 'admin' AND COALESCE(cm.status::text,'active') = 'active'
   AND EXISTS (SELECT 1 FROM public.organisations o JOIN public.junior_body_settings s ON s.org_id = o.id
               WHERE o.club_id = cm.club_id AND o.kind <> 'zone');