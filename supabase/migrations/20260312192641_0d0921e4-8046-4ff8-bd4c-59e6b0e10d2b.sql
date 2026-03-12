
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  next_rank integer;
BEGIN
  PERFORM pg_advisory_xact_lock(923401);

  SELECT (COALESCE(MAX(rank), 0) + 1)
  INTO next_rank
  FROM public.profiles
  WHERE rank IS NOT NULL;

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
$function$;
