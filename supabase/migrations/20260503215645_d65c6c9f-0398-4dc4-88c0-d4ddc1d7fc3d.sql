
-- 1. Add tenant link column
ALTER TABLE public.league_associations
  ADD COLUMN IF NOT EXISTS tenant_association_id uuid REFERENCES public.clubs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_league_assoc_tenant ON public.league_associations(tenant_association_id);

-- 2. Auto-link function: when an affiliation is added, try to link by name
CREATE OR REPLACE FUNCTION public.auto_link_league_to_association()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assoc_name text;
BEGIN
  SELECT name INTO v_assoc_name FROM public.clubs WHERE id = NEW.association_tenant_id;
  IF v_assoc_name IS NULL THEN RETURN NEW; END IF;

  UPDATE public.league_associations
  SET tenant_association_id = NEW.association_tenant_id,
      updated_at = now()
  WHERE club_id = NEW.club_id
    AND tenant_association_id IS NULL
    AND lower(trim(name)) = lower(trim(v_assoc_name));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_link_league_on_affiliate ON public.association_affiliated_clubs;
CREATE TRIGGER trg_auto_link_league_on_affiliate
AFTER INSERT ON public.association_affiliated_clubs
FOR EACH ROW EXECUTE FUNCTION public.auto_link_league_to_association();

-- 3. Backfill existing affiliations
UPDATE public.league_associations la
SET tenant_association_id = aac.association_tenant_id
FROM public.association_affiliated_clubs aac
JOIN public.clubs c ON c.id = aac.association_tenant_id
WHERE la.club_id = aac.club_id
  AND la.tenant_association_id IS NULL
  AND lower(trim(la.name)) = lower(trim(c.name));

-- 4. Aggregation view for association dashboard
CREATE OR REPLACE VIEW public.association_member_affiliations_v
WITH (security_invoker=on) AS
SELECT
  la.tenant_association_id              AS association_tenant_id,
  maa.id                                AS affiliation_id,
  maa.club_member_id,
  maa.league_association_number,
  maa.active,
  maa.joined_at,
  cm.name                               AS member_name,
  cm.email                              AS member_email,
  cm.gender,
  cm.club_id,
  c.name                                AS club_name,
  c.subdomain                           AS club_subdomain,
  la.id                                 AS league_association_id,
  la.name                               AS league_name,
  la.fee_annual                         AS league_fee_annual,
  la.members_pay_directly
FROM public.member_association_affiliations maa
JOIN public.league_associations la ON la.id = maa.association_id
JOIN public.club_members cm ON cm.id = maa.club_member_id
JOIN public.clubs c ON c.id = cm.club_id
WHERE la.tenant_association_id IS NOT NULL;

GRANT SELECT ON public.association_member_affiliations_v TO authenticated;
