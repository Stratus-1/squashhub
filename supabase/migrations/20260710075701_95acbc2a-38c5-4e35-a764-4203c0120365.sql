CREATE OR REPLACE FUNCTION public.fill_club_member_email_from_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.email IS NULL OR btrim(NEW.email) = '' OR NEW.email NOT LIKE '%@%')
     AND NEW.user_id IS NOT NULL THEN
    SELECT COALESCE(p.email, au.email)
      INTO NEW.email
    FROM auth.users au
    LEFT JOIN public.profiles p ON p.id = au.id
    WHERE au.id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_club_member_email ON public.club_members;
CREATE TRIGGER trg_fill_club_member_email
BEFORE INSERT OR UPDATE OF user_id, email ON public.club_members
FOR EACH ROW
EXECUTE FUNCTION public.fill_club_member_email_from_auth();