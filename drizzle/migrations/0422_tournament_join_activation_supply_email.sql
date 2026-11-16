CREATE OR REPLACE FUNCTION public._tournament_join_can_activate(p_member_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$
  SELECT EXISTS (
    SELECT 1 FROM public.club_members m
     WHERE m.id = p_member_id AND m.user_id IS NULL
       AND coalesce(m.status::text, 'active') = 'active' AND m.role <> 'visitor'
       AND (m.person_id IS NULL OR NOT EXISTS (
             SELECT 1 FROM public.club_members o WHERE o.person_id = m.person_id AND o.user_id IS NOT NULL))
       AND (position('@' in coalesce(m.email, '')) < 2 OR NOT EXISTS (
             SELECT 1 FROM public.club_members f WHERE f.club_id = m.club_id AND f.user_id IS NOT NULL
               AND lower(btrim(f.email)) = lower(btrim(m.email)))));
$f$;
REVOKE ALL ON FUNCTION public._tournament_join_can_activate(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._tournament_join_can_activate(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.tournament_join_find_member(p_champ_id uuid, p_club_id uuid, p_query text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_q text := btrim(coalesce(p_query, '')); v_rows jsonb;
BEGIN
  IF length(v_q) < 3 THEN RETURN '[]'::jsonb; END IF;
  IF NOT public._tournament_join_open(p_champ_id) OR NOT public._tournament_join_club_ok(p_champ_id, p_club_id) THEN
    RAISE EXCEPTION 'Entries through this link are not open';
  END IF;
  SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO v_rows FROM (
    SELECT jsonb_build_object(
             'member_id', m.id, 'display_name', m.name,
             'has_login', m.user_id IS NOT NULL,
             'can_activate', m.user_id IS NULL AND public._tournament_join_can_activate(m.id),
             'needs_email', position('@' in coalesce(m.email, '')) < 2,
             'email_hint', CASE WHEN m.user_id IS NULL THEN public._tournament_join_mask_email(m.email) END,
             'nsa_on_file', EXISTS (SELECT 1 FROM public.member_association_affiliations a WHERE a.club_member_id = m.id AND a.active),
             'matched_by', CASE WHEN EXISTS (SELECT 1 FROM public.member_association_affiliations a
                                              WHERE a.club_member_id = m.id AND a.active
                                                AND upper(btrim(a.league_association_number)) = upper(v_q)) THEN 'nsa' ELSE 'name' END) AS x
      FROM public.club_members m
     WHERE m.club_id = p_club_id
       AND coalesce(m.status::text, 'active') = 'active'
       AND m.role <> 'visitor'
       AND (m.name ILIKE '%' || v_q || '%'
            OR EXISTS (SELECT 1 FROM public.member_association_affiliations a
                        WHERE a.club_member_id = m.id AND a.active
                          AND upper(btrim(a.league_association_number)) = upper(v_q)))
     ORDER BY m.name
     LIMIT 12) s;
  RETURN v_rows;
END $function$;

DROP FUNCTION IF EXISTS public.tournament_join_issue_activation(uuid, uuid);

CREATE OR REPLACE FUNCTION public.tournament_join_issue_activation(p_champ_id uuid, p_member_id uuid, p_email text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE m record; v_token text; v_recent int; v_day int; c record; t record;
        v_email text := lower(btrim(coalesce(p_email, ''))); v_added boolean := false;
BEGIN
  SELECT id, club_id, name, email, user_id INTO m FROM public.club_members WHERE id = p_member_id;
  IF m.id IS NULL OR NOT public._tournament_join_open(p_champ_id) OR NOT public._tournament_join_club_ok(p_champ_id, m.club_id) THEN
    RETURN jsonb_build_object('status', 'not_open');
  END IF;
  IF m.user_id IS NOT NULL THEN RETURN jsonb_build_object('status', 'has_login'); END IF;
  IF NOT public._tournament_join_can_activate(m.id) THEN RETURN jsonb_build_object('status', 'not_available'); END IF;

  SELECT count(*) FILTER (WHERE created_at > now() - interval '10 minutes'), count(*) FILTER (WHERE created_at > now() - interval '1 day')
    INTO v_recent, v_day FROM public.member_activation_invites WHERE club_member_id = m.id;
  IF v_recent > 0 OR v_day >= 5 THEN
    RETURN jsonb_build_object('status', 'too_soon', 'email_hint', public._tournament_join_mask_email(m.email));
  END IF;

  IF position('@' in coalesce(m.email, '')) < 2 THEN
    -- No email on file: the player supplies it, it is saved on the membership (audited), then the link goes there.
    IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(v_email) > 254 THEN
      RETURN jsonb_build_object('status', 'email_required');
    END IF;
    IF EXISTS (SELECT 1 FROM public.profiles p WHERE lower(btrim(p.email)) = v_email)
       OR EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = v_email) THEN
      RETURN jsonb_build_object('status', 'email_has_login');
    END IF;
    IF EXISTS (SELECT 1 FROM public.club_members o WHERE o.club_id = m.club_id AND o.id <> m.id
                 AND coalesce(o.status::text, 'active') <> 'resigned' AND lower(btrim(o.email)) = v_email) THEN
      RETURN jsonb_build_object('status', 'email_in_use');
    END IF;
    UPDATE public.club_members SET email = v_email, updated_at = now() WHERE id = m.id AND user_id IS NULL;
    INSERT INTO public.audit_events (club_id, actor_label, entity_type, entity_id, action, reason, before_data, after_data)
    VALUES (m.club_id, 'tournament join link', 'club_member', m.id, 'member_email_added',
            'Player supplied email to activate their membership from tournament join link',
            jsonb_build_object('email', m.email), jsonb_build_object('email', v_email, 'tournament_id', p_champ_id));
    m.email := v_email; v_added := true;
  END IF;

  v_token := public.issue_member_activation_token(m.id, NULL, NULL, 14);
  IF v_token IS NULL THEN RETURN jsonb_build_object('status', 'not_available'); END IF;
  SELECT name, subdomain INTO c FROM public.clubs WHERE id = m.club_id;
  SELECT name INTO t FROM public.club_champs WHERE id = p_champ_id;
  RETURN jsonb_build_object('status', 'issued', 'token', v_token, 'email', lower(btrim(m.email)), 'email_added', v_added,
    'email_hint', public._tournament_join_mask_email(m.email), 'name', m.name, 'club_id', m.club_id,
    'club_name', c.name, 'club_subdomain', c.subdomain, 'tournament_name', t.name);
END $function$;

REVOKE ALL ON FUNCTION public.tournament_join_issue_activation(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tournament_join_issue_activation(uuid, uuid, text) TO service_role;