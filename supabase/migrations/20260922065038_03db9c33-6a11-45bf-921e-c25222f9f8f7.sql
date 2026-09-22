CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_subdomain      text;
  v_reg_type       text;
  v_lookup         text;
  v_club_id        uuid;
  v_target_member  uuid;
  v_via_league     boolean := false;
  v_linked         int := 0;
  v_phone          text;
  v_digits         text;
  v_has_admin      boolean;
  v_has_members     boolean;
BEGIN
  v_subdomain := NEW.raw_user_meta_data->>'club_subdomain';
  v_reg_type  := NEW.raw_user_meta_data->>'club_registration_type';
  v_lookup    := TRIM(COALESCE(NEW.raw_user_meta_data->>'name', ''));
  v_phone     := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'phone', '')), '');

  -- Always create the auth profile shell
  INSERT INTO public.profiles (id, name, email, phone)
  VALUES (NEW.id, v_lookup, NEW.email, v_phone);

  IF v_subdomain IS NOT NULL THEN
    SELECT id INTO v_club_id FROM public.clubs WHERE subdomain = v_subdomain LIMIT 1;
  END IF;

  -- Existing-member registration path
  IF v_reg_type = 'club_member' AND v_club_id IS NOT NULL AND v_lookup <> '' THEN
    -- 1. Try matching by club_member_number (case-insensitive)
    SELECT id INTO v_target_member
    FROM public.club_members
    WHERE club_id = v_club_id
      AND user_id IS NULL
      AND LOWER(club_member_number) = LOWER(v_lookup)
    LIMIT 1;

    -- 2. Fallback: match by league_association_number on member_league_registrations
    IF v_target_member IS NULL THEN
      SELECT cm.id INTO v_target_member
      FROM public.club_members cm
      JOIN public.member_league_registrations mlr ON mlr.club_member_id = cm.id
      WHERE cm.club_id = v_club_id
        AND cm.user_id IS NULL
        AND LOWER(mlr.league_association_number) = LOWER(v_lookup)
      LIMIT 1;
      IF v_target_member IS NOT NULL THEN
        v_via_league := true;
      END IF;
    END IF;

    IF v_target_member IS NOT NULL THEN
      UPDATE public.club_members
      SET user_id      = NEW.id,
          email        = COALESCE(NULLIF(TRIM(NEW.email), ''), email),
          plays_league = CASE WHEN v_via_league THEN true ELSE plays_league END,
          updated_at   = now()
      WHERE id = v_target_member;
      v_linked := 1;
    END IF;
  END IF;

  -- Fallback: link by matching email
  IF v_linked = 0 AND NEW.email IS NOT NULL THEN
    UPDATE public.club_members
    SET user_id = NEW.id,
        updated_at = now()
    WHERE LOWER(email) = LOWER(NEW.email)
      AND user_id IS NULL;
    GET DIAGNOSTICS v_linked = ROW_COUNT;
  END IF;

  -- Fallback: link by matching cellphone number (last 9 digits)
  IF v_linked = 0 AND v_phone IS NOT NULL THEN
    v_digits := regexp_replace(v_phone, '\D', '', 'g');
    IF length(v_digits) >= 9 THEN
      UPDATE public.club_members
      SET user_id = NEW.id, updated_at = now()
      WHERE user_id IS NULL
        AND phone IS NOT NULL
        AND right(regexp_replace(phone, '\D', '', 'g'), 9) = right(v_digits, 9);
      GET DIAGNOSTICS v_linked = ROW_COUNT;
    END IF;
  END IF;

  -- Nothing matched, but they signed up on a specific club's page: create the
  -- membership so they are never left without a club. Club owners/association
  -- owners get their membership from the club-creation flow instead.
  IF v_linked = 0
     AND v_club_id IS NOT NULL
     AND COALESCE(v_reg_type, 'club_member') NOT IN ('club_owner', 'association_owner')
  THEN
    SELECT EXISTS (SELECT 1 FROM public.club_members WHERE club_id = v_club_id AND role = 'admin'),
           EXISTS (SELECT 1 FROM public.club_members WHERE club_id = v_club_id AND user_id IS NOT NULL)
      INTO v_has_admin, v_has_members;

    INSERT INTO public.club_members (club_id, user_id, name, email, phone, role, status, is_pending_approval)
    VALUES (
      v_club_id,
      NEW.id,
      NULLIF(v_lookup, ''),
      NEW.email,
      v_phone,
      CASE WHEN NOT v_has_admin AND NOT v_has_members THEN 'admin'::club_member_role ELSE 'member'::club_member_role END,
      'active'::member_status,
      CASE WHEN NOT v_has_admin AND NOT v_has_members THEN false ELSE true END
    );
  END IF;

  RETURN NEW;
END;
$function$;