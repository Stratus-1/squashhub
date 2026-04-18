-- Update handle_new_user trigger so club members can register using either
-- their club_member_number OR their league number (NSF...). The 'name' field
-- in user metadata is reused as the lookup token for club_member registrations.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_subdomain text;
  v_reg_type  text;
  v_lookup    text;
  v_club_id   uuid;
  v_linked    int := 0;
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

  -- If this is an "existing member" registration, try linking by member/league number
  IF v_reg_type = 'club_member' AND v_subdomain IS NOT NULL AND v_lookup <> '' THEN
    SELECT id INTO v_club_id FROM public.clubs WHERE subdomain = v_subdomain LIMIT 1;

    IF v_club_id IS NOT NULL THEN
      -- Match by club_member_number (case-insensitive) within the club
      UPDATE public.club_members
      SET user_id = NEW.id,
          email   = COALESCE(NULLIF(TRIM(NEW.email), ''), email)
      WHERE club_id = v_club_id
        AND user_id IS NULL
        AND LOWER(club_member_number) = LOWER(v_lookup);
      GET DIAGNOSTICS v_linked = ROW_COUNT;
    END IF;
  END IF;

  -- Fallback / additional link: any pre-registered membership with a matching email
  IF v_linked = 0 THEN
    UPDATE public.club_members
    SET user_id = NEW.id
    WHERE LOWER(email) = LOWER(NEW.email)
      AND user_id IS NULL;
  END IF;

  RETURN NEW;
END;
$function$;