-- Change bootstrap admin email to danielmommsen2@gmail.com
-- - Backfill admin role for that user (if they already exist)
-- - Remove admin role from the previous email (if present)
-- - Update handle_new_user() bootstrap rule

DO $$
DECLARE
  new_admin_email text := 'danielmommsen2@gmail.com';
  old_admin_email text := 'danielmommsen@hotmail.com';
  new_admin_user_id uuid;
  old_admin_user_id uuid;
BEGIN
  SELECT id INTO new_admin_user_id
  FROM auth.users
  WHERE email = new_admin_email
  LIMIT 1;

  IF new_admin_user_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (new_admin_user_id, 'admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  SELECT id INTO old_admin_user_id
  FROM auth.users
  WHERE email = old_admin_email
  LIMIT 1;

  IF old_admin_user_id IS NOT NULL THEN
    DELETE FROM public.user_roles
    WHERE user_id = old_admin_user_id
      AND role = 'admin'::public.app_role;
  END IF;
END $$;

-- Update handle_new_user to bootstrap new admin email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  next_rank integer;
BEGIN
  -- serialize rank assignment to avoid duplicates
  PERFORM pg_advisory_xact_lock(923401);

  SELECT (COALESCE(MAX(rank), 0) + 1)
  INTO next_rank
  FROM public.profiles
  WHERE rank IS NOT NULL;

  IF next_rank > 20 THEN
    next_rank := NULL;
  END IF;

  INSERT INTO public.profiles (id, name, email, rank)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    NEW.email,
    next_rank
  );

  IF NEW.email = 'danielmommsen2@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

