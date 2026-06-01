CREATE OR REPLACE FUNCTION public.seed_default_association_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only seed rules for associations linked to a platform association.
  -- Tenant-only (internal/own) associations inherit rules via the
  -- platform_association_id fallback; they don't need their own row,
  -- and the FK on league_rules.association_id targets platform_league_associations.
  IF NEW.platform_association_id IS NOT NULL THEN
    INSERT INTO public.league_rules (association_id)
    VALUES (NEW.platform_association_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;