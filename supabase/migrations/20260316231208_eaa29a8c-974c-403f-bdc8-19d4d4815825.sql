
-- When a profile is created or its email changes, link any unlinked club_members with the same email
CREATE OR REPLACE FUNCTION public.auto_link_members_on_profile_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NOT NULL AND NEW.email <> '' THEN
    UPDATE public.club_members
    SET user_id = NEW.id, updated_at = now()
    WHERE lower(email) = lower(NEW.email)
      AND user_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_link_members_on_profile_change
  AFTER INSERT OR UPDATE OF email ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_link_members_on_profile_change();

-- When a club_member is created or its email changes, link to an existing user/profile with that email
CREATE OR REPLACE FUNCTION public.auto_link_member_on_email_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched_user_id uuid;
BEGIN
  IF NEW.email IS NOT NULL AND NEW.email <> '' AND NEW.user_id IS NULL THEN
    SELECT p.id INTO matched_user_id
    FROM public.profiles p
    WHERE lower(p.email) = lower(NEW.email)
    LIMIT 1;

    IF matched_user_id IS NOT NULL THEN
      NEW.user_id := matched_user_id;
      NEW.updated_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_link_member_on_email_change
  BEFORE INSERT OR UPDATE OF email ON public.club_members
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_link_member_on_email_change();
