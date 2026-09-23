ALTER TABLE public.tournament_governance
  ADD COLUMN IF NOT EXISTS require_league_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_ssa_active boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.admin_set_competition_status(
  _club_member_id uuid,
  _association_id uuid DEFAULT NULL,
  _league_status text DEFAULT NULL,
  _ssa_number text DEFAULT NULL,
  _ssa_status text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_club_id uuid;
  v_person_id uuid;
BEGIN
  SELECT club_id, person_id INTO v_club_id, v_person_id
  FROM club_members WHERE id = _club_member_id;
  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'Member not found';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.is_club_admin(auth.uid(), v_club_id)) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF _league_status IS NOT NULL AND _association_id IS NOT NULL THEN
    IF _league_status NOT IN ('active','inactive','unknown') THEN
      RAISE EXCEPTION 'Invalid league status %', _league_status;
    END IF;
    UPDATE member_association_affiliations
       SET registration_status = _league_status,
           registration_source = 'manual',
           registration_checked_at = now()
     WHERE club_member_id = _club_member_id
       AND association_id = _association_id;
  END IF;

  IF v_person_id IS NOT NULL AND (_ssa_number IS NOT NULL OR _ssa_status IS NOT NULL) THEN
    IF _ssa_status IS NOT NULL AND _ssa_status NOT IN ('active','inactive','unknown') THEN
      RAISE EXCEPTION 'Invalid SSA status %', _ssa_status;
    END IF;
    UPDATE people
       SET ssa_membership_number = COALESCE(NULLIF(btrim(COALESCE(_ssa_number,'')),''), ssa_membership_number),
           ssa_membership_status = COALESCE(_ssa_status, ssa_membership_status),
           ssa_membership_source = 'manual',
           ssa_membership_checked_at = now()
     WHERE id = v_person_id;
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_set_competition_status(uuid, uuid, text, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_set_competition_status(uuid, uuid, text, text, text) TO authenticated;