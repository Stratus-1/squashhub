
-- 1) Remove the standalone "Captain" club permission role (league-scoped, not a club delegate role)
--    Also clear any member assignments that pointed to it.
UPDATE public.club_member_permissions cmp
SET permission_role_id = NULL
WHERE permission_role_id IN (
  SELECT id FROM public.club_permission_roles WHERE lower(role_name) = 'captain'
);

DELETE FROM public.club_permission_roles WHERE lower(role_name) = 'captain';

-- 2) Update auto-seed trigger so newly-created clubs get Chairman / Secretary / Club Captain / Finance
--    (no plain "Captain" anymore).
CREATE OR REPLACE FUNCTION public.seed_default_permission_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.club_permission_roles (club_id, role_name, permissions, is_full_admin)
  VALUES
    (NEW.id, 'Chairman',     ARRAY['club','settings','fees','courts','banking','finance','members','users','visitors','ladder','leagues','champs','bar','access']::text[], true),
    (NEW.id, 'Secretary',    ARRAY['club','settings','fees','courts','banking','finance','members','users','visitors','ladder','leagues','champs','bar','access']::text[], true),
    (NEW.id, 'Club Captain', ARRAY['club','settings','fees','courts','banking','finance','members','users','visitors','ladder','leagues','champs','bar','access']::text[], true),
    (NEW.id, 'Finance',      ARRAY['fees','banking','finance','members','bar']::text[], false)
  ON CONFLICT (club_id, role_name) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 3) Backfill: ensure every existing club has a "Finance" role too.
INSERT INTO public.club_permission_roles (club_id, role_name, permissions, is_full_admin)
SELECT c.id, 'Finance', ARRAY['fees','banking','finance','members','bar']::text[], false
FROM public.clubs c
ON CONFLICT (club_id, role_name) DO NOTHING;
