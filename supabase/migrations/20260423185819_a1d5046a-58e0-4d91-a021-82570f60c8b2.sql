
-- 1) Drop the 5-arg overload to remove PostgREST ambiguity.
--    The 6-arg version (with _club_member_number) is the one we want to use.
DROP FUNCTION IF EXISTS public.claim_member_by_league_number(uuid, text, text, text, uuid);

-- 2) Reset Samuel's test data
DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = 'samuelvansittert1995@gmail.com' LIMIT 1;
  IF v_uid IS NOT NULL THEN
    DELETE FROM public.user_roles WHERE user_id = v_uid;
    DELETE FROM public.profiles WHERE id = v_uid;
    UPDATE public.club_members
      SET user_id = NULL, club_member_number = NULL, email = NULL, phone = NULL,
          enable_league_association_id = NULL
      WHERE user_id = v_uid;
    DELETE FROM auth.users WHERE id = v_uid;
  END IF;

  -- Also ensure Samuel's imported member row is in a clean unlinked state
  UPDATE public.club_members
    SET user_id = NULL, club_member_number = NULL, email = NULL, phone = NULL,
        enable_league_association_id = NULL,
        plays_league = true
    WHERE id = 'd44a9c91-9028-4a70-aa0f-fe4aef5025ab';
END $$;
