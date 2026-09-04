-- 1. Club → association payments
CREATE TABLE public.club_association_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  association_tenant_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  season_year integer NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  paid_on date NOT NULL DEFAULT current_date,
  method text NOT NULL DEFAULT 'bank' CHECK (method IN ('bank','cash','other')),
  reference text,
  proof_path text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','disputed')),
  notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cap_club_season ON public.club_association_payments(club_id, season_year);
CREATE INDEX idx_cap_assoc_season ON public.club_association_payments(association_tenant_id, season_year);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_association_payments TO authenticated;
GRANT ALL ON public.club_association_payments TO service_role;

ALTER TABLE public.club_association_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club admins manage own association payments"
ON public.club_association_payments FOR ALL TO authenticated
USING (public.is_club_admin(auth.uid(), club_id))
WITH CHECK (public.is_club_admin(auth.uid(), club_id));

CREATE POLICY "Association admins read payments to them"
ON public.club_association_payments FOR SELECT TO authenticated
USING (public.is_club_admin(auth.uid(), association_tenant_id));

CREATE POLICY "Association admins review payments to them"
ON public.club_association_payments FOR UPDATE TO authenticated
USING (public.is_club_admin(auth.uid(), association_tenant_id))
WITH CHECK (public.is_club_admin(auth.uid(), association_tenant_id));

CREATE TRIGGER trg_cap_updated_at
BEFORE UPDATE ON public.club_association_payments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Shared affiliation statement (same numbers for club and association)
CREATE OR REPLACE FUNCTION public.club_association_statement(
  _club_id uuid, _season_year integer)
