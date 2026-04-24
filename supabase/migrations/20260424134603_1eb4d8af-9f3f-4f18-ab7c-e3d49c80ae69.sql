-- Grant Williams test cleanup so he can re-register through the league-number flow.
-- Keeps his NSA affiliation (NSF0401), admin role, and Men's 7th League 2026 registration.

DO $$
DECLARE
  v_user_id uuid := '37532b42-f3b3-4acf-b46a-7ed832fa4487';
  v_member_id uuid := '05c54f4c-36af-4f9b-a59c-e9f03a14ebae';
BEGIN
  -- Wipe contact + auth link on the club member row, keep role + identity
  UPDATE public.club_members
     SET user_id = NULL,
         email = NULL,
         phone = NULL,
         club_member_number = NULL
   WHERE id = v_member_id;

  -- Remove the profile row (was tied to the auth user)
  DELETE FROM public.profiles WHERE id = v_user_id;

  -- Remove the auth account so signUp can recreate it
  DELETE FROM auth.users WHERE id = v_user_id;
END $$;