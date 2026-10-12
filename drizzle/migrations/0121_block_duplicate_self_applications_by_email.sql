CREATE OR REPLACE FUNCTION public.club_members_block_duplicate()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_name text := lower(regexp_replace(coalesce(NEW.name, ''), '[^a-zA-Z]', '', 'g'));
  v_email text := lower(trim(coalesce(NEW.email, '')));
  v_id text := regexp_replace(coalesce(NEW.id_number, ''), '\D', '', 'g');
  v_self boolean := NEW.user_id IS NOT NULL AND NEW.user_id = auth.uid();
  v_home text;
BEGIN
  -- Resolve the login email first: the email-fill trigger runs after this one,
  -- so self sign-ups used to arrive here without an email and slip through.
  IF v_email NOT LIKE '%@%' AND NEW.user_id IS NOT NULL THEN
    SELECT lower(trim(COALESCE(p.email, au.email))) INTO v_email
      FROM auth.users au LEFT JOIN public.profiles p ON p.id = au.id
     WHERE au.id = NEW.user_id;
    v_email := coalesce(v_email, '');
  END IF;

  IF v_name <> '' AND EXISTS (
    SELECT 1 FROM public.club_members m
     WHERE m.club_id = NEW.club_id
       AND coalesce(m.status::text, 'active') <> 'resigned'
       AND lower(regexp_replace(coalesce(m.name, ''), '[^a-zA-Z]', '', 'g')) = v_name
       AND ((NEW.user_id IS NOT NULL AND m.user_id = NEW.user_id)
         OR (v_email <> '' AND lower(trim(coalesce(m.email, ''))) = v_email))
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_MEMBER: this person already has a record at this club'
      USING ERRCODE = 'unique_violation';
  END IF;

  -- Self-applications: same login or same email at this club = same person,
  -- whatever name spelling was typed. Families sharing an email stay allowed
  -- when both records carry different 13-digit SA ID numbers.
  IF v_self AND NEW.role::text <> 'visitor' AND EXISTS (
    SELECT 1 FROM public.club_members m
     WHERE m.club_id = NEW.club_id
       AND coalesce(m.status::text, 'active') <> 'resigned'
       AND m.role::text <> 'visitor'
       AND ( m.user_id = NEW.user_id
          OR (v_email <> '' AND lower(trim(coalesce(m.email, ''))) = v_email
              AND NOT (length(v_id) = 13
                       AND length(regexp_replace(coalesce(m.id_number,''), '\D', '', 'g')) = 13
                       AND regexp_replace(m.id_number, '\D', '', 'g') <> v_id)))
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_MEMBER: this person already has a record at this club'
      USING ERRCODE = 'unique_violation';
  END IF;

  IF NEW.role::text = 'visitor' AND NEW.user_id IS NOT NULL THEN
    SELECT coalesce(c.subdomain, c.name) INTO v_home
      FROM public.club_members m JOIN public.clubs c ON c.id = m.club_id
     WHERE m.user_id = NEW.user_id AND m.club_id <> NEW.club_id
       AND m.role::text <> 'visitor'
       AND coalesce(m.status::text, 'active') = 'active'
       AND lower(regexp_replace(coalesce(m.name, ''), '[^a-zA-Z]', '', 'g')) = v_name
     LIMIT 1;
    IF v_home IS NOT NULL THEN
      RAISE EXCEPTION 'ALREADY_MEMBER_ELSEWHERE:%', v_home USING ERRCODE = 'unique_violation';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.ensure_person_for_club_member()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_person uuid;
  v_id text := CASE WHEN NEW.id_number IS NOT NULL THEN regexp_replace(NEW.id_number, '\D', '', 'g') END;
  v_is_visitor boolean;
  v_email text := NEW.email;
BEGIN
  IF NEW.person_id IS NOT NULL THEN RETURN NEW; END IF;

  v_is_visitor := (NEW.role = 'visitor'::club_member_role)
    OR (NEW.home_club_id IS NOT NULL)
    OR (COALESCE(NEW.home_club_name,'') <> '')
    OR EXISTS (SELECT 1 FROM public.member_fee_categories fc
                WHERE fc.id = NEW.fee_category_id AND fc.name ILIKE '%visitor%');
  IF v_is_visitor THEN RETURN NEW; END IF;

  -- This trigger runs before the email-fill trigger; resolve the login email here.
  IF (v_email IS NULL OR v_email NOT LIKE '%@%') AND NEW.user_id IS NOT NULL THEN
    SELECT COALESCE(p.email, au.email) INTO v_email
      FROM auth.users au LEFT JOIN public.profiles p ON p.id = au.id
     WHERE au.id = NEW.user_id;
  END IF;

  IF v_id IS NOT NULL AND length(v_id) = 13 THEN
    SELECT person_id INTO v_person FROM public.people_private WHERE id_number = v_id LIMIT 1;
  END IF;

  IF v_person IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT id INTO v_person FROM public.people WHERE auth_user_id = NEW.user_id AND merged_into_person_id IS NULL LIMIT 1;
  END IF;

  IF v_person IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT m.person_id INTO v_person FROM public.club_members m
     WHERE m.user_id = NEW.user_id AND m.person_id IS NOT NULL LIMIT 1;
  END IF;

  IF v_person IS NULL AND v_email IS NOT NULL AND v_email <> '' THEN
    SELECT id INTO v_person FROM public.people WHERE lower(email) = lower(v_email) AND merged_into_person_id IS NULL LIMIT 1;
  END IF;

  IF v_person IS NULL THEN
    INSERT INTO public.people (full_name, gender, email, phone, auth_user_id)
    VALUES (coalesce(NEW.name,'Unknown'), NEW.gender, v_email, NEW.phone, NEW.user_id)
    RETURNING id INTO v_person;

    UPDATE public.people SET national_player_number = 'SSA' || lpad((
      coalesce((SELECT max(nullif(regexp_replace(national_player_number,'\D','','g'),'')::bigint) FROM public.people), 0) + 1)::text, 6, '0')
    WHERE id = v_person;
  END IF;

  IF v_id IS NOT NULL AND length(v_id) = 13 THEN
    INSERT INTO public.people_private (person_id, id_number) VALUES (v_person, v_id)
    ON CONFLICT (person_id) DO UPDATE SET id_number = coalesce(public.people_private.id_number, EXCLUDED.id_number);
  END IF;

  NEW.person_id := v_person;
  RETURN NEW;
END;
$function$;