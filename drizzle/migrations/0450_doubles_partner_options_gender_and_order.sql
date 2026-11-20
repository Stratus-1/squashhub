CREATE OR REPLACE FUNCTION public.list_doubles_partner_options(p_champ_id uuid, p_group_number integer, p_token text DEFAULT NULL::text, p_verify text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_me uuid; v_rows jsonb; v_kind text; v_my_gender text; v_want text;
BEGIN
  v_me := public.champ_actor_member(p_champ_id, p_token, p_verify);
  IF NOT public.champ_division_is_doubles(p_champ_id, p_group_number) THEN RETURN '[]'::jsonb; END IF;

  -- Category gender: Step-by-Step category type first, else the division gender.
  SELECT lower(COALESCE(t.beta_lifecycle -> 'category_types' ->> p_group_number::text,
                        NULLIF(t.league_genders ->> p_group_number::text, ''), t.gender, 'open'))
    INTO v_kind FROM public.tournaments t WHERE t.id = p_champ_id;
  SELECT CASE
           WHEN lower(coalesce(gender,'')) IN ('m','male','men','man','mens','men''s','gents') THEN 'm'
           WHEN lower(coalesce(gender,'')) IN ('f','female','ladies','lady','woman','women') THEN 'f'
         END INTO v_my_gender FROM public.club_members WHERE id = v_me;
  v_want := CASE
              WHEN v_kind IN ('mens','men','male','m') THEN 'm'
              WHEN v_kind IN ('ladies','women','female','f') THEN 'f'
              WHEN v_kind = 'mixed' AND v_my_gender = 'm' THEN 'f'
              WHEN v_kind = 'mixed' AND v_my_gender = 'f' THEN 'm'
            END;

  SELECT COALESCE(jsonb_agg(s.x ORDER BY s.nm), '[]'::jsonb) INTO v_rows FROM (
    SELECT m.name AS nm, jsonb_build_object(
             'member_id', m.id,
             'display_name', m.name,
             'club_id', m.club_id,
             'club_name', c.name,
             'gender', m.gender,
             'ladder_position', m.ladder_position,
             'fee_paid', public.champ_member_fee_paid(p_champ_id, m.id),
             'accepted', r.confirmed_at IS NOT NULL,
             'is_user', m.user_id IS NOT NULL,
             'has_email', COALESCE(btrim(m.email), '') <> ''
           ) AS x
      FROM public.club_champs_registrations r
      JOIN public.club_members m ON m.id = r.club_member_id
      LEFT JOIN public.clubs c ON c.id = m.club_id
     WHERE r.champ_id = p_champ_id
       AND m.id <> v_me
       AND lower(COALESCE(r.status, '')) NOT IN ('cancelled','declined','withdrawn')
       AND r.declined_at IS NULL
       AND r.invite_revoked_at IS NULL
       AND (
             p_group_number = ANY (COALESCE(r.division_choices, '{}'))
             OR (
               COALESCE(array_length(r.division_choices, 1), 0) = 0
               AND (r.invited_at IS NOT NULL OR r.confirmed_at IS NOT NULL)
             )
           )
       -- Gender match for the category; players with no gender on record still show.
       AND (
             v_want IS NULL
             OR CASE
                  WHEN lower(coalesce(m.gender,'')) IN ('m','male','men','man','mens','men''s','gents') THEN 'm'
                  WHEN lower(coalesce(m.gender,'')) IN ('f','female','ladies','lady','woman','women') THEN 'f'
                END IS NULL
             OR CASE
                  WHEN lower(coalesce(m.gender,'')) IN ('m','male','men','man','mens','men''s','gents') THEN 'm'
                  WHEN lower(coalesce(m.gender,'')) IN ('f','female','ladies','lady','woman','women') THEN 'f'
                END = v_want
           )
       AND (p_search IS NULL OR trim(p_search) = '' OR m.name ILIKE '%' || trim(p_search) || '%')
       AND NOT EXISTS (
         SELECT 1 FROM public.champ_doubles_pairs p
          WHERE p.champ_id = p_champ_id AND p.group_number = p_group_number
            AND p.status IN ('pending','awaiting_payment','confirmed')
            AND m.id IN (p.member_a, p.member_b)
       )
     ORDER BY m.name
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500)
  ) s;
  RETURN v_rows;
END $function$;