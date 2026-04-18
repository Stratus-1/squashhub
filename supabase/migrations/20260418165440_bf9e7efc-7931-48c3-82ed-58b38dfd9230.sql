-- Backfill league_association_number on member_league_registrations from platform_league_members
WITH name_to_code AS (
  SELECT DISTINCT ON (cm.id, la.platform_association_id)
    cm.id AS club_member_id,
    la.platform_association_id,
    plm.user_code
  FROM public.club_members cm
  JOIN public.league_associations la
    ON la.club_id = cm.club_id AND la.platform_association_id IS NOT NULL
  JOIN public.platform_league_members plm
    ON plm.association_id = la.platform_association_id
   AND plm.user_code LIKE 'NSF%'
   AND lower(trim(plm.first_name)) = lower(trim(split_part(cm.name, ' ', 1)))
   AND lower(trim(plm.surname)) = lower(trim(
        CASE WHEN position(' ' in cm.name) = 0 THEN cm.name
             ELSE substring(cm.name from position(' ' in cm.name) + 1)
        END
      ))
  ORDER BY cm.id, la.platform_association_id, plm.user_code
),
reg_targets AS (
  SELECT mlr.id AS reg_id, ntc.user_code
  FROM public.member_league_registrations mlr
  JOIN public.leagues l ON l.id = mlr.league_id
  JOIN public.league_associations la2 ON la2.id = l.association_id
  JOIN name_to_code ntc
    ON ntc.club_member_id = mlr.club_member_id
   AND ntc.platform_association_id = la2.platform_association_id
  WHERE mlr.league_association_number IS NULL OR mlr.league_association_number = ''
)
UPDATE public.member_league_registrations mlr
SET league_association_number = rt.user_code
FROM reg_targets rt
WHERE mlr.id = rt.reg_id;

-- Auto-populate trigger for new/updated registrations
CREATE OR REPLACE FUNCTION public.populate_league_assoc_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_name text;
  v_first text;
  v_surname text;
  v_platform_assoc uuid;
  v_code text;
BEGIN
  IF NEW.league_association_number IS NOT NULL AND NEW.league_association_number <> '' THEN
    RETURN NEW;
  END IF;

  SELECT cm.name INTO v_member_name FROM public.club_members cm WHERE cm.id = NEW.club_member_id;
  IF v_member_name IS NULL THEN RETURN NEW; END IF;

  v_first := split_part(v_member_name, ' ', 1);
  IF position(' ' in v_member_name) = 0 THEN
    v_surname := v_member_name;
  ELSE
    v_surname := substring(v_member_name from position(' ' in v_member_name) + 1);
  END IF;

  SELECT la.platform_association_id INTO v_platform_assoc
  FROM public.leagues l
  JOIN public.league_associations la ON la.id = l.association_id
  WHERE l.id = NEW.league_id AND la.platform_association_id IS NOT NULL
  LIMIT 1;

  IF v_platform_assoc IS NULL THEN RETURN NEW; END IF;

  SELECT plm.user_code INTO v_code
  FROM public.platform_league_members plm
  WHERE plm.association_id = v_platform_assoc
    AND plm.user_code LIKE 'NSF%'
    AND lower(trim(plm.first_name)) = lower(trim(v_first))
    AND lower(trim(plm.surname)) = lower(trim(v_surname))
  LIMIT 1;

  IF v_code IS NOT NULL THEN
    NEW.league_association_number := v_code;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_populate_league_assoc_number ON public.member_league_registrations;
CREATE TRIGGER trg_populate_league_assoc_number
BEFORE INSERT OR UPDATE OF club_member_id, league_id ON public.member_league_registrations
FOR EACH ROW EXECUTE FUNCTION public.populate_league_assoc_number();