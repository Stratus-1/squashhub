
-- Link national bodies (e.g. SSA) to specific league associations within a club.
-- When linked, every member of that league_association (who has a league
-- number for the current season) will be charged that body's annual fee,
-- once per season (deduped across multiple linked leagues).

CREATE TABLE IF NOT EXISTS public.league_association_national_bodies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_association_id uuid NOT NULL REFERENCES public.league_associations(id) ON DELETE CASCADE,
  national_body_fee_id uuid NOT NULL REFERENCES public.national_body_fees(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_association_id, national_body_fee_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.league_association_national_bodies TO authenticated;
GRANT ALL ON public.league_association_national_bodies TO service_role;

ALTER TABLE public.league_association_national_bodies ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read links for associations of clubs they belong to;
-- only club admins/captains can modify.
CREATE POLICY "Members can view links for their club"
ON public.league_association_national_bodies FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.league_associations la
    JOIN public.club_members cm ON cm.club_id = la.club_id
    WHERE la.id = league_association_id AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Club admins can manage links"
ON public.league_association_national_bodies FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.league_associations la
    JOIN public.club_members cm ON cm.club_id = la.club_id
    WHERE la.id = league_association_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('admin','captain')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.league_associations la
    JOIN public.club_members cm ON cm.club_id = la.club_id
    WHERE la.id = league_association_id
      AND cm.user_id = auth.uid()
      AND cm.role IN ('admin','captain')
  )
);

CREATE TRIGGER set_lanb_updated_at
BEFORE UPDATE ON public.league_association_national_bodies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seeding helper: for a given league_association + season, insert an unpaid
-- club_member_fee_payments row for every active member of that association
-- that holds a league number this season, for each linked national body —
-- BUT only once per member per body per season (dedup across multi-league links).
CREATE OR REPLACE FUNCTION public.seed_linked_national_body_fees(
  p_league_association_id uuid,
  p_season_year integer DEFAULT EXTRACT(YEAR FROM now())::int
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_club_id uuid;
BEGIN
  SELECT club_id INTO v_club_id
  FROM public.league_associations
  WHERE id = p_league_association_id;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'Association not found';
  END IF;

  -- Permission check: caller must be admin/captain of the club
  IF NOT EXISTS (
    SELECT 1 FROM public.club_members
    WHERE club_id = v_club_id
      AND user_id = auth.uid()
      AND role IN ('admin','captain')
  ) AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  WITH eligible AS (
    SELECT DISTINCT maa.club_member_id, nbf.id AS nbf_id, nbf.body_name, nbf.abbreviation, nbf.fee_annual
    FROM public.league_association_national_bodies link
    JOIN public.national_body_fees nbf ON nbf.id = link.national_body_fee_id AND nbf.active = true
    JOIN public.member_association_affiliations maa
      ON maa.association_id = link.league_association_id
     AND maa.active = true
     AND maa.league_association_number IS NOT NULL
    WHERE link.league_association_id = p_league_association_id
      AND link.active = true
  ),
  inserted AS (
    INSERT INTO public.club_member_fee_payments
      (club_member_id, fee_type, fee_label, amount, paid, season_year)
    SELECT
      e.club_member_id,
      'national',
      COALESCE(e.abbreviation, e.body_name) || ' ' || p_season_year,
      COALESCE(e.fee_annual, 0),
      false,
      p_season_year
    FROM eligible e
    WHERE NOT EXISTS (
      SELECT 1 FROM public.club_member_fee_payments cmfp
      WHERE cmfp.club_member_id = e.club_member_id
        AND cmfp.fee_type = 'national'
        AND cmfp.season_year = p_season_year
        AND (cmfp.fee_label ILIKE COALESCE(e.abbreviation, e.body_name) || '%')
    )
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM inserted;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_linked_national_body_fees(uuid, integer) TO authenticated;
