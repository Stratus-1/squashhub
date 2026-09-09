CREATE OR REPLACE FUNCTION public.tournament_invite_member_directory(
  p_tournament_id uuid DEFAULT NULL,
  p_club_id uuid DEFAULT NULL,
  p_member_ids uuid[] DEFAULT NULL
)
RETURNS TABLE(member_id uuid, full_name text, club_id uuid, club_name text, contactable boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _club uuid := p_club_id;
  _owner uuid;
  _scope text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_member_ids IS NULL OR array_length(p_member_ids, 1) IS NULL THEN RETURN; END IF;

  IF p_tournament_id IS NOT NULL THEN
    SELECT t.club_id, t.owner_org_id INTO _club, _owner
    FROM public.tournaments t WHERE t.id = p_tournament_id;
    SELECT g.eligibility_scope INTO _scope
    FROM public.tournament_governance g WHERE g.tournament_id = p_tournament_id;
  END IF;

  IF NOT public.can_browse_invite_directory(_uid, p_tournament_id, _club) THEN
    RAISE EXCEPTION 'Not authorised to browse the invitation directory';
  END IF;

  _scope := COALESCE(_scope, 'club');

  RETURN QUERY
  SELECT
    m.id,
    COALESCE(NULLIF(TRIM(m.name), ''), 'Unknown member')::text,
    m.club_id,
    c.name::text,
    (COALESCE(NULLIF(TRIM(m.email), ''), NULLIF(TRIM(m.phone), '')) IS NOT NULL)
  FROM public.club_members m
  JOIN public.scope_eligible_club_ids(_club, _owner, _scope) e ON e.club_id = m.club_id
  LEFT JOIN public.clubs c ON c.id = m.club_id
  WHERE m.id = ANY(p_member_ids)
    AND m.status = 'active'
    AND m.role <> 'visitor'
    AND COALESCE(m.billing_exempt, false) = false;
END;
$function$;

REVOKE ALL ON FUNCTION public.tournament_invite_member_directory(uuid, uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tournament_invite_member_directory(uuid, uuid, uuid[]) TO authenticated;