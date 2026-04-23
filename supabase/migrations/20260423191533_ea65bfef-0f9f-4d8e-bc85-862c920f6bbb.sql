DO $$
DECLARE
  v_user_ids uuid[];
BEGIN
  SELECT array_agg(DISTINCT u.id)
  INTO v_user_ids
  FROM auth.users u
  WHERE u.email ILIKE '%samuel%vansittert%'
     OR u.email ILIKE '%samuel.vansittert%'
     OR u.email ILIKE '%svansittert%'
     OR u.id IN (
       SELECT user_id FROM public.club_members
       WHERE id = 'd44a9c91-9028-4a70-aa0f-fe4aef5025ab' AND user_id IS NOT NULL
     );

  IF v_user_ids IS NOT NULL THEN
    DELETE FROM public.user_roles WHERE user_id = ANY(v_user_ids);
    DELETE FROM public.profiles WHERE id = ANY(v_user_ids);
    UPDATE public.club_members SET user_id = NULL WHERE user_id = ANY(v_user_ids);
    DELETE FROM auth.users WHERE id = ANY(v_user_ids);
  END IF;
END $$;

UPDATE public.club_members
SET user_id = NULL,
    email = NULL,
    club_member_number = NULL,
    plays_league = true,
    enable_league_association_id = NULL,
    fee_category_id = NULL
WHERE id = 'd44a9c91-9028-4a70-aa0f-fe4aef5025ab';