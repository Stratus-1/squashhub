ALTER TABLE public.tournament_governance
  ADD COLUMN IF NOT EXISTS federation_fee_pct numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS association_fee_pct numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_expenses_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_expenses_label text;

ALTER TABLE public.tournament_governance
  DROP CONSTRAINT IF EXISTS tg_fee_pct_chk;
ALTER TABLE public.tournament_governance
  ADD CONSTRAINT tg_fee_pct_chk CHECK (
    federation_fee_pct >= 0 AND federation_fee_pct <= 100
    AND association_fee_pct >= 0 AND association_fee_pct <= 100
    AND other_expenses_cents >= 0
  );

-- Resolve the entity that actually owns a tournament. Falls back to the host
-- club's organisation for legacy tournaments with no explicit owner.
CREATE OR REPLACE FUNCTION public.tournament_owner_entity(p_tournament_id uuid)
RETURNS TABLE (owner_org_id uuid, owner_kind text, owner_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.kind::text, o.name
  FROM public.tournaments t
  LEFT JOIN public.clubs c ON c.id = t.club_id
  LEFT JOIN public.organisations o
    ON o.id = COALESCE(
         t.owner_org_id,
         (SELECT o2.id FROM public.organisations o2 WHERE o2.club_id = t.club_id LIMIT 1)
       )
  WHERE t.id = p_tournament_id
$$;

-- Ownership-aware allocation of one entry fee. A levy is never charged to the
-- body that owns the event; the owner is the residual beneficiary.
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
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g record;
  own record;
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

  SELECT COALESCE((value #>> '{}')::numeric, 0) INTO v_platform_pct
  FROM public.app_settings WHERE key = 'platform_tournament_fee_pct';
  v_platform_pct := LEAST(GREATEST(COALESCE(v_platform_pct, 0), 0), 100);

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

REVOKE ALL ON FUNCTION public.tournament_owner_entity(uuid) FROM public;
REVOKE ALL ON FUNCTION public.tournament_fee_allocation(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.tournament_owner_entity(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tournament_fee_allocation(uuid) TO authenticated, service_role;