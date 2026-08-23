-- Phase 3: competition category (mens / ladies / mixed / open) as a first-class attribute.

-- 1) leagues (season teams / competition rows)
ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.leagues DROP CONSTRAINT IF EXISTS leagues_category_check;
ALTER TABLE public.leagues ADD CONSTRAINT leagues_category_check
  CHECK (category IS NULL OR category IN ('mens','ladies','mixed','open'));

-- 2) league_associations (permanent competition identity)
ALTER TABLE public.league_associations ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.league_associations DROP CONSTRAINT IF EXISTS league_associations_category_check;
ALTER TABLE public.league_associations ADD CONSTRAINT league_associations_category_check
  CHECK (category IS NULL OR category IN ('mens','ladies','mixed','open'));

-- Mixed composition rule flag (opt-in; Open never restricts by gender)
ALTER TABLE public.league_associations
  ADD COLUMN IF NOT EXISTS require_mixed_pair boolean NOT NULL DEFAULT false;

-- 3) discipline gains 'hybrid'
ALTER TABLE public.league_associations DROP CONSTRAINT IF EXISTS league_associations_discipline_check;
ALTER TABLE public.league_associations ADD CONSTRAINT league_associations_discipline_check
  CHECK (discipline IN ('singles','doubles','hybrid'));

CREATE OR REPLACE FUNCTION public.rename_internal_league_association(
  _association_id uuid,
  _name text,
  _discipline text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id uuid;
  v_scope text;
  v_platform_id uuid;
  v_name text := btrim(coalesce(_name, ''));
BEGIN
  SELECT club_id, scope, platform_association_id
    INTO v_club_id, v_scope, v_platform_id
  FROM public.league_associations
  WHERE id = _association_id;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'League not found';
  END IF;

  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role)
          OR public.is_club_admin_or_permitted(auth.uid(), v_club_id, 'leagues')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_scope IS DISTINCT FROM 'internal' THEN
    RAISE EXCEPTION 'Only club-owned internal leagues can be renamed here';
  END IF;

  IF v_name = '' THEN
    RAISE EXCEPTION 'Name is required';
  END IF;

  IF _discipline IS NOT NULL AND _discipline NOT IN ('singles','doubles','hybrid') THEN
    RAISE EXCEPTION 'Invalid discipline';
  END IF;

  UPDATE public.league_associations
     SET name = v_name,
         discipline = COALESCE(_discipline, discipline),
         updated_at = now()
   WHERE id = _association_id;

  IF v_platform_id IS NOT NULL THEN
    UPDATE public.platform_league_associations
       SET name = v_name
     WHERE id = v_platform_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rename_internal_league_association(uuid, text, text) TO authenticated;

-- 4) Provable backfill ONLY: from an unambiguous NSA division label.
UPDATE public.leagues
   SET category = 'mens'
 WHERE category IS NULL AND division ~* '^\s*(men|mens|men''s)\b';

UPDATE public.leagues
   SET category = 'ladies'
 WHERE category IS NULL AND division ~* '^\s*(ladies|women|womens|women''s)\b';

UPDATE public.leagues
   SET category = 'mixed'
 WHERE category IS NULL AND division ~* '^\s*mixed\b';

UPDATE public.leagues
   SET category = 'open'
 WHERE category IS NULL AND division ~* '^\s*open\b';

-- 5) Uniqueness now includes the competition category as well as the division label.
DROP INDEX IF EXISTS public.leagues_assoc_season_div_code_uniq;
CREATE UNIQUE INDEX leagues_assoc_season_cat_code_uniq
  ON public.leagues (association_id, season_id, coalesce(division,''), coalesce(category,''), code)
  WHERE season_id IS NOT NULL AND code IS NOT NULL;

CREATE INDEX IF NOT EXISTS leagues_category_idx ON public.leagues (category);