ALTER TABLE public.member_association_affiliations
  ADD COLUMN IF NOT EXISTS registration_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS registration_source text,
  ADD COLUMN IF NOT EXISTS registration_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS registration_valid_until date;

CREATE OR REPLACE FUNCTION public.validate_affiliation_registration_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.registration_status NOT IN ('active','inactive','unknown') THEN
    RAISE EXCEPTION 'Invalid registration_status %', NEW.registration_status;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_validate_affiliation_registration_status ON public.member_association_affiliations;
CREATE TRIGGER trg_validate_affiliation_registration_status
  BEFORE INSERT OR UPDATE OF registration_status ON public.member_association_affiliations
  FOR EACH ROW EXECUTE FUNCTION public.validate_affiliation_registration_status();

-- Seed from what we already know: players on a current NSA team sheet.
UPDATE public.member_association_affiliations a
SET registration_status = CASE WHEN a.active THEN 'active' ELSE 'inactive' END,
    registration_source = 'nsa_team_sheet',
    registration_checked_at = now()
FROM public.league_associations la
WHERE la.id = a.association_id AND la.external_source = 'nsa' AND a.registration_status = 'unknown';

CREATE OR REPLACE FUNCTION public.member_competition_status(_club_member_ids uuid[])
RETURNS TABLE (club_member_id uuid, association_id uuid, association_name text, league_number text,
               league_status text, league_source text, league_checked_at timestamptz,
               ssa_number text, ssa_status text, ssa_checked_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT cm.id, a.association_id, la.name, a.league_association_number,
         a.registration_status, a.registration_source, a.registration_checked_at,
         p.ssa_membership_number, p.ssa_membership_status, p.ssa_membership_checked_at
  FROM club_members cm
  LEFT JOIN people p ON p.id = cm.person_id
  LEFT JOIN member_association_affiliations a ON a.club_member_id = cm.id
  LEFT JOIN league_associations la ON la.id = a.association_id
  WHERE cm.id = ANY(_club_member_ids)
    AND (public.has_role(auth.uid(),'admin')
         OR EXISTS (SELECT 1 FROM club_members me WHERE me.user_id = auth.uid() AND me.club_id = cm.club_id));
$$;
REVOKE EXECUTE ON FUNCTION public.member_competition_status(uuid[]) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.member_competition_status(uuid[]) TO authenticated;