REVOKE EXECUTE ON FUNCTION public.org_federation_root(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.org_owning_association(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.tournament_eligible_club_ids(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_member_eligible_for_tournament(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.tournament_eligibility_summary(uuid) FROM anon;