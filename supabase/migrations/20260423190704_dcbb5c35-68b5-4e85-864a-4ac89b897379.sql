
-- Restore the missing trigger on auth.users that creates the profile shell
-- and links the new user to their imported member row.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Reset Samuel for a clean retry
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

  UPDATE public.club_members
    SET user_id = NULL, club_member_number = NULL, email = NULL, phone = NULL,
        enable_league_association_id = NULL,
        plays_league = true
    WHERE id = 'd44a9c91-9028-4a70-aa0f-fe4aef5025ab';
END $$;
