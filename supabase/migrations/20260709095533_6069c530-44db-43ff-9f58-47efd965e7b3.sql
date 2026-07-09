
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS currency_code text NOT NULL DEFAULT 'ZAR',
  ADD COLUMN IF NOT EXISTS currency_symbol text NOT NULL DEFAULT 'R';

-- Basic sanity: ISO codes are 3 uppercase letters. Enforce lightly via trigger
-- rather than a CHECK constraint so future additions don't require a migration.
CREATE OR REPLACE FUNCTION public.normalise_club_currency()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.currency_code IS NULL OR length(trim(NEW.currency_code)) = 0 THEN
    NEW.currency_code := 'ZAR';
  END IF;
  NEW.currency_code := upper(trim(NEW.currency_code));
  IF NEW.currency_symbol IS NULL OR length(trim(NEW.currency_symbol)) = 0 THEN
    NEW.currency_symbol := 'R';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalise_club_currency ON public.clubs;
CREATE TRIGGER trg_normalise_club_currency
  BEFORE INSERT OR UPDATE OF currency_code, currency_symbol ON public.clubs
  FOR EACH ROW EXECUTE FUNCTION public.normalise_club_currency();
