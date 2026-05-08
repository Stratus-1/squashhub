-- 1. Backfill club_members.club_member_number from member_association_affiliations
UPDATE public.club_members cm
SET club_member_number = maa.league_association_number,
    updated_at = now()
FROM public.member_association_affiliations maa
WHERE maa.club_member_id = cm.id
  AND maa.league_association_number IS NOT NULL
  AND maa.league_association_number <> ''
  AND (cm.club_member_number IS NULL OR cm.club_member_number = '');

-- 2. Delete duplicate platform_league_members rows: remove CM-<uuid> rows
--    where an NSA-coded row exists for the same person in the same association.
WITH dup AS (
  SELECT plm_cm.id AS cm_row_id
  FROM public.platform_league_members plm_cm
  JOIN public.club_members cm
    ON plm_cm.user_code = 'CM-' || cm.id::text
  JOIN public.league_associations la
    ON la.club_id = cm.club_id
   AND la.platform_association_id = plm_cm.association_id
  JOIN public.member_association_affiliations maa
    ON maa.club_member_id = cm.id
   AND maa.association_id = la.id
   AND maa.league_association_number IS NOT NULL
   AND maa.league_association_number <> ''
  JOIN public.platform_league_members plm_nsa
    ON plm_nsa.association_id = plm_cm.association_id
   AND plm_nsa.user_code = maa.league_association_number
  WHERE plm_cm.user_code LIKE 'CM-%'
)
DELETE FROM public.platform_league_members
WHERE id IN (SELECT cm_row_id FROM dup);

-- 3. Update sync_member_to_platform_leagues to prefer NSA number from affiliation
CREATE OR REPLACE FUNCTION public.sync_member_to_platform_leagues()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_first_name text;
  v_surname text;
  v_club_name text;
  v_assoc record;
  v_user_code text;
  v_nsa_number text;
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.plays_league = true AND NEW.plays_league = false) THEN
    DELETE FROM public.platform_league_members
    WHERE association_id IN (
      SELECT platform_association_id FROM public.league_associations
      WHERE club_id = NEW.club_id AND platform_association_id IS NOT NULL
    )
    AND user_code = COALESCE(NEW.club_member_number, 'CM-' || NEW.id::text);
    RETURN NEW;
  END IF;

  IF NEW.plays_league IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  v_first_name := COALESCE(split_part(NEW.name, ' ', 1), '');
  v_surname := COALESCE(NULLIF(substring(NEW.name from position(' ' in NEW.name) + 1), ''), v_first_name);
  IF position(' ' in COALESCE(NEW.name, '')) = 0 THEN
    v_surname := v_first_name;
  END IF;

  SELECT name INTO v_club_name FROM public.clubs WHERE id = NEW.club_id;

  FOR v_assoc IN
    SELECT la.platform_association_id, la.id AS local_assoc_id
    FROM public.league_associations la
    WHERE la.club_id = NEW.club_id
      AND la.platform_association_id IS NOT NULL
      AND la.active = true
  LOOP
    -- Prefer the league_association_number from this member's affiliation for
    -- this specific association; then fall back to club_member_number; then a
    -- synthetic CM-<uuid> code.
    SELECT NULLIF(trim(maa.league_association_number), '')
    INTO v_nsa_number
    FROM public.member_association_affiliations maa
    WHERE maa.club_member_id = NEW.id
      AND maa.association_id = v_assoc.local_assoc_id
    LIMIT 1;

    v_user_code := COALESCE(
      v_nsa_number,
      NULLIF(trim(NEW.club_member_number), ''),
      'CM-' || NEW.id::text
    );

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
$function$;

-- 4. Update backfill_platform_members_on_assoc_link similarly
CREATE OR REPLACE FUNCTION public.backfill_platform_members_on_assoc_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_club_name text;
  m record;
  v_first_name text;
  v_surname text;
  v_user_code text;
  v_nsa_number text;
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

    SELECT NULLIF(trim(maa.league_association_number), '')
    INTO v_nsa_number
    FROM public.member_association_affiliations maa
    WHERE maa.club_member_id = m.id
      AND maa.association_id = NEW.id
    LIMIT 1;

    v_user_code := COALESCE(
      v_nsa_number,
      NULLIF(trim(m.club_member_number), ''),
      'CM-' || m.id::text
    );

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
$function$;