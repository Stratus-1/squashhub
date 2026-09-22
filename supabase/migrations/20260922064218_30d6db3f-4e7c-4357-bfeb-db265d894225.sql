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
  v_new_id uuid;
  v_first boolean;
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

  -- Nobody signed up at this club yet and no admin exists -> first person in.
  SELECT NOT EXISTS (
    SELECT 1 FROM public.club_members
    WHERE club_id = p_club_id AND (user_id IS NOT NULL OR role = 'admin'::public.club_member_role)
  ) INTO v_first;

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
       SET user_id = v_uid,
           role = CASE WHEN v_first THEN 'admin'::public.club_member_role ELSE role END,
           updated_at = now()
     WHERE id = v_existing;
    RETURN CASE WHEN v_first THEN 'linked_admin' ELSE 'linked' END;
  END IF;

  INSERT INTO public.club_members (club_id, user_id, name, email, phone, role, is_pending_approval)
  VALUES (
    p_club_id, v_uid, coalesce(v_name, v_email), v_email, v_phone,
    CASE WHEN v_first THEN 'admin'::public.club_member_role ELSE 'member'::public.club_member_role END,
    NOT v_first
  )
  RETURNING id INTO v_new_id;

  RETURN CASE WHEN v_first THEN 'joined_admin' ELSE 'pending' END;
END;
$function$;