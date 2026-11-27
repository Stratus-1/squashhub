CREATE OR REPLACE FUNCTION public.tournament_join_find_member(p_champ_id uuid, p_club_id uuid, p_query text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_q text := btrim(coalesce(p_query, '')); v_rows jsonb; v_words text[];
BEGIN
  IF length(v_q) < 3 THEN RETURN '[]'::jsonb; END IF;
  IF NOT public._tournament_join_open(p_champ_id) OR NOT public._tournament_join_club_ok(p_champ_id, p_club_id) THEN
    RAISE EXCEPTION 'Entries through this link are not open';
  END IF;
  v_words := regexp_split_to_array(v_q, '\s+');
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
       AND ((SELECT bool_and(m.name ILIKE '%' || w || '%') FROM unnest(v_words) w)
            OR EXISTS (SELECT 1 FROM public.member_association_affiliations a
                        WHERE a.club_member_id = m.id AND a.active
                          AND upper(btrim(a.league_association_number)) = upper(v_q)))
     ORDER BY m.name
     LIMIT 12) s;
  RETURN v_rows;
END $function$;