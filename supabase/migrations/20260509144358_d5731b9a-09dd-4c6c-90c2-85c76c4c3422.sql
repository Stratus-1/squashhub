
-- Seed defaults for existing clubs
INSERT INTO public.club_permission_roles (club_id, role_name, permissions, is_full_admin)
SELECT c.id, r.role_name, r.permissions, r.is_full_admin
FROM public.clubs c
CROSS JOIN (VALUES
  ('Chairman',     ARRAY['club','settings','fees','courts','banking','finance','members','users','visitors','ladder','leagues','champs','bar','access']::text[], true),
  ('Secretary',    ARRAY['club','settings','fees','courts','banking','finance','members','users','visitors','ladder','leagues','champs','bar','access']::text[], true),
  ('Club Captain', ARRAY['club','settings','fees','courts','banking','finance','members','users','visitors','ladder','leagues','champs','bar','access']::text[], true),
  ('Finance',      ARRAY['fees','banking','finance','members','bar']::text[], false)
) AS r(role_name, permissions, is_full_admin)
WHERE NOT EXISTS (
  SELECT 1 FROM public.club_permission_roles existing
  WHERE existing.club_id = c.id AND lower(existing.role_name) = lower(r.role_name)
);

-- Trigger to seed defaults for new clubs
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
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_default_permission_roles ON public.clubs;
CREATE TRIGGER trg_seed_default_permission_roles
AFTER INSERT ON public.clubs
FOR EACH ROW EXECUTE FUNCTION public.seed_default_permission_roles();
