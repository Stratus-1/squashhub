
-- Add name and email directly to club_members for pre-registration
ALTER TABLE public.club_members ADD COLUMN name text;
ALTER TABLE public.club_members ADD COLUMN email text;

-- Make user_id nullable so admins can add members before they sign up
ALTER TABLE public.club_members ALTER COLUMN user_id DROP NOT NULL;

-- Add unique constraint on club_id + email for upsert support
ALTER TABLE public.club_members ADD CONSTRAINT club_members_club_id_email_key UNIQUE (club_id, email);

-- Update handle_new_user to auto-link pending club members on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  next_rank integer;
BEGIN
  PERFORM pg_advisory_xact_lock(923401);

  SELECT (COALESCE(MAX(rank), 0) + 1)
  INTO next_rank
  FROM public.profiles
  WHERE rank IS NOT NULL;

  IF next_rank > 20 THEN
    next_rank := NULL;
  END IF;

  INSERT INTO public.profiles (id, name, email, phone, rank)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    NEW.email,
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'phone', '')), ''),
    next_rank
  );

  -- Auto-link any pre-registered club memberships
  UPDATE public.club_members
  SET user_id = NEW.id
  WHERE email = NEW.email
    AND user_id IS NULL;

  RETURN NEW;
END;
$$;
