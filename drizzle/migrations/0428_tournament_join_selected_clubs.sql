CREATE OR REPLACE FUNCTION public.tournament_join_club_ids(p_champ_id uuid)
RETURNS TABLE(club_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_aud jsonb; v_host uuid; v_sel uuid[];
BEGIN
  SELECT t.beta_lifecycle->'invite'->'audience', t.club_id INTO v_aud, v_host
    FROM public.tournaments t WHERE t.id = p_champ_id;
  IF coalesce(v_aud->>'mode','') = 'clubs' AND jsonb_typeof(v_aud->'clubIds') = 'array' THEN
    SELECT array_agg(x::uuid) INTO v_sel
      FROM jsonb_array_elements_text(v_aud->'clubIds') x
     WHERE x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  END IF;
  IF v_sel IS NULL OR cardinality(v_sel) = 0 THEN
    RETURN QUERY SELECT e.club_id FROM public.tournament_eligible_club_ids(p_champ_id) e;
  ELSE
    RETURN QUERY SELECT e.club_id FROM public.tournament_eligible_club_ids(p_champ_id) e
      WHERE e.club_id = v_host OR e.club_id = ANY(v_sel);
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.tournament_join_club_ids(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tournament_join_club_ids(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tournament_join_context(p_champ_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE c record; t record; v_scope text; v_host record; v_clubs jsonb; v_cats jsonb; v_me jsonb := '[]'::jsonb; v_uid uuid := auth.uid();
BEGIN
  SELECT id, name, club_id, status, start_date, registration_closes_at, entry_fee_cents, group_labels, num_groups
    INTO c FROM public.club_champs WHERE id = p_champ_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('found', false); END IF;
  SELECT beta_lifecycle, allow_external_entries INTO t FROM public.tournaments WHERE id = p_champ_id;
  SELECT eligibility_scope INTO v_scope FROM public.tournament_governance WHERE tournament_id = p_champ_id;
  SELECT name, subdomain INTO v_host FROM public.clubs WHERE id = c.club_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'club_id', cl.id, 'club_name', cl.name, 'subdomain', cl.subdomain,
           'on_squashhub', public.club_accepts_membership_applications(cl.id),
           'is_host', cl.id = c.club_id) ORDER BY (cl.id = c.club_id) DESC, cl.name), '[]'::jsonb)
    INTO v_clubs
    FROM public.tournament_join_club_ids(p_champ_id) e JOIN public.clubs cl ON cl.id = e.club_id;

  SELECT coalesce(jsonb_agg(public.tournament_group_display_label(t.beta_lifecycle, c.group_labels ->> n::text, n) ORDER BY n), '[]'::jsonb)
    INTO v_cats FROM generate_series(1, greatest(coalesce(c.num_groups, 1), 1)) n;

  IF v_uid IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'member_id', m.id, 'club_id', m.club_id, 'club_name', cl.name, 'name', m.name,
             'pending', coalesce(m.is_pending_approval, false),
             'token', CASE WHEN r.invite_revoked_at IS NULL THEN r.invite_token END)), '[]'::jsonb)
      INTO v_me
      FROM public.club_members m
      JOIN public.clubs cl ON cl.id = m.club_id
      JOIN public.tournament_eligible_club_ids(p_champ_id) e ON e.club_id = m.club_id
      LEFT JOIN public.club_champs_registrations r ON r.champ_id = p_champ_id AND r.club_member_id = m.id
     WHERE m.user_id = v_uid AND coalesce(m.status::text, 'active') <> 'resigned'
       AND (r.id IS NOT NULL OR m.club_id IN (SELECT j.club_id FROM public.tournament_join_club_ids(p_champ_id) j));
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'open', public._tournament_join_open(p_champ_id),
    'scope', coalesce(v_scope, 'club'),
    'name', c.name, 'host_club_id', c.club_id, 'host_club_name', v_host.name, 'host_subdomain', v_host.subdomain,
    'start_date', c.start_date, 'entries_close', c.registration_closes_at,
    'fee_cents', coalesce(c.entry_fee_cents, 0),
    'allow_external', coalesce(t.allow_external_entries, false),
    'categories', v_cats, 'clubs', v_clubs, 'me', v_me);
END $function$;