-- Extend handle_new_user so the member-lookup token (carried in metadata.name)
-- can match EITHER club_member_number OR a league_association_number.
-- When matched via league number, also force plays_league = true.

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
BEGIN
  v_subdomain := NEW.raw_user_meta_data->>'club_subdomain';
  v_reg_type  := NEW.raw_user_meta_data->>'club_registration_type';
  v_lookup    := TRIM(COALESCE(NEW.raw_user_meta_data->>'name', ''));

  -- Always create the auth profile shell
  INSERT INTO public.profiles (id, name, email, phone)
  VALUES (
    NEW.id,
    v_lookup,
    NEW.email,
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'phone', '')), '')
  );

  -- Existing-member registration path
  IF v_reg_type = 'club_member' AND v_subdomain IS NOT NULL AND v_lookup <> '' THEN
    SELECT id INTO v_club_id FROM public.clubs WHERE subdomain = v_subdomain LIMIT 1;

    IF v_club_id IS NOT NULL THEN
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
  END IF;

  -- Fallback for any other case: link by matching email
  IF v_linked = 0 THEN
    UPDATE public.club_members
    SET user_id = NEW.id,
        updated_at = now()
    WHERE LOWER(email) = LOWER(NEW.email)
      AND user_id IS NULL;
  END IF;

  RETURN NEW;
END;
$function$;