-- 1. Also match on phone number when linking accounts to club member records
CREATE OR REPLACE FUNCTION public.auto_link_members_on_profile_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_digits text;
BEGIN
  IF NEW.email IS NOT NULL AND NEW.email <> '' THEN
    UPDATE public.club_members
    SET user_id = NEW.id, updated_at = now()
    WHERE lower(email) = lower(NEW.email)
      AND user_id IS NULL;
  END IF;

  v_digits := regexp_replace(coalesce(NEW.phone, ''), '\D', '', 'g');
  IF length(v_digits) >= 9 THEN
    UPDATE public.club_members
    SET user_id = NEW.id, updated_at = now()
    WHERE user_id IS NULL
      AND phone IS NOT NULL
      AND right(regexp_replace(phone, '\D', '', 'g'), 9) = right(v_digits, 9);
  END IF;

  RETURN NEW;
END;
$function$;

-- 2. Let a signed-in person with no club ask to join one
CREATE OR REPLACE FUNCTION public.join_club_request(p_club_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_name text;
  v_phone text;
  v_digits text;
  v_existing uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clubs WHERE id = p_club_id) THEN
    RAISE EXCEPTION 'Club not found';
  END IF;

  SELECT email, name, phone INTO v_email, v_name, v_phone
  FROM public.profiles WHERE id = v_uid;

  IF EXISTS (SELECT 1 FROM public.club_members WHERE club_id = p_club_id AND user_id = v_uid) THEN
    RETURN 'already_member';
  END IF;

  v_digits := regexp_replace(coalesce(v_phone, ''), '\D', '', 'g');

  SELECT id INTO v_existing
  FROM public.club_members
  WHERE club_id = p_club_id
    AND user_id IS NULL
    AND (
      (v_email IS NOT NULL AND v_email <> '' AND lower(email) = lower(v_email))
      OR (length(v_digits) >= 9 AND phone IS NOT NULL
          AND right(regexp_replace(phone, '\D', '', 'g'), 9) = right(v_digits, 9))
    )
  ORDER BY joined_at ASC
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    UPDATE public.club_members
       SET user_id = v_uid, updated_at = now()
     WHERE id = v_existing;
    RETURN 'linked';
  END IF;

  INSERT INTO public.club_members (club_id, user_id, name, email, phone, role, is_pending_approval)
  VALUES (p_club_id, v_uid, coalesce(v_name, v_email), v_email, v_phone, 'member'::public.club_member_role, true);

  RETURN 'pending';
END;
$function$;

GRANT EXECUTE ON FUNCTION public.join_club_request(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.join_club_request(uuid) FROM anon;

-- 3. Unaffiliated sign-ups for the platform adoption screen
CREATE OR REPLACE FUNCTION public.platform_unaffiliated_users()
RETURNS TABLE (
  user_id uuid,
  name text,
  email text,
  phone text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.name, p.email, p.phone, p.created_at
  FROM public.profiles p
  WHERE public.is_platform_admin(auth.uid())
    AND NOT EXISTS (SELECT 1 FROM public.club_members m WHERE m.user_id = p.id)
  ORDER BY p.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.platform_unaffiliated_users() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.platform_unaffiliated_users() FROM anon;

-- 4. Platform admin can attach an unaffiliated person to a club
CREATE OR REPLACE FUNCTION public.platform_attach_user_to_club(p_user_id uuid, p_club_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email text; v_name text; v_phone text; v_digits text; v_existing uuid;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT email, name, phone INTO v_email, v_name, v_phone FROM public.profiles WHERE id = p_user_id;
  IF v_email IS NULL AND v_name IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF EXISTS (SELECT 1 FROM public.club_members WHERE club_id = p_club_id AND user_id = p_user_id) THEN
    RETURN 'already_member';
  END IF;

  v_digits := regexp_replace(coalesce(v_phone, ''), '\D', '', 'g');

  SELECT id INTO v_existing
  FROM public.club_members
  WHERE club_id = p_club_id
    AND user_id IS NULL
    AND (
      (v_email IS NOT NULL AND v_email <> '' AND lower(email) = lower(v_email))
      OR (length(v_digits) >= 9 AND phone IS NOT NULL
          AND right(regexp_replace(phone, '\D', '', 'g'), 9) = right(v_digits, 9))
    )
  ORDER BY joined_at ASC
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    UPDATE public.club_members SET user_id = p_user_id, updated_at = now() WHERE id = v_existing;
    RETURN 'linked';
  END IF;

  INSERT INTO public.club_members (club_id, user_id, name, email, phone, role)
  VALUES (p_club_id, p_user_id, coalesce(v_name, v_email), v_email, v_phone, 'member'::public.club_member_role);

  RETURN 'added';
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_attach_user_to_club(uuid, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.platform_attach_user_to_club(uuid, uuid) FROM anon;