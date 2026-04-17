
-- 1. Seed Lowveld Squash (LS) and Northern Inland League (NIL) as platform-level associations
INSERT INTO public.platform_league_associations (name, short_code, region, status)
VALUES
  ('Lowveld Squash', 'LS', 'Mpumalanga', 'active'),
  ('Northern Inland League', 'NIL', 'Northern Inland', 'active')
ON CONFLICT DO NOTHING;

-- 2. Function to sync a single club_member into platform_league_members
-- for every platform association the member's club is linked to.
CREATE OR REPLACE FUNCTION public.sync_member_to_platform_leagues()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first_name text;
  v_surname text;
  v_club_name text;
  v_assoc record;
  v_user_code text;
BEGIN
  -- If the member no longer plays league, remove their entries
  IF (TG_OP = 'UPDATE' AND OLD.plays_league = true AND NEW.plays_league = false) THEN
    DELETE FROM public.platform_league_members
    WHERE association_id IN (
      SELECT platform_association_id FROM public.league_associations
      WHERE club_id = NEW.club_id AND platform_association_id IS NOT NULL
    )
    AND user_code = COALESCE(NEW.club_member_number, 'CM-' || NEW.id::text);
    RETURN NEW;
  END IF;

  -- Only proceed for plays_league = true
  IF NEW.plays_league IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- Resolve name (split on first space)
  v_first_name := COALESCE(split_part(NEW.name, ' ', 1), '');
  v_surname := COALESCE(NULLIF(substring(NEW.name from position(' ' in NEW.name) + 1), ''), v_first_name);
  IF position(' ' in COALESCE(NEW.name, '')) = 0 THEN
    v_surname := v_first_name;
  END IF;

  SELECT name INTO v_club_name FROM public.clubs WHERE id = NEW.club_id;
  v_user_code := COALESCE(NEW.club_member_number, 'CM-' || NEW.id::text);

  -- For each platform association this club is linked to, upsert
  FOR v_assoc IN
    SELECT la.platform_association_id
    FROM public.league_associations la
    WHERE la.club_id = NEW.club_id
      AND la.platform_association_id IS NOT NULL
      AND la.active = true
  LOOP
    INSERT INTO public.platform_league_members
      (association_id, user_code, surname, first_name, club_name, user_state, league_matches, qualifications)
    VALUES
      (v_assoc.platform_association_id, v_user_code, v_surname, v_first_name,
       COALESCE(v_club_name, ''), 'ACTIVE', 0, NULL)
    ON CONFLICT (association_id, user_code) DO UPDATE SET
      surname = EXCLUDED.surname,
      first_name = EXCLUDED.first_name,
      club_name = EXCLUDED.club_name,
      user_state = 'ACTIVE',
      updated_at = now();
  END LOOP;

  RETURN NEW;
END;
$$;

-- Trigger on club_members
DROP TRIGGER IF EXISTS trg_sync_member_to_platform_leagues ON public.club_members;
CREATE TRIGGER trg_sync_member_to_platform_leagues
AFTER INSERT OR UPDATE OF plays_league, name, club_member_number ON public.club_members
FOR EACH ROW
EXECUTE FUNCTION public.sync_member_to_platform_leagues();

-- 3. When a club links a new association, backfill existing league members
CREATE OR REPLACE FUNCTION public.backfill_platform_members_on_assoc_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_name text;
  m record;
  v_first_name text;
  v_surname text;
  v_user_code text;
BEGIN
  IF NEW.platform_association_id IS NULL THEN RETURN NEW; END IF;

  SELECT name INTO v_club_name FROM public.clubs WHERE id = NEW.club_id;

  FOR m IN
    SELECT id, name, club_member_number FROM public.club_members
    WHERE club_id = NEW.club_id AND plays_league = true
  LOOP
    v_first_name := COALESCE(split_part(m.name, ' ', 1), '');
    IF position(' ' in COALESCE(m.name, '')) = 0 THEN
      v_surname := v_first_name;
    ELSE
      v_surname := substring(m.name from position(' ' in m.name) + 1);
    END IF;
    v_user_code := COALESCE(m.club_member_number, 'CM-' || m.id::text);

    INSERT INTO public.platform_league_members
      (association_id, user_code, surname, first_name, club_name, user_state)
    VALUES
      (NEW.platform_association_id, v_user_code, v_surname, v_first_name,
       COALESCE(v_club_name, ''), 'ACTIVE')
    ON CONFLICT (association_id, user_code) DO UPDATE SET
      surname = EXCLUDED.surname,
      first_name = EXCLUDED.first_name,
      club_name = EXCLUDED.club_name,
      updated_at = now();
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_backfill_platform_members_on_assoc_link ON public.league_associations;
CREATE TRIGGER trg_backfill_platform_members_on_assoc_link
AFTER INSERT OR UPDATE OF platform_association_id ON public.league_associations
FOR EACH ROW
WHEN (NEW.platform_association_id IS NOT NULL)
EXECUTE FUNCTION public.backfill_platform_members_on_assoc_link();

-- 4. One-time backfill: sync all currently-linked clubs' league members
DO $$
DECLARE
  rec record;
  v_club_name text;
  v_first_name text;
  v_surname text;
  v_user_code text;
BEGIN
  FOR rec IN
    SELECT cm.id, cm.name, cm.club_member_number, cm.club_id, la.platform_association_id, c.name AS club_name
    FROM public.club_members cm
    JOIN public.league_associations la ON la.club_id = cm.club_id
    JOIN public.clubs c ON c.id = cm.club_id
    WHERE cm.plays_league = true
      AND la.platform_association_id IS NOT NULL
      AND la.active = true
  LOOP
    v_first_name := COALESCE(split_part(rec.name, ' ', 1), '');
    IF position(' ' in COALESCE(rec.name, '')) = 0 THEN
      v_surname := v_first_name;
    ELSE
      v_surname := substring(rec.name from position(' ' in rec.name) + 1);
    END IF;
    v_user_code := COALESCE(rec.club_member_number, 'CM-' || rec.id::text);

    INSERT INTO public.platform_league_members
      (association_id, user_code, surname, first_name, club_name, user_state)
    VALUES
      (rec.platform_association_id, v_user_code, v_surname, v_first_name,
       COALESCE(rec.club_name, ''), 'ACTIVE')
    ON CONFLICT (association_id, user_code) DO UPDATE SET
      surname = EXCLUDED.surname,
      first_name = EXCLUDED.first_name,
      club_name = EXCLUDED.club_name,
      updated_at = now();
  END LOOP;
END $$;
