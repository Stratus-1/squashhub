
-- Default permission roles for every club
DO $$
DECLARE
  c record;
  full_perms text[] := ARRAY['club','fees','banking','members','visitors','leagues','bar','access','champs','ladder','users','finance','courts','settings'];
  finance_perms text[] := ARRAY['fees','banking','members','bar','finance'];
BEGIN
  FOR c IN SELECT id FROM public.clubs LOOP
    INSERT INTO public.club_permission_roles (club_id, role_name, permissions)
    VALUES
      (c.id, 'Full Admin', full_perms),
      (c.id, 'Chairman', full_perms),
      (c.id, 'Secretary', full_perms),
      (c.id, 'Club Captain', full_perms),
      (c.id, 'Captain', full_perms),
      (c.id, 'Finance', finance_perms)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- Add unique constraint if missing so ON CONFLICT works for future inserts
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'club_permission_roles_club_role_unique'
  ) THEN
    BEGIN
      ALTER TABLE public.club_permission_roles
        ADD CONSTRAINT club_permission_roles_club_role_unique UNIQUE (club_id, role_name);
    EXCEPTION WHEN unique_violation THEN
      -- duplicates exist, skip
      NULL;
    END;
  END IF;
END $$;

-- Replace the default-finance-role trigger with a broader seeding function
CREATE OR REPLACE FUNCTION public.create_default_permission_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    (NEW.id, 'Finance', finance_perms)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_default_finance_role ON public.clubs;
DROP TRIGGER IF EXISTS trg_create_default_permission_roles ON public.clubs;
CREATE TRIGGER trg_create_default_permission_roles
AFTER INSERT ON public.clubs
FOR EACH ROW EXECUTE FUNCTION public.create_default_permission_roles();

-- Helper to assign a role to a member (creates the permission record if missing)
CREATE OR REPLACE FUNCTION public.assign_role_to_member(_club_id uuid, _member_id uuid, _role_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role_id uuid;
BEGIN
  IF _member_id IS NULL THEN RETURN; END IF;
  SELECT id INTO v_role_id FROM public.club_permission_roles
    WHERE club_id = _club_id AND role_name = _role_name LIMIT 1;
  IF v_role_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.club_member_permissions (club_member_id, permission_role_id, custom_permissions)
  VALUES (_member_id, v_role_id, '{}')
  ON CONFLICT (club_member_id) DO UPDATE
    SET permission_role_id = EXCLUDED.permission_role_id,
        updated_at = now()
  WHERE public.club_member_permissions.permission_role_id IS DISTINCT FROM EXCLUDED.permission_role_id;
END;
$$;

-- Trigger on clubs: when chairman/secretary/club_captain officer is set, auto-assign matching role
CREATE OR REPLACE FUNCTION public.auto_assign_officer_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_assign_officer_roles ON public.clubs;
CREATE TRIGGER trg_auto_assign_officer_roles
AFTER INSERT OR UPDATE OF chairman_member_id, secretary_member_id, club_captain_member_id ON public.clubs
FOR EACH ROW EXECUTE FUNCTION public.auto_assign_officer_roles();

-- Backfill: assign officer roles for existing clubs
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT id, chairman_member_id, secretary_member_id, club_captain_member_id FROM public.clubs LOOP
    PERFORM public.assign_role_to_member(c.id, c.chairman_member_id, 'Chairman');
    PERFORM public.assign_role_to_member(c.id, c.secretary_member_id, 'Secretary');
    PERFORM public.assign_role_to_member(c.id, c.club_captain_member_id, 'Club Captain');
  END LOOP;
END $$;

-- Update member_has_permission: remove hardcoded chairman/secretary/club_captain bypass
-- so admins can override these officers' permissions if desired.
CREATE OR REPLACE FUNCTION public.member_has_permission(_member_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.id = _member_id AND cm.role IN ('captain', 'admin')
    )
    OR EXISTS (
      SELECT 1 FROM public.club_member_permissions cmp
      WHERE cmp.club_member_id = _member_id
        AND _permission = ANY(cmp.custom_permissions)
    )
    OR EXISTS (
      SELECT 1 FROM public.club_member_permissions cmp
      JOIN public.club_permission_roles cpr ON cpr.id = cmp.permission_role_id
      WHERE cmp.club_member_id = _member_id
        AND _permission = ANY(cpr.permissions)
    )
$$;
