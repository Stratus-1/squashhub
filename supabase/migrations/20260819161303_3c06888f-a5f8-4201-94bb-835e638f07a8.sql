CREATE OR REPLACE FUNCTION public.tournament_fee_allocation(p_tournament_id uuid)
RETURNS TABLE (
  owner_org_id uuid,
  owner_kind text,
  owner_name text,
  entry_fee_cents integer,
  platform_fee_cents integer,
  federation_fee_cents integer,
  association_fee_cents integer,
  host_fee_cents integer,
  other_expenses_cents integer,
  owner_net_cents integer,
  over_allocated boolean
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  g record;
  own record;
  v_raw text;
  v_platform_pct numeric := 0;
  v_entry integer := 0;
  v_platform integer := 0;
  v_fed integer := 0;
  v_assoc integer := 0;
  v_host integer := 0;
  v_other integer := 0;
  v_host_fixed integer := 0;
  v_host_pct numeric := 0;
  v_allocated integer := 0;
BEGIN
  SELECT * INTO g FROM public.tournament_governance WHERE tournament_id = p_tournament_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT * INTO own FROM public.tournament_owner_entity(p_tournament_id);

  -- app_settings.value is plain text and may be quoted ("3"). Default to 3%.
  SELECT value INTO v_raw FROM public.app_settings WHERE key = 'platform_tournament_fee_pct';
  BEGIN
    v_platform_pct := COALESCE(NULLIF(replace(COALESCE(v_raw, ''), '"', ''), '')::numeric, 3);
  EXCEPTION WHEN others THEN
    v_platform_pct := 3;
  END;
  v_platform_pct := LEAST(GREATEST(v_platform_pct, 0), 100);

  v_entry := GREATEST(COALESCE(g.entry_fee_cents, 0), 0);
  v_platform := ROUND(v_entry * v_platform_pct / 100.0);

  -- Federation levy only applies when the federation is NOT the owner.
  IF COALESCE(own.owner_kind, 'club') <> 'national' THEN
    v_fed := GREATEST(COALESCE(g.federation_fee_cents, 0), 0)
             + ROUND(v_entry * COALESCE(g.federation_fee_pct, 0) / 100.0);
  END IF;

  -- Association levy only applies to club-owned events.
  IF COALESCE(own.owner_kind, 'club') = 'club' THEN
    v_assoc := GREATEST(COALESCE(g.association_fee_cents, 0), 0)
               + ROUND(v_entry * COALESCE(g.association_fee_pct, 0) / 100.0);
  END IF;

  SELECT COALESCE(SUM(tv.host_fee_cents), 0), COALESCE(SUM(tv.host_share_pct), 0)
    INTO v_host_fixed, v_host_pct
  FROM public.tournament_venues tv
  WHERE tv.tournament_id = p_tournament_id;
  v_host := GREATEST(v_host_fixed, 0) + ROUND(v_entry * LEAST(GREATEST(v_host_pct, 0), 100) / 100.0);

  v_other := GREATEST(COALESCE(g.other_expenses_cents, 0), 0);
  v_allocated := v_platform + v_fed + v_assoc + v_host + v_other;

  owner_org_id := own.owner_org_id;
  owner_kind := COALESCE(own.owner_kind, 'club');
  owner_name := own.owner_name;
  entry_fee_cents := v_entry;
  platform_fee_cents := v_platform;
  federation_fee_cents := v_fed;
  association_fee_cents := v_assoc;
  host_fee_cents := v_host;
  other_expenses_cents := v_other;
  owner_net_cents := GREATEST(v_entry - v_allocated, 0);
  over_allocated := v_allocated > v_entry;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.tournament_fee_allocation(uuid) TO authenticated, service_role;