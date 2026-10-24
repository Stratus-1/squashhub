CREATE OR REPLACE FUNCTION public.club_accepts_membership_applications(_club_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clubs c
    WHERE c.id = _club_id AND (
      c.sla_accepted_at IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM public.club_subscriptions s
        WHERE s.club_id = c.id AND s.status IN ('active', 'trial', 'trialing') AND s.trial_ends_at > now()
      )
      -- Owner explicitly approved St John's Harare; it has no subscription record yet.
      OR c.id = 'ec323faa-9b1f-4603-9b30-a0db787ada99'::uuid
    )
  )
$$;
REVOKE ALL ON FUNCTION public.club_accepts_membership_applications(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.club_accepts_membership_applications(uuid) TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.club_accepts_membership_applications(uuid) IS 'New applications allowed for SLA-signed clubs, active unexpired trials, and owner-approved St Johns Harare. Public boolean only; no billing or signer details.';