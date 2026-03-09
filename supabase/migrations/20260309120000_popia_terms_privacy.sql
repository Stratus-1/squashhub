-- POPIA: record legal document acceptance timestamps on signup.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS privacy_accepted_at timestamptz;

-- Extend handle_new_user() to capture acceptance timestamps from auth user metadata.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  next_rank integer;
  terms_ts timestamptz;
  privacy_ts timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(923401);

  SELECT (COALESCE(MAX(rank), 0) + 1)
  INTO next_rank
  FROM public.profiles
  WHERE rank IS NOT NULL;

  IF next_rank > 20 THEN
    next_rank := NULL;
  END IF;

  terms_ts := NULLIF(COALESCE(NEW.raw_user_meta_data->>'terms_accepted_at', ''), '')::timestamptz;
  privacy_ts := NULLIF(COALESCE(NEW.raw_user_meta_data->>'privacy_accepted_at', ''), '')::timestamptz;

  INSERT INTO public.profiles (id, name, email, phone, rank, terms_accepted_at, privacy_accepted_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    NEW.email,
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'phone', '')), ''),
    next_rank,
    terms_ts,
    privacy_ts
  );

  RETURN NEW;
END;
$$;

