-- Federation root (nearest 'national' ancestor) of an organisation
CREATE OR REPLACE FUNCTION public.org_federation_root(_org_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE up AS (
    SELECT o.id, o.kind FROM public.organisations o WHERE o.id = _org_id
    UNION
    SELECT p.id, p.kind
    FROM public.organisation_relationships r
    JOIN up ON up.id = r.child_org_id
    JOIN public.organisations p ON p.id = r.parent_org_id
    WHERE r.effective_to IS NULL OR r.effective_to >= CURRENT_DATE
  )
  SELECT COALESCE(
    (SELECT id FROM up WHERE kind = 'national' LIMIT 1),
    (SELECT id FROM public.organisations WHERE kind = 'national' AND active ORDER BY created_at LIMIT 1)
  );
$$;

-- Nearest real association ancestor (skips internal league orgs)
CREATE OR REPLACE FUNCTION public.org_owning_association(_org_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE up AS (
    SELECT o.id, o.kind, o.is_internal_league, 0 AS depth
    FROM public.organisations o WHERE o.id = _org_id
    UNION
    SELECT p.id, p.kind, p.is_internal_league, up.depth + 1
    FROM public.organisation_relationships r
    JOIN up ON up.id = r.child_org_id
    JOIN public.organisations p ON p.id = r.parent_org_id
    WHERE r.effective_to IS NULL OR r.effective_to >= CURRENT_DATE
  )
  SELECT id FROM up
  WHERE kind = 'association' AND COALESCE(is_internal_league, false) = false
  ORDER BY depth
  LIMIT 1;
$$;

-- Clubs whose members may enter a tournament, derived from the hierarchy
CREATE OR REPLACE FUNCTION public.tournament_eligible_club_ids(_tournament_id uuid)
RETURNS TABLE (club_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _scope text;
  _owner uuid;
  _club uuid;
  _assoc uuid;
  _root uuid;
BEGIN
  SELECT t.club_id, t.owner_org_id INTO _club, _owner
  FROM public.tournaments t WHERE t.id = _tournament_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT g.eligibility_scope INTO _scope
  FROM public.tournament_governance g WHERE g.tournament_id = _tournament_id;
  _scope := COALESCE(_scope, 'club');

  IF _owner IS NULL AND _club IS NOT NULL THEN
    SELECT o.id INTO _owner FROM public.organisations o
    WHERE o.kind = 'club' AND o.club_id = _club LIMIT 1;
  END IF;

  IF _scope = 'club' THEN
    RETURN QUERY
      SELECT c.id FROM public.clubs c
      WHERE c.id = _club
         OR c.id = (SELECT o.club_id FROM public.organisations o WHERE o.id = _owner);
    RETURN;
  END IF;

  IF _scope = 'association' THEN
    SELECT CASE
      WHEN (SELECT o.kind FROM public.organisations o WHERE o.id = _owner) = 'association'
        THEN _owner
      ELSE public.org_owning_association(_owner)
    END INTO _assoc;

    IF _assoc IS NULL THEN
      RETURN QUERY SELECT c.id FROM public.clubs c WHERE c.id = _club;
      RETURN;
    END IF;

    RETURN QUERY
      SELECT DISTINCT o.club_id
      FROM public.org_descendants(_assoc) d
      JOIN public.organisations o ON o.id = d.org_id
      WHERE o.kind = 'club' AND o.club_id IS NOT NULL
      UNION
      SELECT c.id FROM public.clubs c WHERE c.id = _club;
    RETURN;
  END IF;

  -- open: everyone under the federation, including unaffiliated clubs
  _root := public.org_federation_root(_owner);

  RETURN QUERY
    SELECT DISTINCT o.club_id
    FROM public.org_descendants(_root) d
    JOIN public.organisations o ON o.id = d.org_id
    WHERE o.kind = 'club' AND o.club_id IS NOT NULL
    UNION
    -- clubs that sit outside any affiliation are still part of the federation
    SELECT o.club_id
    FROM public.organisations o
    WHERE o.kind = 'club' AND o.club_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.organisation_relationships r
        WHERE r.child_org_id = o.id
          AND (r.effective_to IS NULL OR r.effective_to >= CURRENT_DATE)
      )
    UNION
    -- clubs with no organisation row at all
    SELECT c.id FROM public.clubs c
    WHERE NOT EXISTS (SELECT 1 FROM public.organisations o2 WHERE o2.club_id = c.id);
END;
$$;

-- Server-side eligibility check for one member
CREATE OR REPLACE FUNCTION public.is_member_eligible_for_tournament(_tournament_id uuid, _club_member_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_members m
    WHERE m.id = _club_member_id
      AND m.club_id IN (SELECT club_id FROM public.tournament_eligible_club_ids(_tournament_id))
  );
$$;

-- Live read-only population summary for the wizard
CREATE OR REPLACE FUNCTION public.tournament_eligibility_summary(_tournament_id uuid)
RETURNS TABLE (scope text, scope_org_name text, club_count integer, member_count integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _scope text;
  _owner uuid;
  _club uuid;
  _name text;
BEGIN
  SELECT t.club_id, t.owner_org_id INTO _club, _owner
  FROM public.tournaments t WHERE t.id = _tournament_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(g.eligibility_scope, 'club') INTO _scope
  FROM public.tournament_governance g WHERE g.tournament_id = _tournament_id;
  _scope := COALESCE(_scope, 'club');

  IF _owner IS NULL AND _club IS NOT NULL THEN
    SELECT o.id INTO _owner FROM public.organisations o
    WHERE o.kind = 'club' AND o.club_id = _club LIMIT 1;
  END IF;

  IF _scope = 'club' THEN
    SELECT c.name INTO _name FROM public.clubs c WHERE c.id = _club;
  ELSIF _scope = 'association' THEN
    SELECT o.name INTO _name FROM public.organisations o
    WHERE o.id = CASE
      WHEN (SELECT k.kind FROM public.organisations k WHERE k.id = _owner) = 'association' THEN _owner
      ELSE public.org_owning_association(_owner)
    END;
  ELSE
    SELECT o.name INTO _name FROM public.organisations o WHERE o.id = public.org_federation_root(_owner);
  END IF;

  RETURN QUERY
  SELECT _scope,
         _name,
         (SELECT COUNT(*)::int FROM public.tournament_eligible_club_ids(_tournament_id)),
         (SELECT COUNT(*)::int FROM public.club_members m
            WHERE m.club_id IN (SELECT club_id FROM public.tournament_eligible_club_ids(_tournament_id))
              AND COALESCE(m.status, 'active') = 'active'
              AND COALESCE(m.role::text, 'member') <> 'visitor');
END;
$$;

GRANT EXECUTE ON FUNCTION public.org_federation_root(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.org_owning_association(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.tournament_eligible_club_ids(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.is_member_eligible_for_tournament(uuid, uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.tournament_eligibility_summary(uuid) TO authenticated, anon, service_role;

-- Enforce eligibility on self-service registrations (organisers can still add anyone)
CREATE OR REPLACE FUNCTION public.enforce_tournament_eligibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.club_member_id IS NOT NULL
     AND NOT public.is_member_eligible_for_tournament(NEW.champ_id, NEW.club_member_id)
     AND NOT public.can_manage_tournament(NEW.champ_id)
  THEN
    RAISE EXCEPTION 'This member is not eligible to enter this tournament.';
  END IF;

  IF NEW.partner_member_id IS NOT NULL
     AND NOT public.is_member_eligible_for_tournament(NEW.champ_id, NEW.partner_member_id)
     AND NOT public.can_manage_tournament(NEW.champ_id)
  THEN
    RAISE EXCEPTION 'The selected partner is not eligible to enter this tournament.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_tournament_eligibility ON public.club_champs_registrations;
CREATE TRIGGER trg_enforce_tournament_eligibility
BEFORE INSERT OR UPDATE OF club_member_id, partner_member_id ON public.club_champs_registrations
FOR EACH ROW EXECUTE FUNCTION public.enforce_tournament_eligibility();