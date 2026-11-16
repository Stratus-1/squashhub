CREATE OR REPLACE FUNCTION public._tournament_join_mask_email(p_email text)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $f$
  SELECT CASE WHEN p_email IS NULL OR position('@' in p_email) < 2 THEN NULL ELSE
    left(lower(btrim(p_email)), 1) || '•••@' ||
    left(split_part(lower(btrim(p_email)), '@', 2), 1) || '•••' ||
    coalesce('.' || nullif(reverse(split_part(reverse(split_part(lower(btrim(p_email)), '@', 2)), '.', 1)), ''), '')
  END
$f$;

CREATE OR REPLACE FUNCTION public._tournament_join_can_activate(p_member_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$
  SELECT EXISTS (
    SELECT 1 FROM public.club_members m
     WHERE m.id = p_member_id AND m.user_id IS NULL
       AND coalesce(m.status::text, 'active') = 'active' AND m.role <> 'visitor'
       AND position('@' in coalesce(m.email, '')) > 1
       AND (m.person_id IS NULL OR NOT EXISTS (
             SELECT 1 FROM public.club_members o WHERE o.person_id = m.person_id AND o.user_id IS NOT NULL))
       AND NOT EXISTS (
             SELECT 1 FROM public.club_members f WHERE f.club_id = m.club_id AND f.user_id IS NOT NULL
               AND lower(btrim(f.email)) = lower(btrim(m.email))));
$f$;

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
             'email_hint', CASE WHEN m.user_id IS NULL AND public._tournament_join_can_activate(m.id)
                                THEN public._tournament_join_mask_email(m.email) END,
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

-- Server-only: issues a personal activation link for a listed member found through an open tournament join link.
CREATE OR REPLACE FUNCTION public.tournament_join_issue_activation(p_champ_id uuid, p_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE m record; v_token text; v_recent int; v_day int; c record; t record;
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
  v_token := public.issue_member_activation_token(m.id, NULL, NULL, 14);
  IF v_token IS NULL THEN RETURN jsonb_build_object('status', 'not_available'); END IF;
  SELECT name, subdomain INTO c FROM public.clubs WHERE id = m.club_id;
  SELECT name INTO t FROM public.club_champs WHERE id = p_champ_id;
  RETURN jsonb_build_object('status', 'issued', 'token', v_token, 'email', lower(btrim(m.email)),
    'email_hint', public._tournament_join_mask_email(m.email), 'name', m.name, 'club_id', m.club_id,
    'club_name', c.name, 'club_subdomain', c.subdomain, 'tournament_name', t.name);
END $function$;

REVOKE ALL ON FUNCTION public.tournament_join_issue_activation(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tournament_join_issue_activation(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public._tournament_join_can_activate(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._tournament_join_can_activate(uuid) TO service_role;