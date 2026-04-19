
-- 1. Add the annual league fee field on the association tenant (clubs row)
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS league_member_annual_fee numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS league_fee_due_month integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.clubs.league_member_annual_fee IS
  'For tenant_type=association: the annual fee per affiliated-club member who plays in this league. Propagates to each affiliated club''s league_associations row.';

-- 2. Function to sync association fee changes down to all affiliated clubs
CREATE OR REPLACE FUNCTION public.sync_assoc_fee_to_affiliated_clubs()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only act for association tenants whose fee or due month changed
  IF NEW.tenant_type <> 'association' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.league_member_annual_fee IS NOT DISTINCT FROM OLD.league_member_annual_fee
     AND NEW.league_fee_due_month IS NOT DISTINCT FROM OLD.league_fee_due_month
     AND NEW.name IS NOT DISTINCT FROM OLD.name THEN
    RETURN NEW;
  END IF;

  UPDATE public.league_associations la
  SET fee_annual = NEW.league_member_annual_fee,
      fee_due_month = NEW.league_fee_due_month,
      due_day = COALESCE(la.due_day, 1),
      name = NEW.name,
      updated_at = now()
  FROM public.association_affiliated_clubs aac
  WHERE aac.association_tenant_id = NEW.id
    AND aac.status = 'active'
    AND la.club_id = aac.club_id
    AND la.platform_association_id IS NULL  -- don't overwrite linked platform-assoc rows
    AND la.scope = 'region'
    AND lower(la.name) = lower(NEW.name);

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_assoc_fee_to_affiliated ON public.clubs;
CREATE TRIGGER trg_sync_assoc_fee_to_affiliated
AFTER UPDATE OF league_member_annual_fee, league_fee_due_month, name ON public.clubs
FOR EACH ROW
WHEN (NEW.tenant_type = 'association')
EXECUTE FUNCTION public.sync_assoc_fee_to_affiliated_clubs();

-- 3. Function to auto-create the league_associations row at the affiliated club
--    when a new affiliation row is approved (status='active').
CREATE OR REPLACE FUNCTION public.seed_league_assoc_on_affiliation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_assoc record;
  v_existing_id uuid;
BEGIN
  IF NEW.status <> 'active' THEN
    RETURN NEW;
  END IF;

  -- Load association tenant details
  SELECT id, name, email, phone, league_member_annual_fee, league_fee_due_month
  INTO v_assoc
  FROM public.clubs
  WHERE id = NEW.association_tenant_id;

  IF NOT FOUND OR v_assoc.name IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if a matching league_associations row already exists at the club
  SELECT id INTO v_existing_id
  FROM public.league_associations
  WHERE club_id = NEW.club_id
    AND lower(name) = lower(v_assoc.name)
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Refresh fee/contact info but keep the existing row
    UPDATE public.league_associations
    SET fee_annual = v_assoc.league_member_annual_fee,
        fee_due_month = v_assoc.league_fee_due_month,
        contact_email = COALESCE(contact_email, v_assoc.email),
        contact_phone = COALESCE(contact_phone, v_assoc.phone),
        active = true,
        updated_at = now()
    WHERE id = v_existing_id;
    RETURN NEW;
  END IF;

  INSERT INTO public.league_associations
    (club_id, name, abbreviation, fee_annual, fee_due_month, due_day,
     contact_email, contact_phone, active, scope, fee_class)
  VALUES
    (NEW.club_id, v_assoc.name, NULL,
     v_assoc.league_member_annual_fee, v_assoc.league_fee_due_month, 1,
     v_assoc.email, v_assoc.phone, true, 'region', 'pass_through');

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_seed_league_assoc_on_affiliation ON public.association_affiliated_clubs;
CREATE TRIGGER trg_seed_league_assoc_on_affiliation
AFTER INSERT OR UPDATE OF status ON public.association_affiliated_clubs
FOR EACH ROW
EXECUTE FUNCTION public.seed_league_assoc_on_affiliation();

-- 4. Backfill: for every existing active affiliation, ensure a league_associations row exists
INSERT INTO public.league_associations
  (club_id, name, abbreviation, fee_annual, fee_due_month, due_day,
   contact_email, contact_phone, active, scope, fee_class)
SELECT
  aac.club_id,
  c.name,
  NULL,
  c.league_member_annual_fee,
  c.league_fee_due_month,
  1,
  c.email,
  c.phone,
  true,
  'region',
  'pass_through'
FROM public.association_affiliated_clubs aac
JOIN public.clubs c ON c.id = aac.association_tenant_id AND c.tenant_type = 'association'
WHERE aac.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM public.league_associations la
    WHERE la.club_id = aac.club_id
      AND lower(la.name) = lower(c.name)
  );
