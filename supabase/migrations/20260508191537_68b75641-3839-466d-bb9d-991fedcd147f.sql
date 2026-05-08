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
    AND user_code IN (
      COALESCE(NULLIF(trim(NEW.club_member_number), ''), 'CM-' || NEW.id::text),
      'CM-' || NEW.id::text
    );
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

    IF v_user_code NOT ILIKE 'NSF%' AND EXISTS (
      SELECT 1
      FROM public.platform_league_members plm
      WHERE plm.association_id = v_assoc.platform_association_id
        AND plm.user_code ILIKE 'NSF%'
        AND lower(regexp_replace(trim(coalesce(plm.first_name, '')), '\s+', ' ', 'g')) = lower(regexp_replace(trim(coalesce(v_first_name, '')), '\s+', ' ', 'g'))
        AND lower(regexp_replace(trim(regexp_replace(coalesce(plm.surname, ''), '^\([^)]*\)\s*', '')), '\s+', ' ', 'g')) = lower(regexp_replace(trim(coalesce(v_surname, '')), '\s+', ' ', 'g'))
        AND lower(regexp_replace(trim(coalesce(plm.club_name, '')), '\s+', ' ', 'g')) = lower(regexp_replace(trim(coalesce(v_club_name, '')), '\s+', ' ', 'g'))
    ) THEN
      CONTINUE;
    END IF;

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

    IF v_user_code NOT ILIKE 'NSF%' AND EXISTS (
      SELECT 1
      FROM public.platform_league_members plm
      WHERE plm.association_id = NEW.platform_association_id
        AND plm.user_code ILIKE 'NSF%'
        AND lower(regexp_replace(trim(coalesce(plm.first_name, '')), '\s+', ' ', 'g')) = lower(regexp_replace(trim(coalesce(v_first_name, '')), '\s+', ' ', 'g'))
        AND lower(regexp_replace(trim(regexp_replace(coalesce(plm.surname, ''), '^\([^)]*\)\s*', '')), '\s+', ' ', 'g')) = lower(regexp_replace(trim(coalesce(v_surname, '')), '\s+', ' ', 'g'))
        AND lower(regexp_replace(trim(coalesce(plm.club_name, '')), '\s+', ' ', 'g')) = lower(regexp_replace(trim(coalesce(v_club_name, '')), '\s+', ' ', 'g'))
    ) THEN
      CONTINUE;
    END IF;

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