RETURNS TABLE(
  association_tenant_id uuid,
  association_name text,
  fee_item_id uuid,
  label text,
  basis text,
  amount numeric,
  due_month integer,
  due_day integer,
  units_submitted integer,
  units_pending integer,
  total_submitted numeric,
  total_pending numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_name text;
  v_teams_sub integer := 0;
  v_teams_pend integer := 0;
  v_members_sub integer := 0;
  v_members_pend integer := 0;
BEGIN
  SELECT aac.association_tenant_id, c.name
    INTO v_tenant, v_name
  FROM public.association_affiliated_clubs aac
  JOIN public.clubs c ON c.id = aac.association_tenant_id
  WHERE aac.club_id = _club_id AND aac.status = 'active'
  LIMIT 1;

  IF v_tenant IS NULL THEN
    RETURN;
  END IF;

  IF NOT (public.is_club_admin(auth.uid(), _club_id) OR public.is_club_admin(auth.uid(), v_tenant)) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT
    count(*) FILTER (WHERE l.submitted_to_association_at IS NOT NULL),
    count(*) FILTER (WHERE l.submitted_to_association_at IS NULL)
  INTO v_teams_sub, v_teams_pend
  FROM public.leagues l
  JOIN public.league_associations la ON la.id = l.association_id
  WHERE l.club_id = _club_id
    AND l.archived_at IS NULL
    AND la.tenant_association_id = v_tenant
    AND l.season_year IS NOT DISTINCT FROM _season_year;

  SELECT
    count(DISTINCT r.club_member_id) FILTER (WHERE l.submitted_to_association_at IS NOT NULL),
    count(DISTINCT r.club_member_id) FILTER (WHERE l.submitted_to_association_at IS NULL)
  INTO v_members_sub, v_members_pend
  FROM public.member_league_registrations r
  JOIN public.leagues l ON l.id = r.league_id
  JOIN public.league_associations la ON la.id = l.association_id
  WHERE l.club_id = _club_id
    AND l.archived_at IS NULL
    AND la.tenant_association_id = v_tenant
    AND l.season_year IS NOT DISTINCT FROM _season_year;

  RETURN QUERY
  SELECT
    v_tenant,
    v_name,
    fi.id,
    fi.label,
    fi.basis,
    fi.amount,
    fi.due_month,
    fi.due_day,
    CASE fi.basis
      WHEN 'club' THEN CASE WHEN v_teams_sub > 0 THEN 1 ELSE 0 END
      WHEN 'league_team' THEN v_teams_sub
      ELSE v_members_sub
    END::integer,
    CASE fi.basis
      WHEN 'club' THEN CASE WHEN v_teams_sub > 0 THEN 0 WHEN v_teams_pend > 0 THEN 1 ELSE 0 END
      WHEN 'league_team' THEN v_teams_pend
      ELSE v_members_pend
    END::integer,
    (CASE fi.basis
      WHEN 'club' THEN CASE WHEN v_teams_sub > 0 THEN 1 ELSE 0 END
      WHEN 'league_team' THEN v_teams_sub
      ELSE v_members_sub
    END) * fi.amount,
    (CASE fi.basis
      WHEN 'club' THEN CASE WHEN v_teams_sub > 0 THEN 0 WHEN v_teams_pend > 0 THEN 1 ELSE 0 END
      WHEN 'league_team' THEN v_teams_pend
      ELSE v_members_pend
    END) * fi.amount
  FROM public.association_fee_items fi
  WHERE fi.association_club_id = v_tenant
    AND fi.active
    AND fi.direction = 'receivable'
    AND (fi.season_year IS NULL OR fi.season_year = _season_year)
  ORDER BY fi.basis, fi.label;
END;
$$;

REVOKE ALL ON FUNCTION public.club_association_statement(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.club_association_statement(uuid, integer) TO authenticated, service_role;

-- 3. Affiliate + submit a single member later in the season
CREATE OR REPLACE FUNCTION public.club_affiliate_member_to_association(
  _club_id uuid,
  _club_member_id uuid,
  _association_id uuid,
  _league_id uuid DEFAULT NULL,
  _submit boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_rank integer;
  v_submitted boolean := false;
BEGIN
  IF NOT public.is_club_admin(auth.uid(), _club_id) THEN
    RAISE EXCEPTION 'Not a club admin';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.club_members m WHERE m.id = _club_member_id AND m.club_id = _club_id) THEN
    RAISE EXCEPTION 'Member does not belong to this club';
  END IF;

  INSERT INTO public.member_association_affiliations (club_member_id, association_id, active)
  VALUES (_club_member_id, _association_id, true)
  ON CONFLICT (club_member_id, association_id)
  DO UPDATE SET active = true;

  IF _league_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.leagues l
      WHERE l.id = _league_id AND l.club_id = _club_id AND l.association_id = _association_id
    ) THEN
      RAISE EXCEPTION 'Team does not belong to this club and association';
    END IF;

    SELECT COALESCE(max(r.player_rank), 0) + 1 INTO v_next_rank
    FROM public.member_league_registrations r WHERE r.league_id = _league_id;

    INSERT INTO public.member_league_registrations (club_member_id, league_id, player_rank, league_association_number)
    VALUES (
      _club_member_id, _league_id, v_next_rank,
      (SELECT a.league_association_number FROM public.member_association_affiliations a
        WHERE a.club_member_id = _club_member_id AND a.association_id = _association_id LIMIT 1)
    )
    ON CONFLICT (club_member_id, league_id) DO NOTHING;

    IF _submit THEN
      UPDATE public.leagues SET submitted_to_association_at = now() WHERE id = _league_id;
      v_submitted := true;
    END IF;
  END IF;

  RETURN jsonb_build_object('affiliated', true, 'team_added', _league_id IS NOT NULL, 'submitted', v_submitted);
END;
$$;

REVOKE ALL ON FUNCTION public.club_affiliate_member_to_association(uuid, uuid, uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.club_affiliate_member_to_association(uuid, uuid, uuid, uuid, boolean) TO authenticated, service_role;

-- 4. Association may read proofs uploaded by its affiliated clubs
CREATE POLICY "Association admins read affiliated club payment proofs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND EXISTS (
    SELECT 1 FROM public.association_affiliated_clubs aac
    WHERE aac.club_id = ((storage.foldername(name))[1])::uuid
      AND aac.status = 'active'
      AND public.is_club_admin(auth.uid(), aac.association_tenant_id)
  )
);