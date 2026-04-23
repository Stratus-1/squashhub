DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = 'samuelvansittert1995@gmail.com' LIMIT 1;
  IF v_uid IS NOT NULL THEN
    DELETE FROM public.user_roles WHERE user_id = v_uid;
    DELETE FROM public.profiles WHERE id = v_uid;
    -- Unlink any club_members still pointing at this auth user (safety)
    UPDATE public.club_members SET user_id = NULL WHERE user_id = v_uid;
    DELETE FROM auth.users WHERE id = v_uid;
  END IF;
END $$;