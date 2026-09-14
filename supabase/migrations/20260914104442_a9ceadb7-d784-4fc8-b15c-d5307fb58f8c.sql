CREATE OR REPLACE FUNCTION public.seed_member_default_fees(p_club_member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member       public.club_members%ROWTYPE;
  v_club_id      uuid;
  v_is_nsa_club  boolean;
  v_cat_name     text;
  v_cat_amount   numeric;
  v_year         int := EXTRACT(year FROM now())::int;
BEGIN
  SELECT * INTO v_member FROM public.club_members WHERE id = p_club_member_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF COALESCE(v_member.role::text, '') = 'visitor' THEN RETURN; END IF;

  v_club_id := v_member.club_id;

  SELECT EXISTS (
    SELECT 1 FROM public.league_associations
    WHERE club_id = v_club_id AND abbreviation = 'NSA' AND COALESCE(active, true)
  ) INTO v_is_nsa_club;
  IF NOT v_is_nsa_club THEN RETURN; END IF;

  -- Club membership category fee only. League (NSA), national body (SSA) and
  -- other per-member pass-through fees are NOT seeded here any more; they are
  -- managed regionally/nationally and filtered down to clubs.
  IF v_member.fee_category_id IS NOT NULL THEN
    SELECT name, annual_fee INTO v_cat_name, v_cat_amount
    FROM public.member_fee_categories
    WHERE id = v_member.fee_category_id AND COALESCE(active, true);
    IF FOUND AND COALESCE(v_cat_amount, 0) > 0
       AND NOT EXISTS (
         SELECT 1 FROM public.club_member_fee_payments f
         WHERE f.club_member_id = p_club_member_id
           AND f.fee_type = 'club'
           AND f.season_year = v_year
       ) THEN
      INSERT INTO public.club_member_fee_payments
        (club_member_id, fee_type, fee_label, amount, paid, paid_at, season_year, auto_seeded)
      VALUES
        (p_club_member_id, 'club', 'Club – ' || v_cat_name, v_cat_amount, true, now(), v_year, true)
      ON CONFLICT (club_member_id, fee_type, fee_label, season_year) DO NOTHING;
    END IF;
  END IF;
END;
$$;